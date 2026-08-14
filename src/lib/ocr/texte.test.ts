import { describe, expect, it } from "vitest";

import { MARQUE_ILLISIBLE, nettoyerTranscription } from "@/lib/ocr/texte";

describe("nettoyerTranscription", () => {
  it("retire le préambule que les modèles ajoutent malgré la consigne", () => {
    // Sans ce ménage, « Voici la transcription : » se retrouve pris pour un
    // titre de chapitre ou pour un énoncé d'exercice.
    const propre = nettoyerTranscription(
      "Voici la transcription de la page :\nExercice 1\nCalculer 2 + 2."
    );
    expect(propre.startsWith("Exercice 1")).toBe(true);
  });

  it("retire les en-têtes de pagination ajoutés par le modèle", () => {
    expect(nettoyerTranscription("Page 1 sur 3\nChapitre 1")).toBe("Chapitre 1");
  });

  it("ne touche pas au contenu", () => {
    const contenu = "Exercice 1 (4 points)\nCalculer 1/3 + 1/4.";
    expect(nettoyerTranscription(contenu)).toBe(contenu);
  });

  it("conserve la marque d'illisibilité", () => {
    // C'est la seule information qui distingue « rien d'écrit » de « je n'ai
    // pas su lire » : la perdre ferait passer un trou pour une absence de note.
    expect(nettoyerTranscription(`Exercice 2 : ${MARQUE_ILLISIBLE}`)).toContain(
      MARQUE_ILLISIBLE
    );
  });
});
