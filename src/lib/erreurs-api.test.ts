/**
 * Garde-fou de traduction des erreurs d'API.
 *
 * Ajouter un code au catalogue sans sa clé de traduction ne casse ni la
 * compilation ni le lint : l'utilisateur verrait simplement le repli français,
 * en silence, quelle que soit sa langue. Ce test transforme cet oubli en échec.
 */

import { describe, expect, it } from "vitest";
import fr from "@/i18n/fr.json";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";
import { CODES_ERREUR, erreurJson, messageErreurFr, statutErreur } from "./erreurs-api";
import { texteErreur, type Traducteur } from "./erreurs-client";

/**
 * Les codes viennent du catalogue, jamais des fichiers de traduction : c'est
 * précisément le code sans clé que ce test doit faire échouer.
 */
const CODES = CODES_ERREUR;

/** Codes levés par le moteur d'entraînement — espace de codes distinct. */
const CODES_SEANCE = [
  "introuvable",
  "structure_invalide",
  "etape_hors_sequence",
  "etape_close",
] as const;

describe("catalogue d'erreurs", () => {
  it("chaque code du catalogue a une clé dans les trois langues", () => {
    for (const code of CODES) {
      for (const [langue, messages] of [
        ["fr", fr],
        ["en", en],
        ["so", so],
      ] as const) {
        const message = (messages.learnos.erreurs as Record<string, string>)[code];
        expect(message, `${code} manquant en ${langue}`).toBeTruthy();
      }
    }
  });

  it("aucune clé de traduction orpheline", () => {
    // Une clé sans code correspondant signale soit un code supprimé sans
    // ménage, soit une faute de frappe qui ne s'affichera jamais.
    const connus = new Set<string>([...CODES_SEANCE]);
    for (const code of CODES) connus.add(code);
    for (const cle of Object.keys(en.learnos.erreurs)) {
      expect(connus.has(cle), `clé orpheline : ${cle}`).toBe(true);
    }
  });

  it("les messages paramétrés déclarent les mêmes variables partout", () => {
    const variables = (s: string) =>
      new Set([...s.matchAll(/\{(\w+)/g)].map((m) => m[1]));
    for (const code of CODES) {
      const attendues = variables((fr.learnos.erreurs as Record<string, string>)[code]);
      const obtenues = variables((en.learnos.erreurs as Record<string, string>)[code]);
      expect([...obtenues].sort(), `variables divergentes pour ${code}`).toEqual(
        [...attendues].sort()
      );
    }
  });
});

describe("erreurJson", () => {
  it("attache le statut au code, pas à l'appelant", () => {
    expect(statutErreur("NON_AUTORISE")).toBe(401);
    expect(statutErreur("ELEVE_INTROUVABLE")).toBe(404);
    expect(statutErreur("PARCOURS_DEJA_TRAITE")).toBe(409);
  });

  it("interpole les paramètres dans le repli français", () => {
    expect(messageErreurFr("COMPETENCE_A_DES_PREUVES", { nb: 12 })).toContain("12");
    expect(messageErreurFr("CODE_COMPETENCE_DEJA_UTILISE", { code: "MATH-EQ1" })).toContain(
      "MATH-EQ1"
    );
  });

  it("renvoie code, repli et paramètres au client", async () => {
    const corps = await erreurJson("COMPETENCE_A_DES_PREUVES", { nb: 3 }).json();
    expect(corps.code).toBe("COMPETENCE_A_DES_PREUVES");
    expect(corps.params).toEqual({ nb: 3 });
    expect(corps.error).toContain("3");
  });
});

describe("texteErreur", () => {
  const traducteur = ((cle: string) => `traduit:${cle}`) as Traducteur;
  traducteur.has = (cle: string) => cle === "ELEVE_INTROUVABLE";

  it("préfère la traduction du code", () => {
    expect(
      texteErreur({ code: "ELEVE_INTROUVABLE", error: "Élève introuvable." }, traducteur, "x")
    ).toBe("traduit:ELEVE_INTROUVABLE");
  });

  it("retombe sur le message du serveur pour un code sans traduction", () => {
    // Cas d'une route pas encore migrée : mieux vaut une phrase française
    // qu'un identifiant technique affiché tel quel.
    expect(texteErreur({ code: "INCONNU", error: "Message serveur" }, traducteur, "x")).toBe(
      "Message serveur"
    );
  });

  it("retombe sur le message générique quand la réponse est vide", () => {
    expect(texteErreur({}, traducteur, "générique")).toBe("générique");
    expect(texteErreur(undefined, traducteur, "générique")).toBe("générique");
  });
});
