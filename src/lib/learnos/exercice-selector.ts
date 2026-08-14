/**
 * EcolPro / LEARNOS — Sélecteur d'exercices adaptés
 * =================================================
 *
 * Décide **quelle compétence** un élève doit travailler maintenant, et **à quel
 * palier**, à partir de son profil de maîtrise, du graphe de prérequis, de son
 * parcours signé et de la position de sa classe dans l'année.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE
 * ------------------------------------------------
 * Le choix est un parcours de graphe et des comparaisons de seuils. Un LLM qui
 * déciderait *quoi* travailler produirait deux parcours différents pour deux
 * élèves identiques, sans qu'on puisse le justifier devant un parent. La
 * génération (P8) n'intervient qu'ensuite, pour *rédiger* l'énoncé d'une
 * question déjà choisie — et rien de ce module n'en dépend : sans banque
 * générée, le tirage se fait dans les questions saisies à la main.
 *
 * DEUX PRINCIPES QUI COMMANDENT LES RÈGLES
 * ----------------------------------------
 *
 * **1. On ne remédie pas à ce qu'on n'a pas mesuré.** Sous le seuil de
 * confiance, aucune remédiation : on *sonde*. Servir de la reprise sur un
 * profil `UNKNOWN` reviendrait à traiter l'ignorance du système comme une
 * difficulté de l'élève.
 *
 * **2. On travaille la marche accessible, pas la marche visée.** Un élève en
 * difficulté critique sur « proportionnalité » ne reçoit pas des exercices de
 * proportionnalité : il en reçoit sur les fractions, son prérequis manquant.
 * C'est la seule règle du module qui change la compétence travaillée, et c'est
 * elle qui fait la différence entre un exercice adapté et un exercice répété.
 *
 * RIEN N'EST ÉCRIT EN CLAIR
 * -------------------------
 * Chaque exercice servi porte une clé `learnos.regles.exercice_*` et ses
 * paramètres, jamais une phrase française figée — même patron que
 * `Recommandation`. Un élève doit pouvoir lire pourquoi il a cet exercice dans
 * la langue de sa famille.
 */

import type { PalierExercice, Prisma, StatutFeuille } from "@prisma/client";
import prisma from "@/lib/prisma";
import { type SessionSiteClaims, siteFilterForModel } from "@/lib/site-scope";
import { type EtatPrerequis } from "@/lib/learnos/learning-twin";
import {
  SEUILS_PAR_DEFAUT,
  resoudreSeuils,
  type Seuils,
} from "@/lib/learnos/recommendation-engine";
import { ANTICIPATION_SEMAINES, semaineScolaire } from "@/lib/learnos/planification";
import { FORMATS_AUTO_CORRIGEABLES } from "@/lib/learnos/formats";

// ------------------------------------------------------------
// Cœur déterministe — sans base de données, testable seul
// ------------------------------------------------------------

/**
 * Règles de sélection. Le nom est la clé de traduction
 * (`learnos.regles.<nom>`), et non un libellé : voir l'en-tête du fichier.
 */
export type RegleExercice =
  | "exercice_reprise_prerequis"
  | "exercice_prerequis_avant_chapitre"
  | "exercice_etape_plan"
  | "exercice_reprise_critique"
  | "exercice_consolidation_fragile"
  | "exercice_sondage"
  | "exercice_approfondissement";

/**
 * Rang de priorité, 1 = servi en premier.
 *
 * L'ordre n'est pas arbitraire : il va du plus contraint au plus optionnel.
 * Un chapitre qui démarre dans deux semaines impose une échéance ; une étape
 * signée par un enseignant engage l'établissement ; l'approfondissement, lui,
 * peut toujours attendre la feuille suivante.
 *
 * `exercice_reprise_prerequis` n'y figure pas : la descente sur prérequis
 * conserve la priorité de la règle qui l'a déclenchée (voir `cibler`), sans
 * quoi réparer une base urgente passerait après une consolidation ordinaire.
 */
export const PRIORITE_REGLE: Record<Exclude<RegleExercice, "exercice_reprise_prerequis">, number> = {
  exercice_prerequis_avant_chapitre: 1,
  exercice_etape_plan: 2,
  exercice_reprise_critique: 3,
  exercice_consolidation_fragile: 4,
  exercice_sondage: 5,
  exercice_approfondissement: 6,
};

