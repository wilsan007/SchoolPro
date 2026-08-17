/**
 * EcolPro / LEARNOS — Génération de rubriques/grilles d'évaluation
 * =================================================================
 *
 * Propose une grille d'évaluation (rubric) structurée à partir d'une
 * compétence et d'un niveau. Inspiré de Gemini in Classroom et Khanmigo
 * (Rubric Generator), avec le garde-fou LEARNOS :
 *
 *   - L'IA **propose**, l'enseignant **valide**.
 *   - La grille est **structurée** (critères × niveaux de performance) et
 *     non du texte libre : chaque cellule est évaluable.
 *   - La grille s'appuie sur la **compétence** et ses **prérequis**, pas sur
 *     des critères génériques.
 *
 * STRUCTURE D'UNE GRILLE
 * ----------------------
 *   - **Critères** : ce qu'on évalue (ex: "Exactitude du calcul",
 *     "Clarté de la rédaction", "Respect des conventions").
 *   - **Niveaux de performance** : 4 niveaux alignés sur les bandes LEARNOS
 *     (CRITIQUE, FRAGILE, CONSOLIDE, AVANCE/EXCELLENCE).
 *   - **Descripteurs** : pour chaque critère × niveau, une description
 *     observable et mesurable.
 *   - **Points** : barème par critère.
 */

import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition } from "@/lib/ai/provider";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

const VERSION_PROMPT = "rubrique-evaluation-v1";

/** Outil de sortie : structure contrôlée pour une grille d'évaluation. */
const OUTIL_RUBRIQUE: AiToolDefinition = {
  type: "function",
  function: {
    name: "proposer_rubrique",
    description:
      "Propose une grille d'évaluation (rubric) structurée pour évaluer " +
      "une compétence à un niveau scolaire donné.",
    parameters: {
      type: "object",
      properties: {
        titre: {
          type: "string",
          description: "Titre de la grille d'évaluation.",
        },
        critères: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nom: { type: "string", description: "Nom du critère (ex: 'Maîtrise du calcul', 'Qualité de la rédaction')." },
              points: { type: "number", description: "Points maximum pour ce critère." },
              niveaux: {
                type: "object",
                properties: {
                  excellent: { type: "string", description: "Descripteur observable pour le niveau excellent (correspond à 90-100% des points)." },
                  satisfaisant: { type: "string", description: "Descripteur pour le niveau satisfaisant (70-89%)." },
                  fragile: { type: "string", description: "Descripteur pour le niveau fragile (50-69%)." },
                  insuffisant: { type: "string", description: "Descripteur pour le niveau insuffisant (< 50%)." },
                },
                required: ["excellent", "satisfaisant", "fragile", "insuffisant"],
              },
            },
            required: ["nom", "points", "niveaux"],
          },
          description: "Critères d'évaluation (3 à 6). Chaque critère a 4 niveaux de performance.",
        },
        totalPoints: {
          type: "number",
          description: "Total des points (somme des points par critère).",
        },
      },
      required: ["titre", "critères", "totalPoints"],
    },
  },
};

export interface RubriqueProposee {
  titre: string;
  critères: {
    nom: string;
    points: number;
    niveaux: {
      excellent: string;
      satisfaisant: string;
      fragile: string;
      insuffisant: string;
    };
  }[];
  totalPoints: number;
  modele: string;
  cached: boolean;
}

export interface DemandeRubrique {
  competenceId: string;
  niveauScolaire: string;
  /** Barème total souhaité (ex: 20). L'IA répartit par critère. */
  baremeTotal?: number;
}

const CONSIGNE_SYSTEME = `Tu rédiges une grille d'évaluation (rubric) pour un enseignant, à partir d'une compétence.

RÈGLES IMPÉRATIVES :
- 3 à 6 critères, pas plus : au-delà, la grille devient inutilisable en classe.
- Chaque critère est OBSERVABLE : on doit pouvoir le constater dans une copie
  ou une production, pas un sentiment général.
- Les 4 niveaux sont alignés sur les bandes de maîtrise :
  - excellent (90-100%) : maîtrise complète, autonome, transférable
  - satisfaisant (70-89%) : maîtrise solide, quelques imperfections
  - fragile (50-69%) : maîtrise partielle, erreurs significatives
  - insuffisant (< 50%) : maîtrise insuffisante, erreurs graves
- Les descripteurs sont CONCRETS : "identifie correctement les 3 étapes" est
  mieux que "comprend la notion".
- La somme des points par critère doit égaler le total.
- Pas de Markdown : texte brut.`;

