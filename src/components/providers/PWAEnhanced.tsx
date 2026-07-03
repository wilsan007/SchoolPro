"use client";

import { useEffect, useState } from "react";
import { WifiOff, Download, X } from "lucide-react";

export function PWAEnhanced() {
  const [isOnline, setIsOnline] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Online/offline detection
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    // PWA install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("[PWA] App installed");
    }
    setDeferredPrompt(null);
    setShowInstall(false);
  }

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center text-sm py-1.5 flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          Mode hors ligne — certaines fonctionnalités sont limitées
        </div>
      )}

      {/* Install prompt */}
      {showInstall && (
        <div className="fixed bottom-4 right-4 z-[100] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-xs">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Download className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Installer EcolPro
              </p>
            </div>
            <button
              onClick={() => setShowInstall(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Accédez rapidement à EcolPro depuis votre écran d'accueil.
          </p>
          <button
            onClick={handleInstall}
            className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Installer
          </button>
        </div>
      )}
    </>
  );
}