/** Ce que le sélecteur sait d'une compétence, pour UN élève, à UN instant. */
export interface ContexteCompetence {
  competenceId: string;
  libelle: string;

  /** `null` = jamais mesurée. Distinct d'un score de 0, qui est une mesure. */
  masteryScore: number | null;
  confidenceScore: number | null;

  /**
   * Prérequis non acquis, **du moins maîtrisé au plus**. L'ordre porte la
   * décision : la descente prend le premier, c'est-à-dire la marche la plus
   * basse encore manquante.
   */
  prerequisManquants: EtatPrerequis[];

  /** Étape d'un parcours validé qui porte cette compétence. */
  etapePlan: { id: string; echeance: Date | null } | null;

  /** Le chapitre qui l'enseigne est en cours cette semaine. */
  chapitreEnCours: boolean;

  /**
   * Semaines avant le démarrage d'un chapitre qui l'exige comme prérequis.
   * `null` = aucun chapitre à venir n'en dépend dans la fenêtre d'anticipation.
   */
  semainesAvantChapitreDependant: number | null;
  /** Nom de ce chapitre, pour le motif affiché. */
  chapitreDependant: string | null;
}

export interface CibleExercice {
  /** Compétence RÉELLEMENT travaillée — pas toujours celle qui a déclenché. */
  competenceId: string;
  /** Compétence visée quand elle diffère de celle travaillée, sinon `null`. */
  competenceViseeId: string | null;
  palier: PalierExercice;
  regleDeclenchee: RegleExercice;
  /** Paramètres de la phrase traduite. Aucune chaîne de langue ici. */
  motifParams: Record<string, string | number>;
  priorite: number;
}

/**
 * Palier accessible à un niveau de maîtrise donné.
 *
 * Les bornes sont celles des bandes de recommandation, délibérément : le palier
 * servi et la bande affichée ne peuvent pas se contredire. Un élève déclaré
 * « fragile » ne recevra jamais du transfert.
 */
export function palierPour(masteryScore: number, seuils: Seuils = SEUILS_PAR_DEFAUT): PalierExercice {
  if (masteryScore < seuils.seuilCritique) return "RESTITUTION";
  if (masteryScore < seuils.seuilFragile) return "APPLICATION";
  if (masteryScore < seuils.seuilConsolide) return "CONSOLIDATION";
  if (masteryScore < seuils.seuilAvance) return "TRANSFERT";
  return "OUVERTURE";
}

/**
 * Construit la cible, en appliquant la descente sur prérequis si la maîtrise
 * est critique et qu'une base manque.
 *
 * La descente **remplace la règle** plutôt que de s'ajouter à elle : ce que
 * l'élève doit comprendre, c'est qu'on répare une base — la circonstance qui a
 * révélé le manque passe en paramètre (`visee`). Une clé par combinaison
 * règle × descente aurait multiplié les messages sans rien clarifier.
 */
function cibler(
  ctx: ContexteCompetence,
  regle: Exclude<RegleExercice, "exercice_reprise_prerequis">,
  seuils: Seuils,
  params: Record<string, string | number>
): CibleExercice {
  const score = ctx.masteryScore ?? 0;
  const priorite = PRIORITE_REGLE[regle];

  const base = score < seuils.seuilCritique ? ctx.prerequisManquants[0] : undefined;
  if (base) {
    return {
      competenceId: base.competenceId,
      competenceViseeId: ctx.competenceId,
      // Le palier suit la maîtrise du PRÉREQUIS, pas celle de la compétence
      // visée : c'est lui qu'on travaille.
      palier: palierPour(base.masteryScore ?? 0, seuils),
      regleDeclenchee: "exercice_reprise_prerequis",
      motifParams: { competence: base.libelle, visee: ctx.libelle },
      priorite,
    };
  }

  return {
    competenceId: ctx.competenceId,
    competenceViseeId: null,
    palier: palierPour(score, seuils),
    regleDeclenchee: regle,
    motifParams: params,
    priorite,
  };
}

/**
 * Cible pour une compétence, ou `null` s'il n'y a rien à servir.
 *
 * Le `null` de la bande consolidée est un choix, pas un oubli : un dispositif
 * qui donne des exercices à tout le monde sur tout n'est plus lu. C'est le même
 * silence que celui du moteur de recommandation, pour la même raison.
 */
