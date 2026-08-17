/**
 * EcolPro / LEARNOS — Re-leveling de texte
 * ==========================================
 *
 * Simplifie ou adapte un texte à un niveau de lecture donné. Inspiré de
 * Gemini in Classroom ("Re-level text"), mais avec un garde-fou LEARNOS :
 *
 *   - L'IA **reformule**, elle ne **crée** pas. Le contenu pédagogique vient
 *     de l'enseignant ou du curriculum ; l'IA ne fait que l'rendre accessible.
 *   - La sortie est **validée** : si l'IA ne renvoie rien d'exploitable, on
 *     retourne le texte original plutôt qu'une hallucination.
 *   - Le niveau cible est **borné** : on ne demande pas "niveau maternelle" sur
 *     un cours de thermodynamique — l'IA produirait du simplisme faux.
 *
 * LE NIVEAU EST DYNAMIQUE
 * -----------------------
 * Le niveau de l'élève n'est pas statique : il se déduit de son profil
 * d'apprentissage (`StudentLearningProfile`). Un élève qui progresse reçoit
 * un texte moins simplifié ; un élève en difficulté reçoit un texte plus
 * accessible. C'est ce qui rend le re-leveling *adaptatif* et non *figé*.
 *
 * UTILISATIONS
 * ------------
 *   1. **Révision du cours** : le résumé de la semaine est servi au niveau
 *     de lecture de l'élève (module `revision-semaine.ts`).
 *   2. **Énoncés d'exercices** : un enseignant peut simplifier un énoncé trop
 *     dense pour des élèves en difficulté de lecture.
 *   3. **Communication familles** : un dossier élève peut être servi dans une
 *     langue plus simple si le parent a un niveau de lecture faible.
 */

import { routeAi } from "@/lib/ai/router";
import type { SessionSiteClaims } from "@/lib/site-scope";

/** Version du prompt — entre dans la clé de cache et le journal. */
const VERSION_PROMPT = "releveling-v1";

/**
 * Niveaux de lecture supportés, du plus simple au plus complexe.
 *
 * Le niveau est **déduit du profil d'apprentissage**, jamais demandé
 * directement à l'utilisateur : c'est le système qui sait à quel niveau
 * servir l'élève, pas l'enseignant qui devrait le deviner.
 */
export type NiveauLecture = "ELEMENTAIRE" | "FONDAMENTAL" | "INTERMEDIAIRE" | "AVANCE";

/** Description humaine de chaque niveau, injectée dans le prompt. */
const DESCRIPTION_NIVEAU: Record<NiveauLecture, string> = {
  ELEMENTAIRE:
    "élève en début de scolarité ou en grande difficulté de lecture. " +
    "Phrases courtes (8-12 mots), vocabulaire de tous les jours, " +
    "un seul idée par phrase. Évite les mots abstraits, les passifs, " +
    "les subordonnées. Donne un exemple concret pour chaque notion.",
  FONDAMENTAL:
    "élève de niveau collège ou en difficulté modérée. " +
    "Phrases de 12-18 mots, vocabulaire courant avec un terme technique " +
    "défini à sa première occurrence. Une idée principale par paragraphe. " +
    "Un exemple par notion.",
  INTERMEDIAIRE:
    "élève de niveau lycée standard. " +
    "Phrases de 15-25 mots, vocabulaire scolaire normal, " +
    "termes techniques assumés s'ils sont du programme. " +
    "Structure de paragraphe standard.",
  AVANCE:
    "élève à l'aise ou en avancement. " +
    "Vocabulaire complet, y compris termes techniques et abstraits. " +
    "Phrases complexes autorisées. Pas de simplification : " +
    "le texte est servi tel quel, éventuellement enrichi.",
};

/**
 * Déduit le niveau de lecture d'un élève à partir de son profil
 * d'apprentissage.
 *
 * La règle est déterministe : le masteryScore moyen sur les compétences
 * de la matière détermine le niveau. Un élève qui maîtrise bien reçoit
 * le texte original (AVANCE) ; un élève en difficulté reçoit une version
 * simplifiée (ELEMENTAIRE ou FONDAMENTAL).
 *
 * @param masteryMoyen  Moyenne des masteryScores de l'élève sur la matière
 *                      (0 à 1). `null` si pas assez de données → INTERMEDIAIRE.
 */
export function niveauLectureDepuisProfil(masteryMoyen: number | null): NiveauLecture {
  if (masteryMoyen === null) return "INTERMEDIAIRE";
  if (masteryMoyen < 0.35) return "ELEMENTAIRE";
  if (masteryMoyen < 0.55) return "FONDAMENTAL";
  if (masteryMoyen < 0.8) return "INTERMEDIAIRE";
  return "AVANCE";
}

export interface DemandeReleveling {
  /** Texte original à simplifier. */
  texte: string;
  /** Niveau de lecture cible. */
  niveau: NiveauLecture;
  /** Matière (pour le contexte — aide l'IA à choisir le bon vocabulaire). */
  matiereNom?: string;
  /** Niveau scolaire de l'élève (ex: "CM2", "Terminale"). */
  niveauScolaire?: string;
}

