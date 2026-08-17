/**
 * EcolPro / LEARNOS — Génération de commentaires de bulletins
 * ============================================================
 *
 * Propose des commentaires (appréciations) pour les bulletins, à partir des
 * notes et tendances de l'élève. Inspiré de Khanmigo (Report Card Comments)
 * et EdSkool (AI-powered auto-suggest), avec le garde-fou LEARNOS :
 *
 *   - L'IA **propose**, l'enseignant **valide**. Aucun commentaire n'est
 *     écrit en base sans validation humaine.
 *   - L'IA ne voit **que les données agrégées** (moyenne, tendance, rang,
 *     absences), jamais le nom ou des informations personnelles.
 *   - La sortie est **bornée** : un commentaire entre 2 et 5 lignes, dans un
 *     ton professionnel, sans jugement de valeur non pédagogique.
 *
 * TROIS TYPES DE COMMENTAIRES
 * ---------------------------
 *   1. **Par matière** : commentaire pour `BulletinMatiere.appreciation`
 *   2. **Général** : commentaire pour `Bulletin.appreciation` (synthèse)
 *   3. **Décision** : proposition pour `Bulletin.decision` (Passage, etc.)
 */

import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition } from "@/lib/ai/provider";
import type { SessionSiteClaims } from "@/lib/site-scope";

const VERSION_PROMPT = "commentaires-bulletin-v1";

/** Outil de sortie : force une structure contrôlée plutôt que du texte libre. */
const OUTIL_COMMENTAIRE: AiToolDefinition = {
  type: "function",
  function: {
    name: "proposer_commentaires",
    description:
      "Propose des commentaires pédagogiques pour un bulletin scolaire, " +
      "à partir des données agrégées de l'élève.",
    parameters: {
      type: "object",
      properties: {
        commentaireMatiere: {
          type: "string",
          description:
            "Commentaire pour une matière spécifique. 2 à 4 lignes. " +
            "Ton professionnel, bienveillant et factuel. " +
            "Commence par un constat, puis une piste d'amélioration ou un encouragement.",
        },
        commentaireGeneral: {
          type: "string",
          description:
            "Commentaire général du bulletin (synthèse toutes matières). " +
            "3 à 5 lignes. Résume le trimestre et donne une perspective.",
        },
        propositionDecision: {
          type: "string",
          enum: ["FELICITATIONS", "ENCOURAGEMENTS", "SATISFACTION", "AVERTISSEMENT", "PASSAGE", "REDOUBLEMENT", "EN_ATTENTE"],
          description:
            "Décision proposée pour le conseil de classe. " +
            "FELICITATIONS pour excellence, ENCOURAGEMENTS pour progression, " +
            "SATISFACTION pour travail correct, AVERTISSEMENT pour insuffisance, " +
            "PASSAGE pour passage normal, REDOUBLEMENT pour échec grave, " +
            "EN_ATTENTE si les données sont insuffisantes.",
        },
      },
      required: ["commentaireMatiere", "commentaireGeneral", "propositionDecision"],
    },
  },
};

export interface DonneesElevePourCommentaire {
  /** Moyenne de l'élève dans la matière (sur 20). */
  moyenneMatiere: number | null;
  /** Moyenne de la classe dans la matière (sur 20). */
  moyenneClasse: number | null;
  /** Rang de l'élève dans la matière. */
  rangMatiere: number | null;
  /** Effectif de la classe. */
  effectif: number | null;
  /** Moyenne générale de l'élève (sur 20). */
  moyenneGenerale: number | null;
  /** Heures d'absence sur la période. */
  heuresAbsence: number | null;
  /** Nom de la matière (pour le contexte). */
  matiereNom: string;
  /** Niveau scolaire (ex: "Terminale", "CM2"). */
  niveauScolaire: string;
  /** Tendance : la moyenne monte, baisse ou est stable par rapport à la période précédente. */
  tendance: "HAUSSE" | "BAISSE" | "STABLE" | "INCONNU";
  /** Nombre de notes saisies dans la matière sur la période. */
  nombreNotes: number;
}

export interface CommentairesProposes {
  commentaireMatiere: string;
  commentaireGeneral: string;
  propositionDecision: string;
  modele: string;
  cached: boolean;
}

const CONSIGNE_SYSTEME = `Tu rédiges des commentaires de bulletin scolaire pour un enseignant.

RÈGLES IMPÉRATIVES :
- Ton professionnel, bienveillant et factuel. Jamais de jugement moral.
- Tu ne dis jamais "c'est un bon élève" ou "c'est un mauvais élève" : tu décris
  le travail, les résultats, la progression.
- Commence par un constat factuel (moyenne, progression, assiduité), puis une
  piste d'amélioration ou un encouragement concret.
- 2 à 4 lignes pour le commentaire par matière, 3 à 5 lignes pour le général.
- Pas de tournures creuses ("doit continuer ses efforts") : sois spécifique
  sur CE qui doit progresser.
- Si les données sont insuffisantes (moins de 2 notes), propose un commentaire
  qui le signale honnêtement.`;

