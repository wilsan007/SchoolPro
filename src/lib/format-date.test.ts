import { describe, expect, it } from "vitest";
import { formatDate, formatDateHeure, localeICU } from "./format-date";

/**
 * Ces tests protègent une garantie précise : la même valeur doit produire la
 * même chaîne quelle que soit la locale du runtime. C'est exactement ce qui
 * manquait sur `/devoirs`, où le serveur rendait « 23/09/2026 » et le navigateur
 * « 9/23/2026 » — au prix d'une régénération complète de l'arbre React.
 */
describe("localeICU", () => {
  it("associe chaque langue applicative à sa locale ICU", () => {
    expect(localeICU("fr")).toBe("fr-FR");
    expect(localeICU("en")).toBe("en-US");
    expect(localeICU("so")).toBe("so-SO");
  });

  it("retombe sur le français plutôt que sur la locale du runtime", () => {
    // Le point clé : JAMAIS `undefined`, qui rendrait la main au runtime.
    expect(localeICU(undefined)).toBe("fr-FR");
    expect(localeICU(null)).toBe("fr-FR");
    expect(localeICU("xx")).toBe("fr-FR");
    expect(localeICU("")).toBe("fr-FR");
  });
});

describe("formatDate", () => {
  const date = new Date("2026-09-23T12:00:00Z");

  it("n'utilise jamais la locale implicite du runtime", () => {
    // La sortie doit être identique pour la même langue, quel que soit
    // l'environnement d'exécution.
    expect(formatDate(date, "fr")).toBe(formatDate(date, "fr"));
    expect(formatDate(date, "fr")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("respecte l'ordre jour/mois de chaque langue", () => {
    const enFrancais = formatDate(date, "fr");
    const enAnglais = formatDate(date, "en");
    // Même si l'ordre diffère, chacun reste un format numérique complet.
    expect(enFrancais).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(enAnglais).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("accepte les chaînes ISO et les timestamps", () => {
    const attendu = formatDate(date, "fr");
    expect(formatDate("2026-09-23T12:00:00Z", "fr")).toBe(attendu);
    expect(formatDate(date.getTime(), "fr")).toBe(attendu);
  });

  it("respecte les options fournies", () => {
    const long = formatDate(date, "fr", { day: "numeric", month: "long", year: "numeric" });
    expect(long).toContain("2026");
    expect(long).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("rend un tiret plutôt qu'« Invalid Date » sur une valeur invalide", () => {
    expect(formatDate("pas-une-date", "fr")).toBe("—");
    expect(formatDate(new Date("n/a"), "fr")).toBe("—");
  });
});

describe("formatDateHeure", () => {
  it("ajoute l'heure à la date", () => {
    const rendu = formatDateHeure("2026-09-23T12:00:00Z", "fr");
    expect(rendu).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(rendu).toMatch(/\d{2}:\d{2}/);
  });
});