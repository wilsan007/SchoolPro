import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  mergeFilters,
  personalScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// File des corrections assistées à relire
// ------------------------------------------------------------
//
// Une seule requête, partagée par la page et par l'API : deux copies finiraient
// par diverger, et c'est précisément ainsi que l'année scolaire avait été
// oubliée dans la route (règle non négociable n°2 : une requête pédagogique sans
// filtre d'année mélange les années).

export type FiltreStatut = "A_VALIDER" | "INCERTAINE" | "TOUS";

export interface PorteeEnseignant {
  classeIds: string[];
  isRestricted: boolean;
}

const SELECT_FILE = {
  id: true,
  statut: true,
  score: true,
  maxScore: true,
  confiance: true,
  motifs: true,
  details: true,
  erreurs: true,
  explication: true,
  questionVerification: true,
  reponse: true,
  modele: true,
  // Version de la grille sous laquelle la proposition a été produite : sans
  // elle, l'écran ne peut pas comparer avec la grille actuelle de la question
  // et signaler qu'elle a changé depuis.
  grilleVersion: true,
  createdAt: true,
  eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
  question: {
    // `grille` et `grilleVersion` avec la proposition : sans elles, l'écran ne
    // peut ni afficher les critères ni signaler une grille modifiée depuis.
    select: {
      id: true,
      enonce: true,
      bareme: true,
      grille: true,
      grilleVersion: true,
      competence: { select: { libelle: true } },
    },
  },
} as const;

export type CorrectionDeLaFile = Prisma.CorrectionAssisteeGetPayload<{
  select: typeof SELECT_FILE;
}>;

/**
 * Corrections en attente, dans le périmètre de l'appelant et de l'année active.
 *
 * Les incertaines passent devant : ce sont elles qui ont le plus besoin d'un
 * regard, et une file triée par ancienneté les enterrerait.
 */
export async function chargerFileCorrections(
  tenantId: string,
  claims: SessionSiteClaims,
  portee?: PorteeEnseignant,
  statut: FiltreStatut = "TOUS"
): Promise<CorrectionDeLaFile[]> {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  return prisma.correctionAssistee.findMany({
    where: mergeFilters(
      {
        tenantId,
        statut: statut === "TOUS" ? { in: ["A_VALIDER", "INCERTAINE"] } : statut,
      },
      // L'année vient de la classe de l'élève : `CorrectionAssistee` n'a pas de
      // champ `annee`, et lui en ajouter un diverge de la classe si l'élève
      // change de classe en cours d'année.
      ...(anneeCourante || portee?.isRestricted
        ? [
            {
              eleve: {
                ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
                ...(portee?.isRestricted
                  ? {
                      classeId: {
                        in: portee.classeIds.length > 0 ? portee.classeIds : ["__none__"],
                      },
                    }
                  : {}),
              },
            },
          ]
        : []),
      siteFilterForModel("correctionAssistee", claims),
      personalScopeFilter(claims, "eleve")
    ) as Prisma.CorrectionAssisteeWhereInput,
    select: SELECT_FILE,
    orderBy: [{ statut: "desc" }, { createdAt: "asc" }],
    take: 100,
  });
}
