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
