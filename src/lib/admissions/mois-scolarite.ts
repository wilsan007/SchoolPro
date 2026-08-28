/**
 * Logique du mois de scolarité facturé lors de l'admission.
 *
 * Le mois de scolarité est au format "YYYY-MM" (ex: "2026-09").
 * En août (mois 7) ou septembre (mois 8), le défaut est septembre de l'année
 * courante. Sinon, le défaut est le mois en cours.
 */

const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * Retourne le mois de scolarité par défaut au format "YYYY-MM".
 * - Août (7) ou Septembre (8) → "YYYY-09" (septembre de l'année courante)
 * - Sinon → "YYYY-MM" (mois en cours)
 */
export function moisScolariteDefaut(date: Date = new Date()): string {
  const mois = date.getMonth(); // 0-indexed (0 = janvier)
  const annee = date.getFullYear();
  if (mois === 7 || mois === 8) {
    // Août (7) ou Septembre (8) → septembre
    return `${annee}-09`;
  }
  return `${annee}-${String(mois + 1).padStart(2, "0")}`;
}

/**
 * Valide qu'une chaîne est au format "YYYY-MM".
 */
export function isMoisScolariteValide(mois: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
}

/**
 * Formate un mois "YYYY-MM" en libellé lisible : "Septembre 2026".
 */
export function formatMoisScolarite(mois: string): string {
  const [annee, moisNum] = mois.split("-");
  const idx = parseInt(moisNum, 10) - 1;
  const nom = MOIS_NOMS[idx] ?? `Mois ${moisNum}`;
  return `${nom} ${annee}`;
}

/**
 * Retourne la liste des 12 mois de l'année scolaire (septembre → août)
 * pour une année donnée, au format "YYYY-MM".
 *
 * Exemple pour "2026" : ["2026-09", "2026-10", ..., "2027-08"]
 */
export function optionsMoisScolarite(anneeDebut: number = new Date().getFullYear()): string[] {
  const options: string[] = [];
  for (let i = 0; i < 12; i++) {
    const moisCalendaire = (8 + i) % 12; // 0-indexed, commence à septembre (8)
    const annee = moisCalendaire < 8 ? anneeDebut : anneeDebut + 1;
    options.push(`${annee}-${String(moisCalendaire + 1).padStart(2, "0")}`);
  }
  return options;
}
