import type { StructureType } from "@prisma/client";

// ============================================================
// Grille horaire dynamique
// ============================================================
//
// Le pas de la grille dépend du type de la structure pédagogique de la
// classe sélectionnée :
//
//   MATERNELLE / PRIMAIRE → grille fine (10 min) : durées courtes,
//     hauteur de cellule réduite (24px). L'enseignant de primaire fait
//     toutes les matières et découpe sa journée en séquences courtes
//     (lecture 30 min, récré 15 min, math 45 min…).
//
//   COLLEGE / LYCEE → grille standard (30 min) : durées longues,
//     hauteur de cellule 48px. Les cours durent 1h, 2h, voire 3h
//     (travaux pratiques).
//
// La plage horaire est 07:00 → 18:00 pour tous les types.
//
// IMPORTANT : ce module est indépendant du modèle de nommage des niveaux
// (ANNEES vs FRANCAIS, voir niveau-display.ts). Il se base UNIQUEMENT sur
// le type de Structure, pas sur le libellé du niveau — il reste donc
// compatible avec les deux modèles.

/** Début et fin absolus de la plage horaire, en minutes depuis minuit. */
const DEBUT_MIN = 7 * 60; // 07:00
const FIN_MIN = 18 * 60; // 18:00

/** Configuration d'une grille pour un type de structure donné. */
export interface GridConfig {
  /** Pas de la grille en minutes (10 ou 30). */
  stepMinutes: number;
  /** Hauteur d'un slot en pixels (24 ou 48). */
  slotHeight: number;
  /** Liste des slots de début possibles, de 07:00 à 18:00 (exclus). */
  slots: string[];
  /** Durées sélectionnables pour ce type de structure, en minutes. */
  durations: number[];
  /** true si grille fine (maternel/primaire). */
  isFineGrid: boolean;
}

/** true si le type de structure utilise la grille fine (10 min). */
export function isFineGridType(structureType: StructureType | string | null | undefined): boolean {
  return structureType === "MATERNELLE" || structureType === "PRIMAIRE";
}

/** Convertit "HH:MM" en minutes depuis minuit. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Convertit des minutes depuis minuit en "HH:MM". */
export function minutesToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Construit la liste des slots de début pour un pas donné. */
function buildSlots(stepMinutes: number): string[] {
  const slots: string[] = [];
  for (let m = DEBUT_MIN; m < FIN_MIN; m += stepMinutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

const FINE_DURATIONS = [10, 15, 20, 30, 35, 45, 50];
const STANDARD_DURATIONS = [30, 60, 90, 120];

const FINE_SLOTS = buildSlots(10);
const STANDARD_SLOTS = buildSlots(30);

const FINE_CONFIG: GridConfig = {
  stepMinutes: 10,
  slotHeight: 24,
  slots: FINE_SLOTS,
  durations: FINE_DURATIONS,
  isFineGrid: true,
};

const STANDARD_CONFIG: GridConfig = {
  stepMinutes: 30,
  slotHeight: 48,
  slots: STANDARD_SLOTS,
  durations: STANDARD_DURATIONS,
  isFineGrid: false,
};

/**
 * Renvoie la configuration de grille pour un type de structure.
 *
 * - MATERNELLE / PRIMAIRE → grille fine (10 min, 24px, durées 10-50 min)
 * - COLLEGE / LYCEE → grille standard (30 min, 48px, durées 30-120 min)
 * - null / inconnu → grille standard par défaut (fail-safe)
 */
export function getGridConfig(structureType: StructureType | string | null | undefined): GridConfig {
  return isFineGridType(structureType) ? FINE_CONFIG : STANDARD_CONFIG;
}

/**
 * Calcule l'heure de fin à partir d'une heure de début et d'une durée.
 * @param heureDebut "HH:MM"
 * @param durationMinutes durée en minutes
 * @returns "HH:MM"
 */
export function computeEndTime(heureDebut: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(heureDebut) + durationMinutes);
}

/**
 * Filtre les slots de début valides pour une durée donnée : un slot est
 * valide si le créneau [slot, slot+durée] tient entièrement avant 18:00.
 *
 * @param slots liste des slots (issus de getGridConfig().slots)
 * @param durationMinutes durée du créneau en minutes
 */
export function getValidStartSlots(slots: string[], durationMinutes: number): string[] {
  return slots.filter((slot) => timeToMinutes(slot) + durationMinutes <= FIN_MIN);
}

/** Limite maximale de cours par jour : 12h45 = 765 minutes. */
export const MAX_MINUTES_PAR_JOUR = 765;

export { DEBUT_MIN, FIN_MIN };
