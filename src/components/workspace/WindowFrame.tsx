"use client";

import React, { useRef, useEffect, useState } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWindowManager } from "./WindowManager";
import { genieEffect } from "./genie";
import { ID_FENETRE_INITIALE, type WindowState, type LayoutSlot } from "./types";
import { MESSAGE_RAFRAICHIR } from "./EmbeddedBridge";

/** Durée en arrière-plan au-delà de laquelle un onglet rafraîchit ses données. */
const DELAI_RAFRAICHISSEMENT_MS = 20_000;

interface WindowFrameProps {
  window: WindowState;
  /** Emplacement dans la grille, ou `null` si la fenêtre est en arrière-plan
   *  (onglet non affiché ou minimisé) : elle reste montée, mais masquée. */
  slot: LayoutSlot | null;
  isActive: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function WindowFrame({ window: win, slot, isActive, containerRef }: WindowFrameProps) {
  const { minimizeWindow, closeWindow, focusWindow, getDockItemRect } = useWindowManager();
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const masqueeDepuis = useRef<number | null>(null);
  const visible = slot !== null;

  // Un onglet gardé en mémoire affiche les données de son dernier chargement.
  // Au retour d'un passage prolongé en arrière-plan, on demande à la page de
  // rafraîchir ses données serveur : l'écran s'affiche tout de suite, tel
  // qu'il était, puis se met à jour sans rechargement ni perte de saisie.
  useEffect(() => {
    if (!visible) {
      masqueeDepuis.current = Date.now();
      return;
    }
    const depuis = masqueeDepuis.current;
    masqueeDepuis.current = null;
    if (depuis !== null && Date.now() - depuis >= DELAI_RAFRAICHISSEMENT_MS) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: MESSAGE_RAFRAICHIR },
        globalThis.location.origin,
      );
    }
  }, [visible]);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);

  // URL de l'iframe avec paramètre embedded
  const iframeSrc = `${win.route}?embedded=1`;

  // Animation de fermeture/minimisation avec effet genie
  async function handleMinimize() {
    if (!frameRef.current) return;
    const dockRect = getDockItemRect(win.id);
    if (!dockRect) {
      minimizeWindow(win.id);
      return;
    }
    setAnimatingOut(true);
    await genieEffect(frameRef.current, dockRect, { duration: 650, reverse: false });
    setAnimatingOut(false);
    minimizeWindow(win.id);
  }

  async function handleClose() {
    if (!frameRef.current) return;
    const dockRect = getDockItemRect(win.id);
    if (!dockRect) {
      closeWindow(win.id);
      return;
    }
    setAnimatingOut(true);
    await genieEffect(frameRef.current, dockRect, { duration: 500, reverse: false });
    setAnimatingOut(false);
    closeWindow(win.id);
  }

  // Entrée en fade-up au montage
  useEffect(() => {
    // La fenêtre initiale est déjà à l'écran (rendue par le serveur) : la
    // faire disparaître pour la réanimer produirait un clignotement.
    if (win.id === ID_FENETRE_INITIALE) return;
    if (frameRef.current) {
      frameRef.current.style.opacity = "0";
      frameRef.current.style.transform = "translateY(12px) scale(0.98)";
      requestAnimationFrame(() => {
        if (frameRef.current) {
          frameRef.current.style.transition = "opacity 0.3s ease-out, transform 0.3s ease-out";
          frameRef.current.style.opacity = "1";
          frameRef.current.style.transform = "translateY(0) scale(1)";
        }
      });
    }
  }, [win.id]);

  // Réinitialiser l'état de chargement quand la route change (remplacement de fenêtre active).
  // Une iframe rendue côté serveur peut avoir fini de charger AVANT
  // l'hydratation : son `onLoad` est alors déjà passé, on lit donc son état
  // réel plutôt que de supposer qu'elle charge encore.
  useEffect(() => {
    let charge = false;
    try {
      const doc = iframeRef.current?.contentDocument;
      charge = !!doc && doc.readyState === "complete" && doc.location.href !== "about:blank";
    } catch {
      // Document inaccessible : on attend `onLoad`.
    }
    setIframeLoaded(charge);
  }, [win.route]);

  const Icon = win.icon;

  return (
    <div
      ref={frameRef}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-[22px] border bg-card transition-all duration-200",
        isActive
          ? "border-primary/20 shadow-[0_8px_32px_hsl(198_65%_46%/0.1),0_2px_8px_rgba(0,0,0,0.03)] ring-1 ring-primary/15"
          : "border-border/60 shadow-[0_4px_16px_rgba(0,0,0,0.03)] opacity-90",
        animatingOut && "pointer-events-none"
      )}
      style={
        slot
          ? {
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${slot.w * 100}%`,
              height: `${slot.h * 100}%`,
              zIndex: isActive ? 50 : 10,
            }
          : { display: "none" }
      }
      aria-hidden={!visible}
      onMouseDown={() => !isActive && focusWindow(win.id)}
    >
      {/* Halo coloré en arrière-plan — utilise la couleur d'icône de la fenêtre */}
      {isActive && (
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none blur-3xl opacity-[0.08]"
          style={{ backgroundColor: win.iconColor }}
          aria-hidden
        />
      )}

      {/* Title bar — couleur dérivée de l'icône de la fenêtre */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-2.5 border-b flex-shrink-0 transition-colors duration-200 relative",
          isActive ? "border-border/30" : "border-border/50 bg-secondary/30"
        )}
        style={
          isActive
            ? {
                background: `linear-gradient(to right, ${win.iconColor}14, ${win.iconColor}06)`,
              }
            : undefined
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Icône : conteneur coloré avec la couleur de la fenêtre */}
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={
            isActive
              ? {
                  backgroundColor: win.iconColor,
                  color: "white",
                  boxShadow: `0 2px 8px ${win.iconColor}40`,
                }
              : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
          }
        >
          <Icon className="w-4 h-4" />
        </div>

        {/* Titre : Clash Grotesk si active, Plus Jakarta si inactive */}
        <span
          className={cn(
            "truncate flex-1",
            isActive
              ? "text-sm font-display font-semibold text-navy"
              : "text-sm font-medium text-muted-foreground"
          )}
        >
          {win.title}
        </span>

        {/* Indicateur de chargement — couleur de la fenêtre */}
        {!iframeLoaded && (
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
            style={{
              borderColor: `${win.iconColor}40`,
              borderTopColor: win.iconColor,
            }}
          />
        )}

        {/* Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            title="Minimiser"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content — iframe vers la route avec ?embedded=1.
          Le key={win.route} force le remontage quand la route change
          (remplacement de la fenêtre active), réinitialisant l'état de chargement. */}
      <div className="flex-1 relative bg-background overflow-hidden">
        <iframe
          ref={iframeRef}
          key={win.route}
          src={iframeSrc}
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
          title={win.title}
          sandbox="allow-same-origin allow-forms allow-scripts allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