export function evaluerCible(
  ctx: ContexteCompetence,
  seuils: Seuils = SEUILS_PAR_DEFAUT
): CibleExercice | null {
  const mesuree =
    ctx.masteryScore !== null &&
    ctx.confidenceScore !== null &&
    ctx.confidenceScore >= seuils.confianceMinimale;

  // --- On ne sait pas assez : sonder, jamais remédier. ---
  if (!mesuree) {
    // Sonder n'a de sens que sur ce qui est enseigné maintenant, ou sur ce
    // dont on aura besoin dans quelques semaines. Ailleurs, c'est du bruit.
    if (!ctx.chapitreEnCours && ctx.semainesAvantChapitreDependant === null) return null;
    return {
      competenceId: ctx.competenceId,
      competenceViseeId: null,
      // Palier neutre : on mesure, on ne traite pas. Descendre en restitution
      // fabriquerait une réussite qui n'apprendrait rien sur le niveau réel.
      palier: "APPLICATION",
      regleDeclenchee: "exercice_sondage",
      motifParams: { competence: ctx.libelle },
      priorite: PRIORITE_REGLE.exercice_sondage,
    };
  }

  const score = ctx.masteryScore as number;

  // --- 1. Un chapitre arrive et s'appuie là-dessus. ---
  if (ctx.semainesAvantChapitreDependant !== null && score < seuils.seuilFragile) {
    return cibler(ctx, "exercice_prerequis_avant_chapitre", seuils, {
      competence: ctx.libelle,
      chapitre: ctx.chapitreDependant ?? "",
      semaines: ctx.semainesAvantChapitreDependant,
    });
  }

  // --- 2. Une étape que l'enseignant a signée. ---
  if (ctx.etapePlan) {
    return cibler(ctx, "exercice_etape_plan", seuils, { competence: ctx.libelle });
  }

  // --- 3 & 4. Ce qui est enseigné en ce moment et ne tient pas. ---
  if (ctx.chapitreEnCours && score < seuils.seuilCritique) {
    return cibler(ctx, "exercice_reprise_critique", seuils, { competence: ctx.libelle });
  }
  if (ctx.chapitreEnCours && score < seuils.seuilFragile) {
    return cibler(ctx, "exercice_consolidation_fragile", seuils, { competence: ctx.libelle });
  }

  // --- 6. Le haut du spectre compte autant que le bas. ---
  if (ctx.chapitreEnCours && score >= seuils.seuilAvance) {
    return cibler(ctx, "exercice_approfondissement", seuils, { competence: ctx.libelle });
  }

  // Bande consolidée, ou compétence hors du programme du moment : rien.
  return null;
}

/**
 * Retient les `nombre` meilleures cibles.
 *
 * Une compétence n'apparaît qu'une fois : une feuille qui servirait trois
 * exercices sur la même notion épuiserait l'élève sans élargir la mesure.
 *
 * Le tri est **total** — priorité, puis palier, puis identifiant — pour que la
 * même entrée produise toujours la même feuille. Sans le dernier critère, deux
 * exécutions pourraient diverger sur des cibles à égalité, et une feuille ne
 * serait plus reproductible lors d'une contestation.
 */
export function composerSelection(cibles: CibleExercice[], nombre: number): CibleExercice[] {
  if (nombre <= 0) return [];

  const parCompetence = new Map<string, CibleExercice>();
  for (const cible of cibles) {
    const existante = parCompetence.get(cible.competenceId);
    if (!existante || cible.priorite < existante.priorite) {
      parCompetence.set(cible.competenceId, cible);
    }
  }

  const ordre: PalierExercice[] = [
    "RESTITUTION",
    "APPLICATION",
    "CONSOLIDATION",
    "TRANSFERT",
    "OUVERTURE",
  ];

  return [...parCompetence.values()]
    .sort(
      (a, b) =>
        a.priorite - b.priorite ||
        ordre.indexOf(a.palier) - ordre.indexOf(b.palier) ||
        a.competenceId.localeCompare(b.competenceId)
    )
    .slice(0, nombre);
}

/**
 * Palier de repli quand la banque est vide au palier demandé.
 *
 * On descend, jamais on ne monte : servir plus facile fait perdre du temps,
 * servir plus dur met l'élève en échec sur un exercice qu'on a choisi pour lui.
 */
