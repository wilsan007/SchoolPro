/**
 * EcolPro / LEARNOS — Jumeau d'apprentissage
 * ==========================================
 *
 * Agrège les preuves accumulées sur une compétence en un **état estimé** :
 * où en est l'élève, à quel point on en est sûr, et dans quel sens ça évolue.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE
 * ------------------------------------------------
 * Moyennes pondérées, décroissance exponentielle, comparaison de deux
 * moitiés : de l'arithmétique. Y mettre un LLM coûterait de l'argent et
 * rendrait un bulletin non reproductible.
 *
 * TROIS PARTIS PRIS, QUI COMMANDENT TOUT LE RESTE
 * -----------------------------------------------
 *
 * **1. La récence pondère, elle ne pénalise pas.** Une preuve ancienne compte
 * moins qu'une preuve récente, parce qu'on estime la maîtrise *actuelle*. Mais
 * on ne baisse jamais le score au seul motif que l'élève n'a pas repratiqué :
 * ce serait inventer une régression qu'on n'a pas observée. Le vieillissement
 * se traduit par une **confiance** qui décroît, pas par une maîtrise qui chute.
 *
 * **2. Maîtrise et confiance restent séparées.** Héritée du moteur de preuves
 * (P3-B) et poursuivie ici : « il ne maîtrise pas » et « nous n'en savons pas
 * assez » appellent des réactions opposées. Les fondre en un seul chiffre
 * rendrait le système incapable de se taire quand il ne sait pas.
 *
 * **3. On ne conclut pas sur trop peu.** Sous le seuil de confiance, le statut
 * est `UNKNOWN` quel que soit le score ; sous quatre preuves, la tendance est
 * `indetermine` — et non `stable`, qui serait une conclusion.
 *
 * ISOLATION — POURQUOI PAS DE FILTRE DE SITE ICI
 * ----------------------------------------------
 * Ce module est un moteur de recalcul, appelé par le drainage de l'event bus ou
 * juste après une preuve. Il n'a pas de session : un cron n'en a pas, et lui en
 * fabriquer une serait pire que de s'en passer.
 *
 * Son unité d'isolation est le couple **(tenantId, eleveId)**, et l'`eleveId`
 * lui arrive déjà autorisé — soit par `eleveDeSeance()` (filtre de site +
 * périmètre personnel) sur la voie requête, soit par le `tenantId` de
 * l'événement drainé sur la voie de fond. Un élève appartient à un seul site :
 * une fois l'élève autorisé, ses preuves et ses profils le sont aussi.
 *
 * Les `eslint-disable ecolpro/require-site-filter` de ce fichier renvoient tous
 * ici. Ils ne valent QUE pour des requêtes bornées par un `eleveId` déjà
 * autorisé. Une lecture qui ne serait pas bornée ainsi doit porter le filtre.
 */

