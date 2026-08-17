/**
 * Helpers partagés pour le seed Ambouli — Cité Scolaire Ambouli (Djibouti).
 *
 * PRNG déterministe (mulberry32) : mêmes données à chaque exécution,
 * reproductibles et debuggables.
 */

// ─── PRNG déterministe (mulberry32) ───────────────────────────
export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng = mulberry32(42);
export function setSeed(s: number) { _rng = mulberry32(s); }
export function rng(): number { return _rng(); }

// ─── Utilitaires de tirage ────────────────────────────────────
export function randInt(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}
export function randFloat(min: number, max: number): number {
  return _rng() * (max - min) + min;
}
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(_rng() * arr.length)];
}
export function pickSome<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(_rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}
export function chance(p: number): boolean {
  return _rng() < p;
}
export function gauss(mean: number, std: number): number {
  // Box-Muller
  const u1 = Math.max(_rng(), 1e-10);
  const u2 = _rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Noms djiboutiens / afars / issas ─────────────────────────
export const NOMS_GARCONS = [
  "Mahamoud", "Abdillahi", "Yacin", "Rachid", "Said", "Omar", "Hassan", "Ibrahim",
  "Aden", "Farah", "Djibril", "Moussa", "Ali", "Mohamed", "Kamal", "Nabil",
  "Youssef", "Hamza", "Sami", "Karim", "Bilal", "Walid", "Anis", "Saïd",
  "Abdoulkader", "Nour", "Rayan", "Adam", "Amine", "Idris",
];

export const NOMS_FILLES = [
  "Amina", "Fatima", "Asma", "Hodan", "Leyla", "Safia", "Khadra", "Naima",
  "Mariam", "Hawa", "Deqa", "Fadumo", "Halima", "Zainab", "Sumaya", "Yasmin",
  "Salma", "Imane", "Sara", "Lina", "Hibo", "Faiza", "Ayan", "Rahma",
  "Noura", "Houda", "Amira", "Sahra", "Warda", "Cumar",
];

export const NOMS_FAMILLE = [
  "Farah", "Mahamoud", "Abdillahi", "Waberi", "Guelleh", "Said", "Hassan",
  "Ibrahim", "Aden", "Omar", "Ali", "Mohamed", "Djama", "Yacin", "Kamil",
  "Barkat", "Rachid", "Moussa", "Hared", "Guedi", "Bourhan", "Abdo",
  "Choukri", "Daoud", "Elmi", "Gouled", "Hersi", "Ismael", "Robleh",
  "Saidi", "Wais", "Yonis", "Aboubaker", "Chahid", "Dabar", "Galab",
];

export const PRENOMS_PERES = [
  "Mahamoud", "Abdillahi", "Omar", "Hassan", "Said", "Ibrahim", "Ali",
  "Mohamed", "Farah", "Djibril", "Aden", "Moussa", "Yacin", "Rachid",
];

export const PROFESSIONS = [
  "Fonctionnaire", "Commerçant", "Enseignant", "Militaire", "Pêcheur",
  "Chauffeur", "Ménagère", "Infirmier", "Technicien", "Ouvrier",
  "Restaurateur", "Chauffeur de taxi", "Agent de sécurité", "Comptable",
  "Mécanicien", "Électricien", "Tailleur", "Agriculteur",
];

// ─── Date helpers ─────────────────────────────────────────────
export function dateStr(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
export function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// ─── Génération de notes réalistes ────────────────────────────
/**
 * Génère une note /20 avec une distribution gaussienne
 * centrée sur `moyenne` avec écart-type `ecart`.
 * Bornée [0, 20].
 */
export function noteGauss(moyenne: number, ecart: number): number {
  return Math.round(clamp(gauss(moyenne, ecart), 0, 20) * 4) / 4;
}

/**
 * Convertit une note /20 en signal de maîtrise 0..1.
 */
export function noteToMastery(note: number, noteMax = 20): number {
  return Math.round((note / noteMax) * 100) / 100;
}

// ─── Appreciation automatique ─────────────────────────────────
export function appreciationNote(note: number): string {
  if (note >= 16) return "Très bien";
  if (note >= 14) return "Bien";
  if (note >= 12) return "Assez bien";
  if (note >= 10) return "Passable";
  if (note >= 8) return "Insuffisant";
  return "Très insuffisant";
}

export function mentionBulletin(moyenne: number): string | null {
  if (moyenne >= 16) return "Très Bien";
  if (moyenne >= 14) return "Bien";
  if (moyenne >= 12) return "Assez Bien";
  if (moyenne >= 10) return "Passable";
  return null;
}

export function decisionBulletin(moyenne: number, niveau: string): string {
  if (moyenne >= 10) return "Passage";
  if (niveau === "Terminale") return "Ajourné";
  return "Redoublement";
}

// ─── Identifiants déterministes ───────────────────────────────
let _counter: Record<string, number> = {};
export function nextId(prefix: string): string {
  _counter[prefix] = (_counter[prefix] || 0) + 1;
  return `${prefix}-${_counter[prefix]}`;
}
export function resetCounters() { _counter = {}; }