export function paliersDeRepli(palier: PalierExercice): PalierExercice[] {
  const ordre: PalierExercice[] = [
    "RESTITUTION",
    "APPLICATION",
    "CONSOLIDATION",
    "TRANSFERT",
    "OUVERTURE",
  ];
  const i = ordre.indexOf(palier);
  return ordre.slice(0, i + 1).reverse();
}

// ------------------------------------------------------------
// Lecture du contexte — base de données
// ------------------------------------------------------------

export interface OptionsSelection {
  anneeId: string;
  /** Restreint à une matière. Une feuille sans matière n'a pas de responsable. */
  matiereId?: string | null;
  aujourdHui?: Date;
  /** Fenêtre d'anticipation, en semaines. */
  fenetre?: number;
}

/**
 * Rassemble, pour un élève, l'état de toutes les compétences de son niveau.
 *
 * Une seule passe de lectures groupées plutôt qu'une requête par compétence :
 * la composition tourne pour une classe entière, et un aller-retour par
 * compétence multiplierait par trente le coût sur un pooler distant.
 */
export async function contextesPourEleve(
  tenantId: string,
  eleveId: string,
  /**
   * Périmètre de l'appelant. Exigé et non optionnel : cette fonction lit le
   * profil nominatif d'un élève, et un paramètre facultatif qu'on oublie de
   * passer produirait exactement la fuite que l'isolation par site empêche.
   */
  claims: SessionSiteClaims,
  options: OptionsSelection
): Promise<ContexteCompetence[]> {
  const aujourdHui = options.aujourdHui ?? new Date();
  const fenetre = options.fenetre ?? ANTICIPATION_SEMAINES;

  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", claims) },
    select: { id: true, classeId: true, classe: { select: { niveau: true } } },
  });
  if (!eleve?.classe) return [];

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: options.anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) return [];

  const semaineCourante = semaineScolaire(aujourdHui, annee.dateDebut);

  // Chapitres du niveau, avec leurs compétences et les prérequis de celles-ci.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId,
      niveau: eleve.classe.niveau,
      ...(options.matiereId ? { matiereId: options.matiereId } : {}),
      ...siteFilterForModel("chapitre", claims),
    },
    select: {
      id: true,
      nom: true,
      competences: {
        select: {
          id: true,
          libelle: true,
          prerequis: { select: { id: true, code: true, libelle: true } },
        },
      },
    },
  });
  if (chapitres.length === 0) return [];

  // Où en est la classe : chapitre en cours, chapitres imminents.
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId: options.anneeId,
      chapitreId: { in: chapitres.map((c) => c.id) },
      // `null` = planification de niveau, applicable à toutes les classes.
      OR: [{ classeId: eleve.classeId }, { classeId: null }],
      ...siteFilterForModel("planificationChapitre", claims),
    },
    select: { chapitreId: true, classeId: true, statut: true, semaineDebut: true },
  });

  // La planification propre à la classe l'emporte sur celle du niveau.
  const parChapitre = new Map<string, (typeof planifications)[number]>();
  for (const p of planifications) {
    const existante = parChapitre.get(p.chapitreId);
    if (!existante || (existante.classeId === null && p.classeId !== null)) {
      parChapitre.set(p.chapitreId, p);
    }
  }

  // Toutes les compétences en jeu : celles des chapitres du niveau ET leurs
  // prérequis, qui peuvent appartenir à un chapitre d'une année antérieure.
  const competences = new Map<string, { libelle: string; prerequis: EtatPrerequis[] }>();
  const chapitreDeCompetence = new Map<string, string>();
  for (const chapitre of chapitres) {
    for (const c of chapitre.competences) {
      chapitreDeCompetence.set(c.id, chapitre.id);
      competences.set(c.id, {
        libelle: c.libelle,
        prerequis: c.prerequis.map((q) => ({
          competenceId: q.id,
          code: q.code,
          libelle: q.libelle,
          masteryScore: null,
          acquis: false,
        })),
      });
    }
  }

  const tousIds = new Set<string>(competences.keys());
  for (const { prerequis } of competences.values()) {
    for (const q of prerequis) tousIds.add(q.competenceId);
  }

  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      eleveId,
      competenceId: { in: [...tousIds] },
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      competenceId: true,
      masteryScore: true,
      confidenceScore: true,
      masteryStatus: true,
    },
  });
  const profilDe = new Map(profils.map((p) => [p.competenceId, p]));

  // Étapes restant à faire sur les parcours engagés. Un plan `PROPOSE` n'en
  // fournit pas : tant que personne n'a signé, rien ne doit atteindre l'élève.
  const etapes = await prisma.etapePlan.findMany({
    where: {
      competenceId: { in: [...tousIds] },
      statut: { in: ["A_FAIRE", "EN_COURS"] },
      plan: {
        tenantId,
        eleveId,
        statut: { in: ["ACTIF", "EN_REVUE"] },
      },
      // `EtapePlan` n'a pas de colonne `siteId` : son rattachement passe par le
      // plan (`{ one: "plan" }` dans site-scope). Le fragment est enveloppé
      // dans `AND`, il se juxtapose donc au `plan` ci-dessus au lieu de
      // l'écraser — contrairement à un filtre imbriqué à la main, que la règle
      // de lint ne peut pas voir et qu'un étalement ultérieur effacerait.
      ...siteFilterForModel("etapePlan", claims),
    },
    select: { id: true, competenceId: true, echeance: true },
    orderBy: { echeance: "asc" },
  });
  const etapeDe = new Map(etapes.map((e) => [e.competenceId, e]));

  // Chapitres à venir dans la fenêtre, et prérequis externes qu'ils exigent.
  const dependanceDe = new Map<string, { semaines: number; chapitre: string }>();
  for (const chapitre of chapitres) {
    const plan = parChapitre.get(chapitre.id);
    if (!plan || plan.statut !== "PREVU") continue;
    const semaines = plan.semaineDebut - semaineCourante;
    if (semaines <= 0 || semaines > fenetre) continue;

    const internes = new Set(chapitre.competences.map((c) => c.id));
    for (const c of chapitre.competences) {
      for (const q of c.prerequis) {
        if (internes.has(q.id)) continue;
        const connu = dependanceDe.get(q.id);
        // Le chapitre le plus proche l'emporte : c'est lui qui fixe l'échéance.
        if (!connu || semaines < connu.semaines) {
          dependanceDe.set(q.id, { semaines, chapitre: chapitre.nom });
        }
      }
    }
  }

  const seuilAcquis = SEUILS_PAR_DEFAUT.seuilFragile;

  return [...competences.entries()].map(([competenceId, { libelle, prerequis }]) => {
    const profil = profilDe.get(competenceId);
    const chapitreId = chapitreDeCompetence.get(competenceId);
    const plan = chapitreId ? parChapitre.get(chapitreId) : undefined;
    const dependance = dependanceDe.get(competenceId);

    // Prérequis dont on SAIT qu'ils ne sont pas en place, du moins maîtrisé au
    // plus : la descente prend le premier.
    //
    // Un prérequis non mesuré — jamais évalué, ou évalué trop peu pour conclure
    // (`UNKNOWN`) — n'est ni acquis ni manquant. L'exclure des deux camps est
    // délibéré : le compter comme manquant enverrait l'élève réviser une notion
    // qu'il maîtrise peut-être, et le compter comme acquis masquerait un
    // blocage réel. C'est au sondage de lever le doute, pas à la descente.
    const manquants = prerequis
      .map((q) => {
        const p = profilDe.get(q.competenceId);
        const mesure = p !== undefined && p.masteryStatus !== "UNKNOWN";
        return {
          ...q,
          masteryScore: mesure ? p.masteryScore : null,
          acquis: mesure && p.masteryScore >= seuilAcquis,
        };
      })
      .filter((q) => q.masteryScore !== null && !q.acquis)
      .sort((a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0));

    return {
      competenceId,
      libelle,
      masteryScore: profil?.masteryScore ?? null,
      confidenceScore: profil?.confidenceScore ?? null,
      prerequisManquants: manquants,
      etapePlan: etapeDe.get(competenceId)
        ? { id: etapeDe.get(competenceId)!.id, echeance: etapeDe.get(competenceId)!.echeance }
        : null,
      chapitreEnCours: plan?.statut === "EN_COURS",
      semainesAvantChapitreDependant: dependance?.semaines ?? null,
      chapitreDependant: dependance?.chapitre ?? null,
    };
  });
}

