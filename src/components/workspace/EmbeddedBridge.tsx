"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Message envoyé par le workspace à un onglet qui revient au premier plan. */
export const MESSAGE_RAFRAICHIR = "schoolpro:rafraichir";

/**
 * Pont entre une page embarquée (iframe du workspace) et sa fenêtre parente.
 *
 * Les onglets du workspace restent en mémoire pour que le retour sur l'un
 * d'eux soit instantané. La contrepartie serait un écran figé sur son dernier
 * chargement : le workspace prévient donc l'onglet qui réapparaît, et celui-ci
 * relit ses données serveur en arrière-plan (`router.refresh()` conserve
 * l'état client — filtres, saisie en cours, position de défilement).
 */
export function EmbeddedBridge() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Seule la fenêtre parente, de même origine, est écoutée.
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if ((e.data as { type?: unknown } | null)?.type !== MESSAGE_RAFRAICHIR) return;
      startTransition(() => router.refresh());
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
