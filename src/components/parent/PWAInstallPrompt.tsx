"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Affiche une bannière d'installation PWA sur mobile (Android/Chrome).
 * Sur iOS, affiche une instruction d'ajout à l'écran d'accueil.
 */
export function PWAInstallPrompt() {
  const t = useTranslations("parentPortal");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Déjà installé ?
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari ne supporte pas beforeinstallprompt
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      const dismissedBefore = localStorage.getItem("pwa-ios-dismissed");
      if (!dismissedBefore) setShowIOSHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed) return null;

  // Android / Chrome : bannière d'installation native
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-2xl">📱</div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{t("installTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("installDesc")}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={async () => {
                  await deferredPrompt.prompt();
                  await deferredPrompt.userChoice;
                  setDeferredPrompt(null);
                  setDismissed(true);
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                {t("installBtn")}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              >
                {t("installLater")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // iOS : instructions manuelles
  if (showIOSHint) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-2xl">📱</div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{t("installTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("installIOS")}{" "}
              <span className="inline-flex items-center gap-0.5 font-medium">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>{" "}
              {t("installIOS2")}
            </p>
            <button
              onClick={() => {
                localStorage.setItem("pwa-ios-dismissed", "1");
                setShowIOSHint(false);
                setDismissed(true);
              }}
              className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium"
            >
              {t("installLater")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
