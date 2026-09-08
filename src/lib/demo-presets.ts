/**
 * Time Machine — presets de démonstration et validation des snapshots.
 *
 * PRINCIPE
 * La démonstration n'est PAS une simulation. Chaque preset correspond à un
 * snapshot de l'établissement déjà calculé en amont (seed). La machine à
 * temps ne fait que pointer sur l'un de ces snapshots et en afficher le
 * contenu.
 *
 * Cela garantit : pas de recalcul à la volée, pas de résultat partiel ou
 * manquant, pas de simulation approximative.
 */

export interface DemoPreset {
  id: string;
  /** Clés i18n pour le label et la description affichés en UI. */
  label: string;
  description: string;
  date: string; // ISO 8601
}

export const DEMO_PRESETS: readonly DemoPreset[] = [
  { id: "octobre-2025", label: "presetOctobre2025", description: "presetOctobre2025Desc", date: "2025-10-15T10:00:00.000Z" },
  { id: "janvier-2026", label: "presetJanvier2026", description: "presetJanvier2026Desc", date: "2026-01-15T10:00:00.000Z" },
  { id: "mars-2026", label: "presetMars2026", description: "presetMars2026Desc", date: "2026-03-15T10:00:00.000Z" },
  { id: "juin-2026", label: "presetJuin2026", description: "presetJuin2026Desc", date: "2026-06-15T10:00:00.000Z" },
  { id: "aout-2026", label: "presetAout2026", description: "presetAout2026Desc", date: "2026-08-16T10:00:00.000Z" },
  { id: "octobre-2026", label: "presetOctobre2026", description: "presetOctobre2026Desc", date: "2026-10-15T10:00:00.000Z" },
];

/** Liste des dates ISO triées chronologiquement. */
export const DEMO_PRESET_DATES = DEMO_PRESETS.map((p) => p.date);

/** Vérifie qu'une chaîne ISO est l'un des presets autorisés. */
export function isDemoPreset(date: string | null | undefined): boolean {
  if (!date) return false;
  return DEMO_PRESET_DATES.includes(date);
}

/** Normalise une date en ISO et retourne le preset exact ou null. */
export function normalizePreset(date: string | null | undefined): string | null {
  if (!date) return null;
  const candidate = new Date(date).toISOString();
  return DEMO_PRESET_DATES.includes(candidate) ? candidate : null;
}