/**
 * Propose une grille d'évaluation pour une compétence.
 */
export async function proposerRubrique(
  tenantId: string,
  claims: SessionSiteClaims,
  demande: DemandeRubrique,
  actorId: string
): Promise<RubriqueProposee> {
  const competence = await prisma.competence.findFirst({
    where: {
      id: demande.competenceId,
      tenantId,
      ...siteFilterForModel("competence", claims),
    },
    select: {
      id: true,
      code: true,
      libelle: true,
      description: true,
      chapitre: {
        select: { nom: true, niveau: true, matiere: { select: { nom: true } } },
      },
      prerequis: { select: { code: true, libelle: true } },
    },
  });

  if (!competence) {
    throw new Error(`Compétence ${demande.competenceId} introuvable.`);
  }

  const contexte = [
    `Matière : ${competence.chapitre.matiere.nom}`,
    `Chapitre : ${competence.chapitre.nom}`,
    `Compétence à évaluer : ${competence.libelle} (${competence.code})`,
    competence.description ? `Description : ${competence.description}` : null,
    competence.prerequis.length > 0
      ? `Prérequis : ${competence.prerequis.map((p) => p.libelle).join(", ")}`
      : null,
    `Niveau scolaire : ${demande.niveauScolaire}`,
    demande.baremeTotal ? `Barème total : ${demande.baremeTotal} points` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resultat = await routeAi(
    {
      complexity: "complex",
      promptVersion: VERSION_PROMPT,
      action: "rubrique.proposer",
      tenantId,
      siteId: claims.siteId ?? null,
      inputRef: competence.id,
      actorId,
    },
    [
      { role: "system", content: CONSIGNE_SYSTEME },
      { role: "user", content: `Voici le contexte pour cette grille d'évaluation :\n\n${contexte}\n\nPropose la grille.` },
    ],
    {
      tools: [OUTIL_RUBRIQUE],
      temperature: 0.4,
      maxTokens: 1200,
    }
  );

  const appel = resultat.toolCalls.find((tc) => tc.name === "proposer_rubrique");
  if (appel) {
    try {
      const args = JSON.parse(appel.arguments) as RubriqueProposee;
      return {
        ...args,
        modele: resultat.meta.modelName,
        cached: resultat.meta.cached,
      };
    } catch {
      // JSON malformé : fallback.
    }
  }

  return rubriqueParDefaut(competence.libelle, demande.baremeTotal ?? 20, resultat.meta.modelName, resultat.meta.cached);
}

/**
 * Grille minimale de secours quand l'IA n'est pas disponible.
 */
function rubriqueParDefaut(
  libelleCompetence: string,
  bareme: number,
  modele: string,
  cached: boolean
): RubriqueProposee {
  const pointsParCritere = Math.round(bareme / 3);
  return {
    titre: `Grille : ${libelleCompetence}`,
    critères: [
      {
        nom: "Maîtrise de la compétence",
        points: pointsParCritere,
        niveaux: {
          excellent: "Réussit toutes les tâches liées à la compétence, de manière autonome.",
          satisfaisant: "Réussit la plupart des tâches, avec quelques erreurs mineures.",
          fragile: "Réussit les tâches simples, échoue sur les tâches complexes.",
          insuffisant: "Ne démontre pas la compétence, erreurs graves.",
        },
      },
      {
        nom: "Méthode et démarche",
        points: pointsParCritere,
        niveaux: {
          excellent: "Démarche claire, structurée et justifiée.",
          satisfaisant: "Démarche correcte avec quelques imprécisions.",
          fragile: "Démarche partiellement correcte, étapes manquantes.",
          insuffisant: "Démarche incohérente ou absente.",
        },
      },
      {
        nom: "Présentation et soin",
        points: bareme - 2 * pointsParCritere,
        niveaux: {
          excellent: "Travail soigné, lisible et bien organisé.",
          satisfaisant: "Travail correct, quelques négligences.",
          fragile: "Travail brouillon, difficile à suivre.",
          insuffisant: "Travail illisible ou incomplet.",
        },
      },
    ],
    totalPoints: bareme,
    modele,
    cached,
  };
}