/**
 * Propose des commentaires de bulletin pour un élève, à partir de ses données
 * agrégées.
 *
 * L'IA ne voit jamais le nom de l'élève ni d'informations personnelles :
 * uniquement des chiffres et des tendances. C'est l'enseignant qui valide
 * et qui contextualise.
 */
export async function proposerCommentaires(
  tenantId: string,
  claims: SessionSiteClaims,
  donnees: DonneesElevePourCommentaire,
  actorId: string
): Promise<CommentairesProposes> {
  const descriptionDonnees = [
    `Matière : ${donnees.matiereNom}`,
    `Niveau scolaire : ${donnees.niveauScolaire}`,
    `Moyenne dans la matière : ${donnees.moyenneMatiere !== null ? `${donnees.moyenneMatiere}/20` : "non disponible"}`,
    `Moyenne de classe : ${donnees.moyenneClasse !== null ? `${donnees.moyenneClasse}/20` : "non disponible"}`,
    `Rang : ${donnees.rangMatiere !== null ? `${donnees.rangMatiere}${donnees.effectif ? `/${donnees.effectif}` : ""}` : "non disponible"}`,
    `Moyenne générale : ${donnees.moyenneGenerale !== null ? `${donnees.moyenneGenerale}/20` : "non disponible"}`,
    `Heures d'absence : ${donnees.heuresAbsence ?? 0}h`,
    `Tendance : ${donnees.tendance}`,
    `Nombre de notes dans la matière : ${donnees.nombreNotes}`,
  ].join("\n");

  const resultat = await routeAi(
    {
      complexity: "simple",
      promptVersion: VERSION_PROMPT,
      action: "bulletin.commentaire.proposer",
      tenantId,
      siteId: claims.siteId ?? null,
      actorId,
    },
    [
      { role: "system", content: CONSIGNE_SYSTEME },
      { role: "user", content: `Voici les données de l'élève pour ce trimestre :\n\n${descriptionDonnees}\n\nPropose les commentaires.` },
    ],
    {
      tools: [OUTIL_COMMENTAIRE],
      temperature: 0.5,
      maxTokens: 800,
    }
  );

  // Extraire le commentaire de l'appel d'outil.
  const appel = resultat.toolCalls.find((tc) => tc.name === "proposer_commentaires");
  if (appel) {
    try {
      const args = JSON.parse(appel.arguments) as {
        commentaireMatiere: string;
        commentaireGeneral: string;
        propositionDecision: string;
      };
      return {
        commentaireMatiere: args.commentaireMatiere,
        commentaireGeneral: args.commentaireGeneral,
        propositionDecision: args.propositionDecision,
        modele: resultat.meta.modelName,
        cached: resultat.meta.cached,
      };
    } catch {
      // JSON malformé : fallback sur le texte libre.
    }
  }

  // Fallback : si l'IA a répondu en texte libre, le servir tel quel.
  const texte = resultat.content?.trim() ?? "";
  return {
    commentaireMatiere: texte || commentaireParDefaut(donnees),
    commentaireGeneral: texte,
    propositionDecision: "EN_ATTENTE",
    modele: resultat.meta.modelName,
    cached: resultat.meta.cached,
  };
}

/**
 * Commentaire déterministe de secours quand l'IA n'est pas disponible.
 *
 * Préserve le principe LEARNOS : le système doit toujours rendre quelque
 * chose d'utile, même sans IA.
 */
function commentaireParDefaut(d: DonneesElevePourCommentaire): string {
  if (d.nombreNotes < 2) {
    return `Données insuffisantes pour ${d.matiereNom} ce trimestre. L'évaluation sera plus pertinente avec davantage de notes.`;
  }

  const m = d.moyenneMatiere;
  if (m === null) return `Travail à évaluer en ${d.matiereNom}.`;

  if (m >= 14) {
    return `Très bons résultats en ${d.matiereNom} (${m}/20). ${d.tendance === "HAUSSE" ? "Progression continue." : "Niveau solide maintenu."} Continuer ainsi.`;
  }
  if (m >= 10) {
    return `Résultats corrects en ${d.matiereNom} (${m}/20). ${d.tendance === "BAISSE" ? "Attention à la baisse, reprendre les bases." : "Des progrès sont possibles en régularité."}`;
  }
  return `Résultats insuffisants en ${d.matiereNom} (${m}/20). ${d.tendance === "BAISSE" ? "La baisse est préoccupante." : "Un soutien ciblé est nécessaire."} Reprendre les notions fondamentales.`;
}