import { Prisma, type MasteryStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { NoteRecordedPayload } from "@/lib/learnos/events";
import { estSupervisee } from "@/lib/learnos/evidence-engine";

/**
 * Demi-vie de la pondération par récence, en jours.
 *
 * 90 jours ≈ un trimestre : une preuve du trimestre précédent pèse moitié moins
 * qu'une preuve d'aujourd'hui. Assez long pour ne pas oublier un trimestre,
 * assez court pour qu'un progrès récent se voie.
 */
export const DEMI_VIE_JOURS = 90;

/**
 * Constante de saturation de la confiance.
 *
 * Calibrée pour qu'il faille environ trois productions substantielles avant que
 * le système ne s'autorise à conclure : deux devoirs ne suffisent pas à déclarer
 * une difficulté.
 */
const SATURATION_CONFIANCE = 2.5;

/** En deçà, aucune conclusion : le statut reste `UNKNOWN`. */
export const CONFIANCE_MINIMALE = 0.5;

/** Nombre de preuves sous lequel la tendance reste indéterminée. */
const PREUVES_MIN_TENDANCE = 4;

/** Écart de maîtrise à partir duquel une évolution est jugée significative. */
const SEUIL_TENDANCE = 0.08;

/**
 * Bornes de maîtrise. Partagées avec le moteur de recommandation (P9-A) : un
 * seul jeu de seuils, pour que le statut affiché et la recommandation émise ne
 * puissent pas se contredire.
 */
export const SEUILS_MAITRISE = {
  emergent: 0.35,
  enDeveloppement: 0.55,
  acquis: 0.8,
} as const;

export type Tendance = "hausse" | "stable" | "baisse" | "indetermine";

/** Preuve réduite à ce dont le calcul a besoin. */
export interface PreuveAgregeable {
  masterySignal: number;
  confidence: number;
  weight: number;
  /**
   * Date du DEVOIR — surtout pas celle de l'écriture en base. Recalculer des
   * preuves anciennes leur donnerait sinon une fraîcheur qu'elles n'ont pas,
   * et la pondération par récence ne servirait plus à rien.
   */
  occurredAt: Date;
  /**
   * Un adulte a-t-il attesté de cette production ?
   *
   * Optionnel et vrai par défaut : toute preuve issue de l'ERP l'est. Seul
   * l'entraînement autonome pose `false`, et c'est ce qui plafonne le statut
   * (cf. `statutDeMaitrise`).
   */
  supervisee?: boolean;
}

export interface ProfilCalcule {
  masteryScore: number;
  confidenceScore: number;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  lastEvidenceAt: Date | null;
  trend: Tendance;
}

/**
 * Poids de récence : 1 aujourd'hui, 0,5 après une demi-vie, etc.
 * Une preuve datée dans le futur (saisie erronée) ne reçoit pas de bonus.
 */
export function poidsRecence(date: Date, maintenant: Date): number {
  const jours = (maintenant.getTime() - date.getTime()) / 86_400_000;
  if (jours <= 0) return 1;
  return Math.pow(0.5, jours / DEMI_VIE_JOURS);
}

/**
 * Tendance : compare la moitié récente à la moitié ancienne.
 *
 * Le découpage par rang — et non par date fixe — s'adapte au rythme réel de
 * l'établissement : une classe évaluée chaque semaine et une classe évaluée
 * deux fois par trimestre sont traitées de la même façon.
 */
function calculerTendance(preuvesTriees: PreuveAgregeable[]): Tendance {
  if (preuvesTriees.length < PREUVES_MIN_TENDANCE) return "indetermine";

  const milieu = Math.floor(preuvesTriees.length / 2);
  const anciennes = preuvesTriees.slice(0, milieu);
  const recentes = preuvesTriees.slice(milieu);

  const moyenne = (liste: PreuveAgregeable[]) => {
    const total = liste.reduce((s, p) => s + p.weight * p.confidence, 0);
    if (total <= 0) return null;
    return liste.reduce((s, p) => s + p.masterySignal * p.weight * p.confidence, 0) / total;
  };

  const avant = moyenne(anciennes);
  const apres = moyenne(recentes);
  if (avant === null || apres === null) return "indetermine";

  const ecart = apres - avant;
  if (ecart > SEUIL_TENDANCE) return "hausse";
  if (ecart < -SEUIL_TENDANCE) return "baisse";
  return "stable";
}

/**
 * Statut lisible, dérivé du score, de la confiance et de la tendance.
 *
 * `NEEDS_REVIEW` est délibérément distinct d'un score faible : il signale une
 * compétence *acquise mais qui se dégrade*, situation qui appelle une révision
 * et non une reprise depuis le début. Les confondre ferait recommencer à zéro
 * un élève qui a seulement besoin d'un rappel.
 */
export function statutDeMaitrise(
  masteryScore: number,
  confidenceScore: number,
  trend: Tendance,
  /**
   * Au moins une preuve produite sous le regard d'un adulte ?
   *
   * Défaut `true` : avant l'entraînement autonome, toutes les preuves venaient
   * de l'ERP et l'étaient. Le paramètre n'existe que pour le cas contraire.
   */
  auMoinsUnePreuveSupervisee: boolean = true
): MasteryStatus {
  if (confidenceScore < CONFIANCE_MINIMALE) return "UNKNOWN";

  if (masteryScore >= SEUILS_MAITRISE.enDeveloppement && trend === "baisse") {
    return "NEEDS_REVIEW";
  }
  // Verrou : « acquis » n'est atteignable que si quelqu'un a vu l'élève
  // produire. La faible fiabilité de l'entraînement autonome se contournerait
  // sinon par le volume — répéter vingt séances finirait par franchir le
  // seuil. Le plafond `PROFICIENT` dit exactement ce qu'on sait : les
  // exercices sont réussis, la maîtrise n'est pas attestée. C'est aussi ce qui
  // donne son sens à la feuille-jalon passée en classe.
  if (masteryScore >= SEUILS_MAITRISE.acquis) {
    return auMoinsUnePreuveSupervisee ? "MASTERED" : "PROFICIENT";
  }
  if (masteryScore >= SEUILS_MAITRISE.enDeveloppement) return "PROFICIENT";
  if (masteryScore >= SEUILS_MAITRISE.emergent) return "DEVELOPING";
  return "EMERGING";
}

/**
 * Cœur du calcul, sans base de données pour rester testable seul.
 *
 * @param maintenant injectable, afin que les tests ne dépendent pas de l'heure.
 */
export function calculerProfil(
  preuves: PreuveAgregeable[],
  maintenant: Date = new Date()
): ProfilCalcule {
  if (preuves.length === 0) {
    return {
      masteryScore: 0,
      confidenceScore: 0,
      masteryStatus: "UNKNOWN",
      evidenceCount: 0,
      lastEvidenceAt: null,
      trend: "indetermine",
    };
  }

  const triees = [...preuves].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Poids effectif = importance déclarée × fiabilité de la mesure × récence.
  const poids = triees.map(
    (p) => p.weight * p.confidence * poidsRecence(p.occurredAt, maintenant)
  );
  const poidsTotal = poids.reduce((s, w) => s + w, 0);

  // Des preuves sans poids (barème aberrant, coefficient nul) n'apprennent
  // rien : on renvoie « aucune information », pas « maîtrise nulle ».
  if (poidsTotal <= 0) {
    return {
      masteryScore: 0,
      confidenceScore: 0,
      masteryStatus: "UNKNOWN",
      evidenceCount: triees.length,
      lastEvidenceAt: triees[triees.length - 1].occurredAt,
      trend: "indetermine",
    };
  }

  const masteryScore =
    triees.reduce((s, p, i) => s + p.masterySignal * poids[i], 0) / poidsTotal;

  // Saturante : la confiance croît vite avec les premières preuves, puis
  // plafonne — la dixième apporte moins que la deuxième, et rien ne justifie
  // d'atteindre une certitude absolue.
  const confidenceScore = 1 - Math.exp(-poidsTotal / SATURATION_CONFIANCE);

  const trend = calculerTendance(triees);

  // Une preuve sans poids effectif (récence nulle, coefficient nul) ne
  // supervise rien : on ne retient que celles qui pèsent réellement, sinon un
  // devoir vieux de trois ans débloquerait `MASTERED` indéfiniment.
  const supervisee = triees.some((p, i) => p.supervisee !== false && poids[i] > 0);

  return {
    masteryScore,
    confidenceScore,
    masteryStatus: statutDeMaitrise(masteryScore, confidenceScore, trend, supervisee),
    evidenceCount: triees.length,
    lastEvidenceAt: triees[triees.length - 1].occurredAt,
    trend,
  };
}

/** État d'un prérequis, tel que stocké dans `prerequisiteStatus`. */
export interface EtatPrerequis {
  competenceId: string;
  code: string;
  libelle: string;
  masteryScore: number | null;
  acquis: boolean;
}

/**
 * Prérequis de la compétence et leur état chez cet élève.
 *
 * C'est cette information qui permettra à la recommandation (P9-A) de dire
 * *pourquoi* l'élève bloque — « les fractions ne sont pas acquises » — plutôt
 * que de constater un échec sans cause.
 */
export async function etatDesPrerequis(
  tenantId: string,
  eleveId: string,
  competenceId: string
): Promise<EtatPrerequis[]> {
  // eslint-disable-next-line ecolpro/require-site-filter -- moteur hors session, cf. en-tête « ISOLATION »
  const competence = await prisma.competence.findFirst({
    where: { id: competenceId, tenantId },
    select: {
      prerequis: { select: { id: true, code: true, libelle: true } },
    },
  });
  if (!competence || competence.prerequis.length === 0) return [];

  // eslint-disable-next-line ecolpro/require-site-filter -- borné par un eleveId autorisé, cf. en-tête « ISOLATION »
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId,
      competenceId: { in: competence.prerequis.map((c) => c.id) },
    },
    select: { competenceId: true, masteryScore: true, masteryStatus: true },
  });
  const parCompetence = new Map(profils.map((p) => [p.competenceId, p]));

  return competence.prerequis.map((prerequis) => {
    const profil = parCompetence.get(prerequis.id);
    return {
      competenceId: prerequis.id,
      code: prerequis.code,
      libelle: prerequis.libelle,
      masteryScore: profil?.masteryScore ?? null,
      // Un prérequis jamais évalué n'est PAS réputé acquis : on ne présume pas
      // d'un savoir qu'on n'a pas mesuré.
      acquis:
        profil !== undefined &&
        profil.masteryStatus !== "UNKNOWN" &&
        profil.masteryScore >= SEUILS_MAITRISE.enDeveloppement,
    };
  });
}

