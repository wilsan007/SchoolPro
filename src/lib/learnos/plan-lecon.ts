/**
 * EcolPro / LEARNOS — Génération de plans de leçon
 * ==================================================
 *
 * Propose un plan de leçon structuré à partir d'une compétence, d'un niveau
 * et d'un palier. Inspiré de Gemini in Classroom, Khanmigo et Microsoft
 * Copilot (Teach), avec le garde-fou LEARNOS :
 *
 *   - L'IA **propose**, l'enseignant **ajuste et valide**.
 *   - Le plan est **structuré** (objectifs, durée, étapes, matériel, évaluation)
 *     et non du texte libre : l'enseignant doit pouvoir l'éditer champ par champ.
 *   - Le plan s'appuie sur le **curriculum existant** (compétence, prérequis)
 *     et non sur des connaissances génériques du modèle.
 *
 * WORKFLOW DE VALIDATION
 * ----------------------
 *   1. L'IA génère un plan de leçon (statut PROPOSE)
 *   2. L'enseignant le révise, ajuste les étapes, la durée, le matériel
 *   3. L'enseignant valide → le plan passe en ACTIF
 *   4. Le directeur/principal/tenant-admin peut le consulter (lecture)
 *
 * Le plan de leçon n'est jamais imposé : c'est un point de départ, pas un
 * script. L'enseignant reste maître de sa pédagogie.
 */

import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition } from "@/lib/ai/provider";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

const VERSION_PROMPT = "plan-lecon-v1";

/** Outil de sortie : structure contrôlée pour un plan de leçon. */
const OUTIL_PLAN: AiToolDefinition = {
  type: "function",
  function: {
    name: "proposer_plan_lecon",
    description:
      "Propose un plan de leçon structuré pour enseigner une compétence " +
      "à un niveau scolaire donné.",
    parameters: {
      type: "object",
      properties: {
        titre: {
          type: "string",
          description: "Titre de la leçon, clair et accrocheur.",
        },
        objectifs: {
          type: "array",
          items: { type: "string" },
          description:
            "Objectifs d'apprentissage (2 à 4). Chaque objectif commence " +
            "par un verbe d'action (identifier, calculer, rédiger…). " +
            "Alignés sur la compétence visée.",
        },
        dureeTotale: {
          type: "number",
          description: "Durée totale de la leçon en minutes (30 à 120).",
        },
        etapes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nom: { type: "string", description: "Nom de l'étape (ex: 'Introduction', 'Pratique guidée')." },
              duree: { type: "number", description: "Durée en minutes." },
              description: { type: "string", description: "Ce que fait l'enseignant et ce que font les élèves." },
              support: { type: "string", description: "Support nécessaire (tableau, fiche, vidéo, manipulation…)." },
            },
            required: ["nom", "duree", "description"],
          },
          description: "Étapes de la leçon (4 à 7). Ordre chronologique.",
        },
        materiel: {
          type: "array",
          items: { type: "string" },
          description: "Matériel nécessaire (manuel, fiches, calculatrices, etc.).",
        },
        evaluation: {
          type: "string",
          description:
            "Comment vérifier que les objectifs sont atteints à la fin de la leçon. " +
            "Une méthode concrète (questionnement, exercice rapide, ticket de sortie).",
        },
        differentiation: {
          type: "string",
          description:
            "Adaptation pour les élèves en difficulté et en avancement. " +
            "Comment différencier sans créer deux leçons.",
        },
      },
      required: ["titre", "objectifs", "dureeTotale", "etapes", "evaluation"],
    },
  },
};

export interface PlanLeconPropose {
  titre: string;
  objectifs: string[];
  dureeTotale: number;
  etapes: {
    nom: string;
    duree: number;
    description: string;
    support?: string;
  }[];
  materiel: string[];
  evaluation: string;
  differentiation?: string;
  modele: string;
  cached: boolean;
}

export interface DemandePlanLecon {
  competenceId: string;
  /** Niveau scolaire (ex: "CM2", "Terminale"). */
  niveauScolaire: string;
  /** Durée souhaitée en minutes (l'IA s'y adapte). */
  dureeSouhaitee?: number;
  /** Nombre d'élèves estimé (pour la differentiation). */
  effectif?: number;
}

