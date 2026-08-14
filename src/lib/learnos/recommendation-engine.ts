/**
 * EcolPro / LEARNOS — Moteur de recommandation universel
 * ======================================================
 *
 * Traduit un profil de maîtrise en **une action, ou en rien du tout**.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE
 * ------------------------------------------------
 * Comparaisons de seuils, parcours de graphe, gabarits de phrases. Un LLM
 * pourra plus tard *reformuler* un motif pour un parent, mais jamais décider
 * s'il y a lieu de recommander : cette décision doit être reproductible et
 * opposable.
 *
 * QUATRE RÈGLES QUI FONT TOUT LE SYSTÈME
 * --------------------------------------
 *
 * **1. Couvrir tout le spectre.** Un élève qui maîtrise vite s'ennuie sans que
 * rien ne le signale — perte au moins aussi coûteuse qu'un décrochage, et
 * aujourd'hui totalement invisible. Les bandes hautes (`AVANCE`,
 * `EXCELLENCE`) déclenchent donc autant que les bandes basses.
 *
 * **2. Se taire au milieu.** La bande `CONSOLIDE` ne produit délibérément
 * rien. Un système qui recommande à tout le monde n'est plus lu — et devient
 * donc inutile à ceux qui en ont besoin. Ce silence est la condition de
 * l'attention portée au reste.
 *
 * **3. Ne rien dire sans preuve suffisante.** Sous le seuil de confiance,
 * aucune recommandation, quel que soit le score. Une maîtrise basse mesurée
 * par une seule interrogation n'est pas une difficulté avérée.
 *
 * **4. L'obligation se déduit de la structure du savoir.** Une bande
 * `CRITIQUE` ne devient impérative que si la compétence bloque réellement la
 * suite — mesuré sur le graphe de prérequis, non décrété par un seuil.
 */

import { Prisma, type NiveauRecommandation, type StatutRecommandation } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { DrainedEvent } from "@/lib/learnos/event-bus";
import type { NoteRecordedPayload } from "@/lib/learnos/events";
import type { EtatPrerequis } from "@/lib/learnos/learning-twin";
import { synchroniserEtapes, evaluerBesoinDePlans } from "@/lib/learnos/plan-engine";

/**
 * Valeurs par défaut — le système fonctionne sans configuration préalable.
 * Alignées sur `SEUILS_MAITRISE` du jumeau : un seul jeu de bornes, pour que
 * le statut affiché et la recommandation émise ne puissent pas se contredire.
 */
export const SEUILS_PAR_DEFAUT = {
  seuilCritique: 0.35,
  seuilFragile: 0.55,
  seuilConsolide: 0.8,
  seuilAvance: 0.92,
  confianceMinimale: 0.5,
  prerequisBloquantsMin: 2,
  // Seuils de déclenchement d'un parcours (P9-B).
  declenchementPlanCritiques: 2,
  declenchementPlanAvances: 3,
} as const;

export type Seuils = { -readonly [K in keyof typeof SEUILS_PAR_DEFAUT]: number };

/** Profondeur maximale du parcours en aval — garde-fou contre un graphe cyclique. */
const PROFONDEUR_MAX_AVAL = 5;

/**
 * Mémoïsation pour la durée d'un drainage.
 *
 * Le nombre de compétences en aval et les seuils applicables ne dépendent PAS
 * de l'élève : pour une classe de 32, ils étaient recalculés 32 fois à
 * l'identique — soit une centaine d'allers-retours inutiles à ~1 s pièce sur un
 * pooler distant. Les caches sont vidés au début de chaque drainage
 * (`reinitialiserCaches`), pour qu'une modification du curriculum soit prise en
 * compte au passage suivant.
 */
const cacheAval = new Map<string, number>();
const cacheSeuils = new Map<string, Seuils>();

export function reinitialiserCaches(): void {
  cacheAval.clear();
  cacheSeuils.clear();
}

export interface ProfilPourRecommandation {
  masteryScore: number;
  confidenceScore: number;
  trend: string;
}

/**
 * Bande correspondant à un profil, ou `null` si l'on n'en sait pas assez.
 *
 * `null` et `CONSOLIDE` ne se confondent pas : le premier signifie « nous ne
 * savons pas », le second « tout va bien ». Ils appellent des suites
 * différentes (voir `appliquerRecommandation`).
 */
