import type { LucideIcon } from "lucide-react";

export type WindowStatus = "open" | "minimized" | "closing";

export type LayoutMode = "fullscreen" | "split-h" | "split-v" | "quad-4";

export interface WindowState {
  id: string;
  /** Route du module (ex: "/eleves") — chargé en iframe avec ?embedded=1 */
  route: string;
  title: string;
  icon: LucideIcon;
  iconColor: string;
  status: WindowStatus;
  zIndex: number;
  /** Ordre d'ouverture — ordre de création */
  order: number;
  /** Ordre de focus — le plus élevé = le plus récemment actif.
   *  Les N fenêtres avec le focusOrder le plus haut sont visibles
   *  (N = nombre de slots du layout courant). */
  focusOrder: number;
}

export interface LayoutSlot {
  index: number;
  x: number; // 0..1 fraction
  y: number;
  w: number;
  h: number;
}

/** Nombre de slots visibles par layout */
export const LAYOUT_SLOTS: Record<LayoutMode, number> = {
  fullscreen: 1,
  "split-h": 2,
  "split-v": 2,
  "quad-4": 4,
};

/** Géométrie des slots par layout (fractions 0..1 du container) */
export const LAYOUT_GEOMETRY: Record<LayoutMode, LayoutSlot[]> = {
  fullscreen: [{ index: 0, x: 0, y: 0, w: 1, h: 1 }],
  "split-h": [
    { index: 0, x: 0, y: 0, w: 0.5, h: 1 },
    { index: 1, x: 0.5, y: 0, w: 0.5, h: 1 },
  ],
  "split-v": [
    { index: 0, x: 0, y: 0, w: 1, h: 0.5 },
    { index: 1, x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
  "quad-4": [
    { index: 0, x: 0, y: 0, w: 0.5, h: 0.5 },
    { index: 1, x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { index: 2, x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { index: 3, x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  ],
};
