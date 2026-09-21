"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Widget Cloudflare Turnstile — encapsulation React.
 *
 * Charge le script `api.js` une seule fois, rend le widget dans un
 * conteneur ref, et expose le jeton via `onVerify`.
 *
 * En production, la sitekey est résolue au build (voir TURNSTILE_SITEKEY
 * ci-dessous). En développement sans `NEXT_PUBLIC_TURNSTILE_SITEKEY`, le
 * composant ne rend rien et appelle `onVerify("dev-bypass")`.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
          action?: string;
        },
      ) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;

/**
 * Sitekey Turnstile résolue au moment du build.
 *
 * ⚠️ Ne pas remplacer par une simple lecture `process.env.NEXT_PUBLIC_*` :
 * le build Docker utilise `--experimental-build-mode compile` qui N'INLINE
 * PAS les NEXT_PUBLIC_* dans le bundle client — la référence resterait
 * littérale, `process.env` vaudrait `{}` dans le navigateur, et le widget
 * ne se rendrait jamais (login bloqué en production).
 *
 * - Production : sitekey codée en dur. Elle est publique par design
 *   (visible dans le HTML de toute page protégée par Turnstile) — ce
 *   n'est pas un secret.
 * - Développement : `NEXT_PUBLIC_TURNSTILE_SITEKEY` reste prioritaire.
 *   Non définie → null → bypass ("dev-bypass"). Pour tester le widget
 *   en local, utiliser la sitekey de test Cloudflare
 *   `1x00000000000000000000AA` (toujours valide).
 */
const TURNSTILE_SITEKEY =
  process.env.NODE_ENV === "production"
    ? "0x4AAAAAAE0i9t0Fa7N9R0fV"
    : process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("turnstile_script_load_failed"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
  theme?: "light" | "dark" | "auto";
  action?: string;
}

export default function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
  className,
  theme = "auto",
  action = "schoolpro-auth",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [sitekey, setSitekey] = useState<string | null>(TURNSTILE_SITEKEY);
  const [error, setError] = useState<string | null>(null);

  // ─── Pattern « latest ref » : la boucle de re-rendu ─────────────────────
  // Les callbacks (`onVerify`, `onExpire`…) sont souvent des fléchées inline
  // côté parent — nouvelle identité à CHAQUE render. Si `renderWidget` en
  // dépendait directement, le `useEffect` ci-dessous re-fusionnerait à chaque
  // render : le widget serait détruit et re-créé sans fin. Or un défi Turnstile
  // résolu appelle `onVerify` → re-render du parent → remontage → nouveau défi
  // résolu → … boucle infinie, constatée en production (login inutilisable).
  // Les refs gardent les DERNIERS callbacks sans faire bouger les dépendances.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  });

  const renderWidget = useCallback(async () => {
    if (!containerRef.current || !sitekey || !window.turnstile) return;

    // Nettoyer un éventuel widget précédent
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch (e) {
        console.warn("[non-fatal]", e);
        // ignore
      }
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey,
      callback: (token: string) => {
        setError(null);
        onVerifyRef.current(token);
      },
      "error-callback": () => {
        setError("turnstile_error");
        onErrorRef.current?.();
      },
      "expired-callback": () => {
        onVerifyRef.current("");
        onExpireRef.current?.();
      },
      theme,
      action,
    });
    // Délibérément limité aux valeurs stables (sitekey, theme, action) :
    // les callbacks vivent dans les refs ci-dessus.
  }, [sitekey, theme, action]);

  useEffect(() => {
    if (!sitekey) {
      // Pas de sitekey en dev : bypass
      onVerifyRef.current("dev-bypass");
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (!cancelled) renderWidget();
      })
      .catch(() => {
        if (!cancelled) setError("turnstile_script_load_failed");
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          console.warn("[non-fatal]", e);
          // ignore
        }
      }
    };
    // `renderWidget` ne change d'identité que si sitekey/theme/action
    // changent — les callbacks vivent dans les refs, le widget n'est donc
    // plus détruit et re-créé à chaque render du parent.
  }, [sitekey, renderWidget]);

  // Pas de sitekey → ne rien rendre (mode dev)
  if (!sitekey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      {error && (
        <p className="text-xs text-destructive mt-1.5">
          Échec du contrôle anti-bot. Réessayez.
        </p>
      )}
    </div>
  );
}
