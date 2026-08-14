/**
 * EcolPro / LEARNOS — Conventions de texte de l'OCR
 * =================================================
 *
 * Deux éléments partagés par les moteurs et par les domaines qui exploitent leur
 * sortie. Isolés dans un module **sans aucune dépendance** : le domaine des
 * copies papier a besoin de la marque d'illisibilité, et il n'a aucune raison de
 * charger au passage Tesseract, sharp et pdf.js — ni de les rendre nécessaires à
 * ses tests.
 */

/**
 * Marque insérée là où le modèle n'arrive pas à lire.
 *
 * Exigée explicitement dans la consigne de transcription : un modèle de vision
 * qui ne déchiffre pas un mot en propose spontanément un plausible, et une note
 * inventée dans une marge est plus nuisible qu'une note manquante — personne ne
 * la vérifierait.
 */
export const MARQUE_ILLISIBLE = "[illisible]";

/**
 * Retire les préambules que les modèles ajoutent malgré la consigne.
 *
 * « Voici la transcription de la page : » se retrouve sinon pris pour un titre de
 * chapitre ou pour un énoncé par l'analyse qui suit. Une ligne, un problème de
 * moins.
 */
export function nettoyerTranscription(brut: string): string {
  return brut
    .split("\n")
    .filter(
      (ligne) =>
        !/^\s*(voici|here is|transcription\s*:|page\s+\d+\s*(sur|of)\s+\d+\s*:?\s*$)/i.test(
          ligne
        )
    )
    .join("\n")
    .trim();
}