/** Cibles retenues pour un élève, prêtes à être servies. */
export async function ciblesPourEleve(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  options: OptionsSelection & { nombre?: number }
): Promise<CibleExercice[]> {
  const contextes = await contextesPourEleve(tenantId, eleveId, claims, options);
  if (contextes.length === 0) return [];

  const seuils = await resoudreSeuils(tenantId, { matiereId: options.matiereId ?? null });

  const cibles = contextes
    .map((ctx) => evaluerCible(ctx, seuils))
    .filter((c): c is CibleExercice => c !== null);

  return composerSelection(cibles, options.nombre ?? 5);
}

// ------------------------------------------------------------
// Composition de la feuille
// ------------------------------------------------------------

export type TypeFeuille = "entrainement" | "diagnostic" | "jalon" | "attestation";

/**
 * Feuilles qui engagent l'établissement, et n'atteignent donc l'élève qu'après
 * signature d'un enseignant.
 *
 * Le jalon clôt une étape de parcours ; l'attestation convertit du travail fait
 * seul en preuve supervisée. Dans les deux cas, une feuille auto-assignée
 * n'attesterait rien de plus que ce qu'elle est censée confirmer.
 */
const TYPES_A_SIGNER: readonly TypeFeuille[] = ["jalon", "attestation"];

