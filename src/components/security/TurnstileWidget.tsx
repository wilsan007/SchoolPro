"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Widget Cloudflare Turnstile — encapsulation React.
 *
 * Charge le script `api.js` une seule fois, rend le widget dans un
 * conteneur ref, et expose le jeton via `onVerify`.
 *
 * Si aucune sitekey n'est configurée (`NEXT_PUBLIC_TURNSTILE_SITEKEY`),
 * le composant ne rend rien et appelle `onVerify("dev-bypass")` pour
 * permettre le workflow en développement.
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
  const [sitekey, setSitekey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lire la sitekey côté client (variable d'environnement publique)
  useEffect(() => {
    setSitekey(process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? null);
  }, []);

  const renderWidget = useCallback(async () => {
    if (!containerRef.current || !sitekey || !window.turnstile) return;

    // Nettoyer un éventuel widget précédent
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey,
      callback: (token: string) => {
        setError(null);
        onVerify(token);
      },
      "error-callback": () => {
        setError("turnstile_error");
        onError?.();
      },
      "expired-callback": () => {
        onVerify("");
        onExpire?.();
      },
      theme,
      action,
    });
  }, [sitekey, onVerify, onExpire, onError, theme, action]);

  useEffect(() => {
    if (!sitekey) {
      // Pas de sitekey en dev : bypass
      onVerify("dev-bypass");
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
        } catch {
          // ignore
        }
      }
    };
    // onVerify est intentionnellement omis : sa référence peut changer à
    // chaque render du parent sans qu'on veuille re-render le widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