export function evaluerBande(
  profil: ProfilPourRecommandation,
  seuils: Seuils
): NiveauRecommandation | null {
  if (profil.confidenceScore < seuils.confianceMinimale) return null;

  const m = profil.masteryScore;
  if (m < seuils.seuilCritique) return "CRITIQUE";
  if (m < seuils.seuilFragile) return "FRAGILE";
  if (m < seuils.seuilConsolide) return "CONSOLIDE";
  if (m < seuils.seuilAvance) return "AVANCE";
  return "EXCELLENCE";
}

/**
 * Statut par défaut d'une bande.
 *
 * Seule une compétence `CRITIQUE` qui bloque assez de compétences en aval
 * devient obligatoire. Les bandes hautes sont **toujours** de simples
 * propositions : proposer sans contraindre est ce qui rend l'enrichissement
 * acceptable pour un élève déjà à l'aise.
 */
export function statutParDefaut(
  bande: NiveauRecommandation,
  competencesBloquees: number,
  seuils: Seuils
): StatutRecommandation {
  switch (bande) {
    case "CRITIQUE":
      return competencesBloquees >= seuils.prerequisBloquantsMin
        ? "OBLIGATOIRE"
        : "RECOMMANDEE";
    case "FRAGILE":
      return "RECOMMANDEE";
    case "AVANCE":
    case "EXCELLENCE":
      return "PROPOSEE";
    case "CONSOLIDE":
      // Ne devrait jamais être atteint : la bande consolidée ne produit rien.
      return "PROPOSEE";
  }
}

export interface Formulation {
  /** Rendu français, conservé comme secours et comme trace de la décision. */
  motif: string;
  actionProposee: string;
  /** Clé de traduction (learnos.regles.*). */
  regleDeclenchee: string;
  /**
   * Paramètres de la phrase.
   *
   * C'est ce couple clé + paramètres qui rend le motif traduisible : une phrase
   * française figée en base interdirait au bot parent de s'adresser à une
   * famille en somali ou en arabe.
   */
  params: Record<string, string | number>;
}

/**
 * Motif et action, en français lisible.
 *
 * Gabarits déterministes : une recommandation qu'on ne peut pas justifier
 * devant un parent ne doit pas exister, et une justification qui change d'une
 * exécution à l'autre n'en est pas une.
 */
export function formuler(
  bande: NiveauRecommandation,
  libelleCompetence: string,
  prerequisManquants: EtatPrerequis[],
  competencesBloquees: number
): Formulation {
  const manquants = prerequisManquants.map((p) => p.libelle).join(", ");

  switch (bande) {
    case "CRITIQUE":
      if (prerequisManquants.length > 0) {
        return {
          motif:
            `« ${libelleCompetence} » n'est pas acquise, et le prérequis n'est pas en place : ` +
            `${manquants}. Reprendre la base avant d'aller plus loin.`,
          actionProposee: `Reprendre ${manquants}, puis réévaluer « ${libelleCompetence} ».`,
          regleDeclenchee: "critique_prerequis_manquant",
          params: { competence: libelleCompetence, prerequis: manquants },
        };
      }
      return {
        motif:
          `« ${libelleCompetence} » n'est pas acquise` +
          (competencesBloquees > 0
            ? `, et conditionne ${competencesBloquees} compétence(s) à venir.`
            : "."),
        actionProposee: `Reprise ciblée de « ${libelleCompetence} ».`,
        regleDeclenchee: "critique_sans_prerequis",
        params: { competence: libelleCompetence, bloquees: competencesBloquees },
      };

    case "FRAGILE":
      return {
        motif: `« ${libelleCompetence} » est en cours d'acquisition, mais reste instable.`,
        actionProposee: `Consolidation de « ${libelleCompetence} » par des exercices ciblés.`,
        regleDeclenchee: "fragile_consolidation",
        params: { competence: libelleCompetence },
      };

    case "AVANCE":
      return {
        motif: `« ${libelleCompetence} » est solidement acquise.`,
        actionProposee: `Approfondissement proposé sur « ${libelleCompetence} ».`,
        regleDeclenchee: "avance_approfondissement",
        params: { competence: libelleCompetence },
      };

    case "EXCELLENCE":
      return {
        motif: `« ${libelleCompetence} » est maîtrisée au-delà des attendus.`,
        actionProposee:
          `Défi ou tutorat sur « ${libelleCompetence} » — de quoi entretenir l'engagement.`,
        regleDeclenchee: "excellence_enrichissement",
        params: { competence: libelleCompetence },
      };

    case "CONSOLIDE":
      return {
        motif: `« ${libelleCompetence} » est acquise.`,
        actionProposee: "Aucune action nécessaire.",
        regleDeclenchee: "consolide_aucune_action",
        params: { competence: libelleCompetence },
      };
  }
}