/**
 * Les feuilles d'entraînement et de diagnostic se servent seules — exiger une
 * validation à chaque cycle d'entraînement ferait abandonner le dispositif
 * avant la fin du trimestre.
 */
export function statutInitial(type: TypeFeuille): StatutFeuille {
  return TYPES_A_SIGNER.includes(type) ? "PROPOSEE" : "ASSIGNEE";
}

export interface FeuilleComposee {
  feuilleId: string;
  statut: StatutFeuille;
  exercices: { competenceId: string; questionId: string; regleDeclenchee: RegleExercice }[];
  /** Cibles retenues pour lesquelles la banque n'avait aucune question. */
  ciblesSansQuestion: { competenceId: string; palier: PalierExercice }[];
}

/**
 * Compose et enregistre une feuille pour un élève.
 *
 * La feuille est **figée** : elle garde ce que le sélecteur a décidé ce jour-là
 * et les motifs qui l'y ont conduit. Recomposer à chaque affichage rendrait
 * impossible de répondre à « pourquoi mon fils a-t-il eu ces exercices ? ».
 */
export async function composerFeuille(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  options: OptionsSelection & {
    type: TypeFeuille;
    nombre?: number;
    /** Étape attestée, obligatoire pour une feuille-jalon. */
    etapePlanId?: string | null;
    /**
     * Restreint le tirage aux formats corrigeables sans enseignant.
     *
     * Obligatoire pour l'entraînement autonome : servir une question de
     * rédaction à un élève qui travaille seul produirait une copie que personne
     * ne relèvera jamais — et une feuille éternellement inachevée.
     */
    autoCorrigeableUniquement?: boolean;
  }
): Promise<FeuilleComposee | null> {
  if (options.type === "jalon" && !options.etapePlanId) {
    throw new Error(
      "composerFeuille: une feuille-jalon doit désigner l'étape qu'elle atteste (etapePlanId)."
    );
  }

  const cibles = await ciblesPourEleve(tenantId, eleveId, claims, options);
  if (cibles.length === 0) return null;

  // Questions déjà servies à cet élève : on ne resert pas le même énoncé tant
  // que la banque en propose d'autres. Répéter à l'identique mesure la mémoire
  // de l'exercice, pas la maîtrise de la compétence.
  const dejaServies = await prisma.exerciceAssigne.findMany({
    where: { feuille: { tenantId, eleveId, ...siteFilterForModel("feuilleExercices", claims) } },
    select: { questionId: true },
  });
  const vues = new Set(dejaServies.map((e) => e.questionId));

  const banque = await prisma.question.findMany({
    where: {
      tenantId,
      actif: true,
      competenceId: { in: cibles.map((c) => c.competenceId) },
      ...(options.autoCorrigeableUniquement
        ? { format: { in: [...FORMATS_AUTO_CORRIGEABLES] } }
        : {}),
      ...siteFilterForModel("question", claims),
    },
    select: { id: true, competenceId: true, palier: true },
    // Tri stable : à banque identique, la même feuille est composée deux fois.
    orderBy: { id: "asc" },
  });

  const retenus: { cible: CibleExercice; questionId: string }[] = [];
  const sansQuestion: FeuilleComposee["ciblesSansQuestion"] = [];
  const prises = new Set<string>();

  for (const cible of cibles) {
    const candidates = banque.filter(
      (q) => q.competenceId === cible.competenceId && !prises.has(q.id)
    );

    let choisie: string | undefined;
    for (const palier of paliersDeRepli(cible.palier)) {
      const auPalier = candidates.filter((q) => q.palier === palier);
      // D'abord une question jamais vue ; à défaut, la plus ancienne du palier.
      choisie = (auPalier.find((q) => !vues.has(q.id)) ?? auPalier[0])?.id;
      if (choisie) break;
    }

    if (!choisie) {
      // Banque vide sur cette compétence : on n'invente pas d'exercice, et on
      // le fait remonter pour que quelqu'un alimente la banque.
      sansQuestion.push({ competenceId: cible.competenceId, palier: cible.palier });
      continue;
    }

    prises.add(choisie);
    retenus.push({ cible, questionId: choisie });
  }

  if (retenus.length === 0) {
    return {
      feuilleId: "",
      statut: statutInitial(options.type),
      exercices: [],
      ciblesSansQuestion: sansQuestion,
    };
  }

  // Le site vient de l'élève, seule source de vérité du rattachement — on le
  // lit pour le *poser* sur la feuille, non pour décider d'un droit d'accès
  // (déjà tranché par le filtre appliqué à la lecture de l'élève ci-dessus).
  // eslint-disable-next-line ecolpro/require-site-filter
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId },
    select: { siteId: true },
  });

  const statut = statutInitial(options.type);

  const feuille = await prisma.feuilleExercices.create({
    data: {
      tenantId,
      siteId: eleve?.siteId ?? null,
      eleveId,
      matiereId: options.matiereId ?? null,
      type: options.type,
      statut,
      etapePlanId: options.etapePlanId ?? null,
      // Une feuille en attente de signature n'est pas assignée : la date reste
      // vide jusqu'à `validerFeuille`.
      assigneeLe: statut === "ASSIGNEE" ? (options.aujourdHui ?? new Date()) : null,
      exercices: {
        create: retenus.map(({ cible, questionId }, i) => ({
          questionId,
          competenceId: cible.competenceId,
          competenceViseeId: cible.competenceViseeId,
          ordre: i + 1,
          palier: cible.palier,
          regleDeclenchee: cible.regleDeclenchee,
          motifParams: cible.motifParams as unknown as Prisma.InputJsonValue,
          priorite: cible.priorite,
        })),
      },
    },
    select: { id: true },
  });

  return {
    feuilleId: feuille.id,
    statut,
    exercices: retenus.map(({ cible, questionId }) => ({
      competenceId: cible.competenceId,
      questionId,
      regleDeclenchee: cible.regleDeclenchee,
    })),
    ciblesSansQuestion: sansQuestion,
  };
}

