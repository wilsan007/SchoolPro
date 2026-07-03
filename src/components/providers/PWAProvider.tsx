"use client";

import { useEffect } from "react";

export function PWAProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
      }
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[EcolPro PWA] Service Worker enregistré", reg.scope);
        })
        .catch((err) => {
          console.warn("[EcolPro PWA] Échec enregistrement SW:", err);
        });
    }
  }, []);

  return null;
}
