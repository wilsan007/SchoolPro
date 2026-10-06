"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import type { WindowState, LayoutMode } from "./types";
import { LAYOUT_SLOTS, ID_FENETRE_INITIALE } from "./types";
import { getRouteMeta } from "@/lib/nav-metadata";

interface WindowManagerContextValue {
  /** Toutes les fenêtres ouvertes (onglets) — triées par ordre de création */
  windows: WindowState[];
  activeWindowId: string | null;
  layout: LayoutMode;
  /** Nombre de slots visibles selon le layout courant */
  visibleCount: number;
  /** Fenêtres visibles (les N plus récemment focusées, N = slots du layout).
   *  Triées par focusOrder décroissant : index 0 = slot 0 (la plus récente). */
  visibleWindows: WindowState[];
  /** Fenêtres non visibles (onglets en arrière-plan, encore ouverts) */
  backgroundWindows: WindowState[];

  openWindow: (route: string, title: string, icon: LucideIcon, iconColor: string) => void;
  closeWindow: (id: string) => void;
  /** Ferme toutes les fenêtres ouvertes (utilisé lors d'un changement de rôle). */
  closeAllWindows: () => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  setLayout: (layout: LayoutMode) => void;
  /** Callback pour récupérer la position du dock item (pour le genie effect) */
  getDockItemRect: (id: string) => DOMRect | null;
  registerDockItem: (id: string, el: HTMLElement | null) => void;
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

export function useWindowManager() {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error("useWindowManager must be used within WindowManagerProvider");
  return ctx;
}

export function WindowManagerProvider({
  children,
  initialRoute = null,
}: {
  children: React.ReactNode;
  /**
   * Route à ouvrir dès le premier rendu, serveur compris. Son iframe figure
   * ainsi dans le HTML initial : le navigateur la charge sans attendre
   * l'hydratation de la coquille.
   */
  initialRoute?: string | null;
}) {
  const [windows, setWindows] = useState<WindowState[]>(() => {
    if (!initialRoute) return [];
    const meta = getRouteMeta(initialRoute);
    return [
      {
        id: ID_FENETRE_INITIALE,
        route: initialRoute,
        title: meta.title,
        icon: meta.icon,
        iconColor: meta.iconColor,
        status: "open",
        zIndex: 1,
        order: 1,
        focusOrder: 1,
      },
    ];
  });
  const [activeWindowId, setActiveWindowId] = useState<string | null>(
    initialRoute ? ID_FENETRE_INITIALE : null,
  );
  const [layout, setLayoutState] = useState<LayoutMode>("fullscreen");
  // Les compteurs repartent APRÈS la fenêtre initiale, pour ne pas réattribuer
  // son identifiant ni son rang.
  const zCounter = useRef(initialRoute ? 1 : 0);
  const orderCounter = useRef(initialRoute ? 1 : 0);
  const focusCounter = useRef(initialRoute ? 1 : 0);
  const dockItemsRef = useRef<Map<string, HTMLElement>>(new Map());

  const visibleCount = LAYOUT_SLOTS[layout];

  // Fenêtres visibles = les N plus récemment focusées (focusOrder décroissant)
  // où N = nombre de slots du layout.
  const sortedByFocus = [...windows]
    .filter((w) => w.status === "open")
    .sort((a, b) => b.focusOrder - a.focusOrder);

  const visibleWindows = sortedByFocus.slice(0, visibleCount);
  const backgroundWindows = sortedByFocus.slice(visibleCount);

  const openWindow = useCallback(
    (route: string, title: string, icon: LucideIcon, iconColor: string) => {
      // Si la fenêtre existe déjà (même route), la focus
      setWindows((prev) => {
        const existing = prev.find((w) => w.route === route);
        if (existing) {
          focusCounter.current++;
          setActiveWindowId(existing.id);
          return prev.map((w) =>
            w.id === existing.id
              ? { ...w, status: "open" as const, zIndex: ++zCounter.current, focusOrder: focusCounter.current }
              : w
          );
        }

        // Nouvelle fenêtre — toujours ajouter (modèle d'onglets)
        const id = `win-${++orderCounter.current}`;
        zCounter.current++;
        focusCounter.current++;
        setActiveWindowId(id);
        return [
          ...prev,
          {
            id,
            route,
            title,
            icon,
            iconColor,
            status: "open",
            zIndex: zCounter.current,
            order: orderCounter.current,
            focusOrder: focusCounter.current,
          },
        ];
      });
    },
    []
  );

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => {
      const next = prev.filter((w) => w.id !== id);
      // Si la fenêtre fermée était active, focus la plus récente restante
      if (activeWindowId === id) {
        const remaining = next
          .filter((w) => w.status === "open")
          .sort((a, b) => b.focusOrder - a.focusOrder);
        setActiveWindowId(remaining.length > 0 ? remaining[0].id : null);
      }
      return next;
    });
  }, [activeWindowId]);

  const closeAllWindows = useCallback(() => {
    setWindows([]);
    setActiveWindowId(null);
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setWindows((prev) => {
      const next = prev.map((w) =>
        w.id === id ? { ...w, status: "minimized" as const } : w
      );
      // Si la fenêtre minimisée était active, focus la plus récente restante
      if (activeWindowId === id) {
        const remaining = next
          .filter((w) => w.status === "open")
          .sort((a, b) => b.focusOrder - a.focusOrder);
        setActiveWindowId(remaining.length > 0 ? remaining[0].id : null);
      }
      return next;
    });
  }, [activeWindowId]);

  const restoreWindow = useCallback((id: string) => {
    focusCounter.current++;
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, status: "open" as const, zIndex: ++zCounter.current, focusOrder: focusCounter.current }
          : w
      )
    );
    setActiveWindowId(id);
  }, []);

  const focusWindow = useCallback((id: string) => {
    focusCounter.current++;
    setActiveWindowId(id);
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, zIndex: ++zCounter.current, focusOrder: focusCounter.current }
          : w
      )
    );
  }, []);

  const setLayout = useCallback((newLayout: LayoutMode) => {
    setLayoutState(newLayout);
  }, []);

  const registerDockItem = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      dockItemsRef.current.set(id, el);
    } else {
      dockItemsRef.current.delete(id);
    }
  }, []);

  const getDockItemRect = useCallback((id: string): DOMRect | null => {
    const el = dockItemsRef.current.get(id);
    return el?.getBoundingClientRect() ?? null;
  }, []);

  return (
    <WindowManagerContext.Provider
      value={{
        windows,
        activeWindowId,
        layout,
        visibleCount,
        visibleWindows,
        backgroundWindows,
        openWindow,
        closeWindow,
        closeAllWindows,
        minimizeWindow,
        restoreWindow,
        focusWindow,
        setLayout,
        getDockItemRect,
        registerDockItem,
      }}
    >
      {children}
    </WindowManagerContext.Provider>
  );
}