/**
 * Recalcule le profil d'un élève sur une compétence à partir de TOUTES ses
 * preuves.
 *
 * Recalcul intégral, et non incrémental : c'est ce qui rend l'opération
 * idempotente (la livraison des événements est « au moins une fois ») et
 * permet de corriger le passé — modifier une note et rejouer suffit à
 * réparer le profil, sans procédure de rattrapage.
 */
export async function recalculerProfil(
  tenantId: string,
  eleveId: string,
  competenceId: string,
  maintenant: Date = new Date()
): Promise<ProfilCalcule> {
  // eslint-disable-next-line ecolpro/require-site-filter -- borné par un eleveId autorisé, cf. en-tête « ISOLATION »
  const lignes = await prisma.learningEvidence.findMany({
    where: { tenantId, eleveId, competenceId },
    select: {
      masterySignal: true,
      confidence: true,
      weight: true,
      occurredAt: true,
      evidenceType: true,
    },
  });

  const preuves = lignes.map((p) => ({ ...p, supervisee: estSupervisee(p.evidenceType) }));

  const profil = calculerProfil(preuves, maintenant);
  const prerequis = await etatDesPrerequis(tenantId, eleveId, competenceId);

  // Le site vient de l'élève, seule source de vérité du rattachement.
  //
  // Traitement de fond déclenché par le drainage (cron), donc sans session :
  // aucun périmètre d'utilisateur à appliquer. L'isolation tient au `tenantId`
  // exigé ci-dessous, et à l'origine de `eleveId` — un événement publié depuis
  // une requête déjà filtrée par site. On lit d'ailleurs le site pour le
  // *poser* sur le profil, non pour décider d'un droit d'accès.
  // eslint-disable-next-line ecolpro/require-site-filter
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId },
    select: { siteId: true },
  });

  const donnees = {
    tenantId,
    siteId: eleve?.siteId ?? null,
    eleveId,
    competenceId,
    masteryScore: profil.masteryScore,
    confidenceScore: profil.confidenceScore,
    masteryStatus: profil.masteryStatus,
    evidenceCount: profil.evidenceCount,
    lastEvidenceAt: profil.lastEvidenceAt,
    trend: profil.trend,
    // `DbNull` et non `undefined` : sur une mise à jour, `undefined` signifie
    // « ne touche pas », ce qui laisserait en place des prérequis retirés
    // depuis. On veut bien vider la colonne.
    prerequisiteStatus:
      prerequis.length > 0
        ? (prerequis as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    computedAt: maintenant,
  };

  await prisma.studentLearningProfile.upsert({
    where: { eleveId_competenceId: { eleveId, competenceId } },
    create: donnees,
    update: donnees,
  });

  return profil;
}

/**
 * Traitement branché sur `note.recorded`, **après** le moteur de preuves.
 *
 * Il ne redéduit pas les compétences visées : il lit les preuves que le moteur
 * vient d'écrire pour cette note. Une seule logique de rattachement, donc aucun
 * risque de divergence entre les deux étapes.
 */
export async function recalculerProfilsApresPreuve(event: DrainedEvent): Promise<void> {
  const p = event.payload as NoteRecordedPayload;
  if (!p?.noteId || !p.eleveId) return;

  // eslint-disable-next-line ecolpro/require-site-filter -- événement drainé, borné par (tenantId, noteId), cf. en-tête « ISOLATION »
  const preuves = await prisma.learningEvidence.findMany({
    where: {
      tenantId: event.tenantId,
      sourceType: "note",
      sourceId: p.noteId,
      // Une preuve de granularité « matière » n'alimente aucun profil : un
      // profil se tient par compétence, pas par matière.
      competenceId: { not: null },
    },
    select: { competenceId: true },
    distinct: ["competenceId"],
  });

  for (const preuve of preuves) {
    if (!preuve.competenceId) continue;
    await recalculerProfil(event.tenantId, p.eleveId, preuve.competenceId);
  }
}