const CONSIGNE_SYSTEME = `Tu rédiges un plan de leçon pour un enseignant, à partir d'une compétence du curriculum.

RÈGLES IMPÉRATIVES :
- Le plan est structuré : objectifs, étapes chronologiques, matériel, évaluation.
- Chaque objectif commence par un verbe d'action mesurable.
- Les étapes couvrent : introduction, découverte, pratique guidée, pratique autonome, synthèse.
- La durée des étapes doit sommer à la durée totale.
- L'évaluation finale doit être rapide (5-10 min) et vérifier les objectifs.
- La differentiation distingue élèves en difficulté et élèves en avancement.
- Pas de jargon pédagogique inutile : l'enseignant doit pouvoir appliquer directement.
- Pas de Markdown : texte brut.`;

/**
 * Propose un plan de leçon pour enseigner une compétence.
 *
 * L'IA reçoit le contexte du curriculum (compétence, prérequis, chapitre)
 * et génère un plan structuré. L'enseignant valide ensuite.
 */
export async function proposerPlanLecon(
  tenantId: string,
  claims: SessionSiteClaims,
  demande: DemandePlanLecon,
  actorId: string
): Promise<PlanLeconPropose> {
  // Charger le contexte du curriculum.
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
    `Compétence visée : ${competence.libelle} (${competence.code})`,
    competence.description ? `Description : ${competence.description}` : null,
    competence.prerequis.length > 0
      ? `Prérequis : ${competence.prerequis.map((p) => p.libelle).join(", ")}`
      : "Prérequis : aucun",
    `Niveau scolaire : ${demande.niveauScolaire}`,
    demande.dureeSouhaitee ? `Durée souhaitée : ${demande.dureeSouhaitee} minutes` : null,
    demande.effectif ? `Effectif estimé : ${demande.effectif} élèves` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resultat = await routeAi(
    {
      complexity: "complex",
      promptVersion: VERSION_PROMPT,
      action: "lecon.plan.proposer",
      tenantId,
      siteId: claims.siteId ?? null,
      inputRef: competence.id,
      actorId,
    },
    [
      { role: "system", content: CONSIGNE_SYSTEME },
      { role: "user", content: `Voici le contexte pour ce plan de leçon :\n\n${contexte}\n\nPropose le plan.` },
    ],
    {
      tools: [OUTIL_PLAN],
      temperature: 0.5,
      maxTokens: 1500,
    }
  );

  // Extraire le plan de l'appel d'outil.
  const appel = resultat.toolCalls.find((tc) => tc.name === "proposer_plan_lecon");
  if (appel) {
    try {
      const args = JSON.parse(appel.arguments) as PlanLeconPropose;
      return {
        ...args,
        modele: resultat.meta.modelName,
        cached: resultat.meta.cached,
      };
    } catch {
      // JSON malformé : fallback ci-dessous.
    }
  }

  // Fallback : plan minimal déterministe.
  return planParDefaut(competence.libelle, demande.dureeSouhaitee ?? 55, resultat.meta.modelName, resultat.meta.cached);
}

/**
 * Plan minimal de secours quand l'IA n'est pas disponible.
 *
 * Structure pédagogique standard : introduction → découverte → pratique → synthèse.
 */
function planParDefaut(
  libelleCompetence: string,
  duree: number,
  modele: string,
  cached: boolean
): PlanLeconPropose {
  const intro = Math.round(duree * 0.15);
  const decouverte = Math.round(duree * 0.25);
  const pratiqueGuidée = Math.round(duree * 0.25);
  const pratiqueAutonome = Math.round(duree * 0.2);
  const synthese = duree - intro - decouverte - pratiqueGuidée - pratiqueAutonome;

  return {
    titre: `Séance : ${libelleCompetence}`,
    objectifs: [`Maîtriser : ${libelleCompetence}`],
    dureeTotale: duree,
    etapes: [
      { nom: "Introduction", duree: intro, description: `Rappel des prérequis et annonce de l'objectif : ${libelleCompetence}.` },
      { nom: "Découverte", duree: decouverte, description: `Présentation de la notion avec exemples au tableau.` },
      { nom: "Pratique guidée", duree: pratiqueGuidée, description: "Exercices résolus ensemble, questions-réponses." },
      { nom: "Pratique autonome", duree: pratiqueAutonome, description: "Exercices individuels, l'enseignant circule." },
      { nom: "Synthèse", duree: synthese, description: "Récapitulatif et vérification de la compréhension." },
    ],
    materiel: ["Manuel", "Cahier", "Tableau"],
    evaluation: "Questionnement oral final sur les points clés.",
    modele,
    cached,
  };
}
