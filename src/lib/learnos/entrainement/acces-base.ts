import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  type SessionSiteClaims,
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
} from "@/lib/site-scope";
import { eleveDeLUtilisateur } from "@/lib/learnos/dossier-eleve";
import { composerFeuille, type OptionsSelection } from "@/lib/learnos/exercice-selector";
import { parseStructure } from "./structure-question";
import { vueEleve, type ExerciceVue, type SeanceVue } from "./vue-eleve";
import type { EtapeFaite } from "./deroule-seance";

// ------------------------------------------------------------
// Accès base — périmètre
// ------------------------------------------------------------

/**
 * Prédicat de feuille : tenant, site, ET périmètre personnel.
 *
 * Les trois, toujours. `STUDENT` et `PARENT` échappent au filtrage par site
 * (leur périmètre est relationnel) : sans `personalScopeFilter`, une route
 * ouverte aux élèves exposerait les feuilles de tout l'établissement.
 */
export function filtreFeuille(tenantId: string, claims: SessionSiteClaims) {
  return mergeFilters(
    { tenantId },
    siteFilterForModel("feuilleExercices", claims),
    personalScopeFilter(claims, "eleve")
  );
}

/**
 * Élève sur lequel porte la séance.
 *
 * Un `STUDENT` ne travaille que pour lui-même, quel que soit l'identifiant
 * qu'il envoie : accepter un `eleveId` de requête pour ce rôle laisserait un
 * élève ouvrir la séance d'un camarade. Les autres rôles (enseignant qui
 * prépare, parent qui consulte) doivent le désigner, et le filtre de périmètre
 * appliqué ensuite tranche s'ils en ont le droit.
 */
export async function eleveDeSeance(
  tenantId: string,
  claims: SessionSiteClaims & {
    userId?: string;
    id?: string;
    availableRoles?: readonly string[];
  },
  eleveIdDemande?: string | null
): Promise<string | null> {
  if (claims.role === "STUDENT") {
    // La résolution passe par `eleveDeLUtilisateur` : elle applique la
    // bascule d'un compte hybride (parent+élève incarnant l'un de ses
    // enfants) ET le recalage sur l'année active — la fiche liée au compte
    // peut être celle de l'an dernier.
    const eleve = await eleveDeLUtilisateur(tenantId, claims);
    return eleve?.id ?? null;
  }
  if (!eleveIdDemande) return null;
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: eleveIdDemande, tenantId },
      siteFilterForModel("eleve", claims),
      personalScopeFilter(claims, null)
    ),
    select: { id: true },
  });
  return eleve?.id ?? null;
}

export const SELECT_EXERCICE = {
  id: true,
  ordre: true,
  palier: true,
  competenceId: true,
  regleDeclenchee: true,
  motifParams: true,
  competence: { select: { libelle: true } },
  question: {
    select: {
      id: true, enonce: true, format: true, structure: true, bareme: true,
      // Servent à pondérer la preuve, pas à décider quoi servir : une question
      // générée non relue est servie comme les autres, elle vaut simplement
      // moins (cf. `FACTEUR_QUESTION_NON_RELUE`).
      origine: true, relueLe: true,
    },
  },
  reponse: {
    select: {
      id: true,
      etapes: true,
      tentatives: true,
      dureeMs: true,
      score: true,
      updatedAt: true,
    },
  },
} as const;

export type ExerciceCharge = Prisma.ExerciceAssigneGetPayload<{ select: typeof SELECT_EXERCICE }>;

export function etapesFaites(reponse: { etapes: unknown } | null | undefined): EtapeFaite[] {
  const brut = reponse?.etapes;
  return Array.isArray(brut) ? (brut as unknown as EtapeFaite[]) : [];
}

/**
 * Assemble la vue d'une feuille. Les exercices dont la structure est
 * inexploitable sont **omis** : mieux vaut une feuille plus courte qu'un
 * exercice sur lequel l'élève ne peut rien faire.
 */
