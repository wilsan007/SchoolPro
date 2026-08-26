// Niveaux nécessitant un professeur principal (collège + lycée)
const NIVEAUX_AVEC_PROF_PRINCIPAL = [
  "6ème", "6eme", "6e", "5ème", "5eme", "5e", "4ème", "4eme", "4e",
  "3ème", "3eme", "3e", "2nde", "seconde", "1ère", "1ere", "première",
  "premiere", "terminale", "tle",
];

export function niveauRequiresProfPrincipal(niveau: string): boolean {
  const n = niveau.toLowerCase().trim();
  return NIVEAUX_AVEC_PROF_PRINCIPAL.some((nv) => n === nv || n.startsWith(nv));
}

/**
 * Convertit un niveau brut (numéro ou texte) en nom lisible en français.
 * 2 → "2ème", 3 → "3ème", ..., 9 → "9ème"
 * 10 → "Seconde", 11 → "1ère", 12 → "Terminale"
 *
 * Si le niveau contient déjà des lettres, il est retourné tel quel.
 */
export function niveauToLabel(niveau: string): string {
  const n = niveau.trim();
  if (/[a-zA-Zà-ÿ]/.test(n)) return n;
  const num = parseInt(n, 10);
  if (isNaN(num)) return n;
  const map: Record<number, string> = {
    1: "1ère",
    2: "2ème",
    3: "3ème",
    4: "4ème",
    5: "5ème",
    6: "6ème",
    7: "7ème",
    8: "8ème",
    9: "9ème",
    10: "Seconde",
    11: "1ère",
    12: "Terminale",
  };
  return map[num] ?? n;
}
