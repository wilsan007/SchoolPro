"use client";

import { useEffect, useRef } from "react";

/** Pile des modales ouvertes : seule celle du dessus réagit à Échap. */
const pile: symbol[] = [];

/**
 * Comportement minimal d'une modale « maison » (`div` en `fixed inset-0`) :
 * fermeture par Échap et annonce `role="dialog"` aux lecteurs d'écran.
 *
 * Usage :
 * ```tsx
 * const dialogProps = useModalA11y(onClose);
 * return <div {...dialogProps} className="fixed inset-0 …">…</div>;
 * ```
 *
 * `onClose` absent → modale bloquante (pas de fermeture par Échap).
 * `open` sert aux modales rendues conditionnellement dans le composant parent.
 */
export function useModalA11y(onClose?: () => void, open = true) {
  const fermer = useRef(onClose);
  useEffect(() => {
    fermer.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const id = Symbol("modale");
    pile.push(id);
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || pile[pile.length - 1] !== id || !fermer.current) return;
      e.preventDefault();
      fermer.current();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("keydown", surTouche);
      pile.splice(pile.indexOf(id), 1);
    };
  }, [open]);

  return { role: "dialog", "aria-modal": true } as const;
}