function assembler(
  feuille: { id: string; statut: string },
  exercices: ExerciceCharge[]
): SeanceVue {
  const vues: ExerciceVue[] = [];
  for (const ex of exercices) {
    const structure = parseStructure(ex.question.structure);
    if (!structure) continue;
    vues.push(vueEleve(ex, structure, etapesFaites(ex.reponse)));
  }
  return {
    feuilleId: feuille.id,
    statut: feuille.statut,
    termine: vues.length > 0 && vues.every((v) => v.termine),
    exercices: vues,
    // Une feuille reprise n'a pas de cibles sans question : elles ont été
    // résolues à la composition, et le tirage est figé.
    ciblesSansQuestion: [],
  };
}

/**
 * Charge une séance existante, dans le périmètre de l'appelant.
 */
export async function chargerSeance(
  tenantId: string,
  feuilleId: string,
  claims: SessionSiteClaims
): Promise<SeanceVue | null> {
  const feuille = await prisma.feuilleExercices.findFirst({
    where: { id: feuilleId, ...filtreFeuille(tenantId, claims) },
    select: {
      id: true,
      statut: true,
      assigneeLe: true,
      exercices: { select: SELECT_EXERCICE, orderBy: { ordre: "asc" } },
    },
  });
  if (!feuille) return null;

  // Une feuille-jalon non signée n'atteint pas l'élève : c'est toute la raison
  // d'être du statut `PROPOSEE`.
  if (feuille.statut === "PROPOSEE" || feuille.statut === "REFUSEE") return null;

  // `assigneeLe` est LA marque de mise à disposition, et le statut ne suffit
  // pas à la remplacer : une attestation acceptée par l'enseignant est déjà
  // `ASSIGNEE` alors qu'elle attend encore d'être lancée en classe. Ne pas la
  // lister ne protège de rien — il faut qu'elle soit inouvrable, sinon un élève
  // qui connaît l'identifiant de la feuille la passe chez lui et en tire une
  // preuve estampillée « supervisée » qui ne l'a pas été.
  //
  // La règle vaut pour tous les types : entraînement et diagnostic reçoivent
  // leur date à la composition, jalon et attestation à l'ouverture par un
  // adulte. Aucune feuille légitimement accessible n'a ce champ vide.
  if (feuille.assigneeLe === null) return null;

  return assembler(feuille, feuille.exercices);
}

/**
 * Ouvre une séance d'entraînement : reprend celle qui est en cours, ou en
 * compose une nouvelle.
 *
 * La reprise passe avant la composition, et ce n'est pas un détail : sans elle,
 * un élève qui recharge sa page repartirait de zéro sur une feuille différente,
 * et la précédente resterait éternellement inachevée dans son historique.
 *
 * @returns `null` quand il n'y a rien à travailler — bande consolidée, ou
 *   banque vide sur les compétences visées. Le silence est un résultat.
 */
export async function ouvrirSeance(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  options: OptionsSelection & { nombre?: number }
): Promise<SeanceVue | null> {
  const enCours = await prisma.feuilleExercices.findFirst({
    where: {
      ...filtreFeuille(tenantId, claims),
      eleveId,
      type: "entrainement",
      statut: { in: ["ASSIGNEE", "EN_COURS"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      statut: true,
      exercices: { select: SELECT_EXERCICE, orderBy: { ordre: "asc" } },
    },
  });

  if (enCours) {
    const vue = assembler(enCours, enCours.exercices);
    // Une feuille dont tous les exercices sont faits mais restée ouverte
    // (interruption avant la clôture) ne doit pas être resservie.
    if (vue.exercices.length > 0 && !vue.termine) return vue;
  }

  const composee = await composerFeuille(tenantId, eleveId, claims, {
    ...options,
    type: "entrainement",
    autoCorrigeableUniquement: true,
  });
  if (!composee || !composee.feuilleId) return null;

  const seance = await chargerSeance(tenantId, composee.feuilleId, claims);
  if (!seance) return null;
  // Les cibles sans question sont perdues par `chargerSeance` (qui relit la
  // feuille en base) : on les reinjecte depuis la composition, seul moment
  // qui les calcule.
  return { ...seance, ciblesSansQuestion: composee.ciblesSansQuestion };
}