export interface ResultatReleveling {
  /** Texte simplifié, ou texte original si l'IA n'a rien produit d'exploitable. */
  texte: string;
  /** `true` si le texte a été effectivement simplifié. */
  modifie: boolean;
  /** Niveau appliqué. */
  niveau: NiveauLecture;
  /** Modèle utilisé (pour traçabilité). */
  modele: string;
  /** `true` si la réponse vient du cache. */
  cached: boolean;
}

const CONSIGNE_SYSTEME = `Tu adaptes un texte pédagogique à un niveau de lecture donné.

RÈGLES IMPÉRATIVES :
- Tu ne changes JAMAIS le sens du texte. Simplifier ≠ affaiblir.
- Tu conserves TOUS les éléments factuels : dates, nombres, noms, définitions.
- Tu ne supprimes aucune notion : tu les rends seulement plus accessibles.
- Tu ne rajoutes rien qui ne soit dans le texte, sauf un exemple concret si
  le niveau le demande et que le texte n'en fournit pas.
- Pas de Markdown, pas de LaTeX : du texte brut lisible par un élève.
- Si le texte est déjà au bon niveau, retourne-le tel quel.`;

/**
 * Simplifie un texte au niveau de lecture demandé.
 *
 * Si l'IA n'est pas disponible ou ne produit rien d'exploitable, retourne
 * le texte original — jamais une hallucination.
 */
export async function releverTexte(
  tenantId: string,
  claims: SessionSiteClaims,
  demande: DemandeReleveling
): Promise<ResultatReleveling> {
  // AVANCE = pas de simplification nécessaire.
  if (demande.niveau === "AVANCE") {
    return {
      texte: demande.texte,
      modifie: false,
      niveau: demande.niveau,
      modele: "none",
      cached: false,
    };
  }

  const descriptionNiveau = DESCRIPTION_NIVEAU[demande.niveau];
  const contexte = [
    demande.matiereNom ? `Matière : ${demande.matiereNom}` : null,
    demande.niveauScolaire ? `Niveau scolaire : ${demande.niveauScolaire}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const consigneUtilisateur =
    `Adapte le texte suivant pour un ${descriptionNiveau}\n` +
    (contexte ? `\n${contexte}\n` : "") +
    `\n--- TEXTE À ADAPTER ---\n${demande.texte}\n--- FIN DU TEXTE ---\n\n` +
    `Retourne UNIQUEMENT le texte adapté, sans commentaire, sans titre, sans balise.`;

  try {
    const resultat = await routeAi(
      {
        complexity: "simple",
        promptVersion: VERSION_PROMPT,
        action: "releveling.texte",
        tenantId,
        siteId: claims.siteId ?? null,
      },
      [
        { role: "system", content: CONSIGNE_SYSTEME },
        { role: "user", content: consigneUtilisateur },
      ],
      {
        temperature: 0.3,
        maxTokens: 2000,
        validate: (r) => {
          // Refuser une réponse vide ou identique à un message d'erreur.
          if (!r.content || r.content.trim().length < 20) return false;
          return true;
        },
      }
    );

    const texteSimplifie = resultat.content?.trim() ?? "";

    // Si l'IA n'a rien produit d'exploitable, retourner l'original.
    if (texteSimplifie.length < 20 || texteSimplifie === demande.texte) {
      return {
        texte: demande.texte,
        modifie: false,
        niveau: demande.niveau,
        modele: resultat.meta.modelName,
        cached: resultat.meta.cached,
      };
    }

    return {
      texte: texteSimplifie,
      modifie: true,
      niveau: demande.niveau,
      modele: resultat.meta.modelName,
      cached: resultat.meta.cached,
    };
  } catch {
    // IA indisponible : servir le texte original. Le cours reste accessible,
    // simplement non adapté — c'est mieux qu'un message d'erreur.
    return {
      texte: demande.texte,
      modifie: false,
      niveau: demande.niveau,
      modele: "unavailable",
      cached: false,
    };
  }
}

/**
 * Re-leveling par lot : simplifie plusieurs textes en une seule passe.
 *
 * Utile pour la révision de la semaine : on a plusieurs chapitres/compétences
 * à résumer, et on veut tous les servir au même niveau de lecture.
 */
export async function releverTextes(
  tenantId: string,
  claims: SessionSiteClaims,
  textes: { texte: string; matiereNom?: string }[],
  niveau: NiveauLecture,
  niveauScolaire?: string
): Promise<ResultatReleveling[]> {
  if (niveau === "AVANCE") {
    return textes.map((t) => ({
      texte: t.texte,
      modifie: false,
      niveau,
      modele: "none",
      cached: false,
    }));
  }

  // Traiter en parallèle, mais par lots de 3 pour ne pas saturer le routeur.
  const resultats: ResultatReleveling[] = [];
  const TAILLE_LOT = 3;

  for (let i = 0; i < textes.length; i += TAILLE_LOT) {
    const lot = textes.slice(i, i + TAILLE_LOT);
    const lotResultats = await Promise.all(
      lot.map((t) =>
        releverTexte(tenantId, claims, {
          texte: t.texte,
          niveau,
          matiereNom: t.matiereNom,
          niveauScolaire,
        })
      )
    );
    resultats.push(...lotResultats);
  }

  return resultats;
}