/**
 * Résout les seuils applicables : la ligne la plus spécifique l'emporte.
 *
 * Spécificité = matière (2 points) + niveau (1 point). À égalité, la plus
 * récemment créée. Aucune ligne : valeurs par défaut.
 */
export async function resoudreSeuils(
  tenantId: string,
  contexte: { niveau?: string | null; matiereId?: string | null }
): Promise<Seuils> {
  const cle = `${tenantId}|${contexte.niveau ?? ""}|${contexte.matiereId ?? ""}`;
  const memo = cacheSeuils.get(cle);
  if (memo) return memo;

  const lignes = await prisma.seuilsRecommandation.findMany({
    where: {
      tenantId,
      OR: [{ niveau: null }, { niveau: contexte.niveau ?? undefined }],
      AND: [{ OR: [{ matiereId: null }, { matiereId: contexte.matiereId ?? undefined }] }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (lignes.length === 0) {
    const defaut = { ...SEUILS_PAR_DEFAUT };
    cacheSeuils.set(cle, defaut);
    return defaut;
  }

  const specificite = (l: { niveau: string | null; matiereId: string | null }) =>
    (l.matiereId ? 2 : 0) + (l.niveau ? 1 : 0);

  const meilleure = lignes.reduce((a, b) => (specificite(b) > specificite(a) ? b : a));

  const seuils = {
    seuilCritique: meilleure.seuilCritique,
    seuilFragile: meilleure.seuilFragile,
    seuilConsolide: meilleure.seuilConsolide,
    seuilAvance: meilleure.seuilAvance,
    confianceMinimale: meilleure.confianceMinimale,
    prerequisBloquantsMin: meilleure.prerequisBloquantsMin,
    declenchementPlanCritiques: meilleure.declenchementPlanCritiques,
    declenchementPlanAvances: meilleure.declenchementPlanAvances,
  };
  cacheSeuils.set(cle, seuils);
  return seuils;
}

/**
 * Nombre de compétences que celle-ci conditionne, directement ou non.
 *
 * Parcours transitif : si A conditionne B, et B conditionne C et D, alors A en
 * bloque trois. S'arrêter aux dépendances directes sous-estimerait gravement
 * l'urgence d'un prérequis situé bas dans la progression.
 *
 * Un ensemble de visités protège d'un graphe mal saisi comportant un cycle ;
 * la profondeur est bornée par sécurité.
 */
export async function compterCompetencesEnAval(
  tenantId: string,
  competenceId: string
): Promise<number> {
  const cle = `${tenantId}|${competenceId}`;
  const memo = cacheAval.get(cle);
  if (memo !== undefined) return memo;

  const vues = new Set<string>([competenceId]);
  let frontiere = [competenceId];

  for (let profondeur = 0; profondeur < PROFONDEUR_MAX_AVAL && frontiere.length > 0; profondeur++) {
    const suivantes = await prisma.competence.findMany({
      where: { tenantId, prerequis: { some: { id: { in: frontiere } } } },
      select: { id: true },
    });

    frontiere = suivantes.map((c) => c.id).filter((id) => !vues.has(id));
    for (const id of frontiere) vues.add(id);
  }

  // On retire la compétence de départ, présente dans `vues` dès l'amorçage.
  const total = vues.size - 1;
  cacheAval.set(cle, total);
  return total;
}

/**
 * Recalcule la recommandation d'un couple (élève, compétence).
 *
 * @returns la bande retenue, ou `null` si l'on n'en sait pas assez.
 */
export async function recalculerRecommandation(
  tenantId: string,
  eleveId: string,
  competenceId: string,
  maintenant: Date = new Date()
): Promise<NiveauRecommandation | null> {
  // `findFirst` plutôt que `findUnique` sur la clé composite : il accepte un
  // `where` non unique, donc permet d'exiger le `tenantId`. Une lecture par
  // identifiant ne se contente pas d'un identifiant.
  const profil = await prisma.studentLearningProfile.findFirst({
    where: { tenantId, eleveId, competenceId },
    select: {
      masteryScore: true, confidenceScore: true, trend: true, siteId: true,
      // Déjà calculé par le jumeau juste avant : le relire évite deux
      // requêtes identiques par compétence et par élève.
      prerequisiteStatus: true,
    },
  });
  if (!profil) return null;

  const competence = await prisma.competence.findFirst({
    where: { id: competenceId, tenantId },
    select: { libelle: true, chapitre: { select: { niveau: true, matiereId: true } } },
  });
  if (!competence) return null;

  const seuils = await resoudreSeuils(tenantId, {
    niveau: competence.chapitre?.niveau,
    matiereId: competence.chapitre?.matiereId,
  });

  const bande = evaluerBande(profil, seuils);
  const existante = await prisma.recommandation.findFirst({
    where: { tenantId, eleveId, competenceId },
    select: { id: true, statut: true },
  });

  // Rien à recommander : ni parce qu'on ne sait pas, ni parce que tout va bien.
  if (bande === null || bande === "CONSOLIDE") {
    if (!existante) return bande;

    const decideeParUnHumain =
      existante.statut === "ACCEPTEE" || existante.statut === "ECARTEE";

    if (bande === "CONSOLIDE") {
      // La compétence est acquise : on marque la recommandation résolue —
      // l'accompagnement a porté. On la conserve : cet historique dira plus
      // tard quels dispositifs fonctionnent.
      await prisma.recommandation.updateMany({
        where: { id: existante.id, tenantId },
        data: { resolueLe: maintenant, niveau: "CONSOLIDE" },
      });
    } else if (!decideeParUnHumain) {
      // Confiance retombée sous le seuil (note annulée, preuves vieillies) :
      // la recommandation n'est plus justifiée, on la retire. Une décision
      // humaine, elle, n'est jamais effacée par un recalcul.
      await prisma.recommandation.deleteMany({ where: { id: existante.id, tenantId } });
    }
    return bande;
  }

  const prerequis = (profil.prerequisiteStatus as EtatPrerequis[] | null) ?? [];
  const manquants = prerequis.filter((p) => !p.acquis);
  const bloquees = await compterCompetencesEnAval(tenantId, competenceId);

  const formulation = formuler(bande, competence.libelle, manquants, bloquees);

  // Une décision humaine survit au recalcul : sans cela, le système
  // ressusciterait indéfiniment une recommandation qu'un enseignant a écartée.
  const statut =
    existante && (existante.statut === "ACCEPTEE" || existante.statut === "ECARTEE")
      ? existante.statut
      : statutParDefaut(bande, bloquees, seuils);

  const donnees = {
    tenantId,
    siteId: profil.siteId,
    eleveId,
    competenceId,
    niveau: bande,
    statut,
    motif: formulation.motif,
    regleDeclenchee: formulation.regleDeclenchee,
    actionProposee: formulation.actionProposee,
    motifParams: formulation.params as unknown as Prisma.InputJsonValue,
    prerequisManquants:
      manquants.length > 0
        ? (manquants as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    competencesBloquees: bloquees,
    // La compétence est retombée sous le seuil : elle n'est plus résolue.
    resolueLe: null,
  };

  await prisma.recommandation.upsert({
    where: { eleveId_competenceId: { eleveId, competenceId } },
    create: donnees,
    update: donnees,
  });

  return bande;
}

/**
 * Traitement branché sur `note.recorded`, **après** le jumeau d'apprentissage.
 *
 * Comme lui, il ne redéduit pas les compétences visées : il lit les preuves
 * écrites pour cette note. Une seule logique de rattachement du début à la fin.
 */
export async function recalculerRecommandationsApresProfil(
  event: DrainedEvent
): Promise<void> {
  const p = event.payload as NoteRecordedPayload;
  if (!p?.noteId || !p.eleveId) return;

  const preuves = await prisma.learningEvidence.findMany({
    where: {
      tenantId: event.tenantId,
      sourceType: "note",
      sourceId: p.noteId,
      competenceId: { not: null },
    },
    select: { competenceId: true },
    distinct: ["competenceId"],
  });

  for (const preuve of preuves) {
    if (!preuve.competenceId) continue;
    await recalculerRecommandation(event.tenantId, p.eleveId, preuve.competenceId);
    // C'est la preuve qui valide une étape, jamais une déclaration : un élève
    // ne coche pas sa progression, il la démontre.
    await synchroniserEtapes(event.tenantId, p.eleveId, preuve.competenceId);
  }

  // Une fois les recommandations à jour, la situation d'ensemble peut justifier
  // un parcours. Proposé seulement — la validation reste humaine.
  await evaluerBesoinDePlans(event.tenantId, p.eleveId);
}