/**
 * Signature d'une feuille-jalon : c'est elle, et rien d'autre, qui la fait
 * atteindre l'élève.
 *
 * `valideParId` n'est pas optionnel. Une feuille qui atteste une étape de
 * parcours sans qu'un enseignant l'ait signée serait indéfendable devant un
 * parent — c'est le même garde-fou que sur `PlanProgression`.
 */
export async function validerFeuille(
  tenantId: string,
  feuilleId: string,
  valideParId: string,
  claims: SessionSiteClaims,
  maintenant: Date = new Date()
): Promise<void> {
  if (!valideParId) {
    throw new Error("validerFeuille: la signature d'un enseignant est obligatoire.");
  }

  const feuille = await prisma.feuilleExercices.findFirst({
    where: { id: feuilleId, tenantId, ...siteFilterForModel("feuilleExercices", claims) },
    select: { id: true, statut: true },
  });
  if (!feuille) throw new Error("validerFeuille: feuille introuvable.");
  if (feuille.statut !== "PROPOSEE") {
    throw new Error(`validerFeuille: feuille déjà ${feuille.statut}, rien à valider.`);
  }

  await prisma.feuilleExercices.update({
    where: { id: feuille.id },
    data: {
      statut: "ASSIGNEE",
      valideParId,
      valideeLe: maintenant,
      assigneeLe: maintenant,
    },
  });
}
