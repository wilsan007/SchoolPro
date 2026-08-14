"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, X } from "lucide-react";

interface ImpersonationState {
  impersonating: boolean;
  impersonatedTenantName: string | null;
  impersonatedUserEmail: string | null;
}

/**
 * Bannière d'impersonation — s'affiche en haut de l'écran lorsqu'un
 * SUPER_ADMIN a pris le contrôle d'un tenant. Le bouton « Quitter »
 * restaure la session originale via DELETE /api/super-admin/impersonate.
 */
export function ImpersonationBanner() {
  const t = useTranslations("superAdmin");
  const [state, setState] = useState<ImpersonationState>({
    impersonating: false,
    impersonatedTenantName: null,
    impersonatedUserEmail: null,
  });
  const [exiting, setExiting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/impersonate/status");
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch {
      // Silencieux : la bannière n'est pas critique pour le fonctionnement
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleExit = useCallback(async () => {
    setExiting(true);
    try {
      const res = await fetch("/api/super-admin/impersonate", { method: "DELETE" });
      if (res.ok) {
        setState({
          impersonating: false,
          impersonatedTenantName: null,
          impersonatedUserEmail: null,
        });
        // Recharger la page pour que tout le contexte soit cohérent
        window.location.href = "/super-admin";
      }
    } catch {
      // Silencieux
    } finally {
      setExiting(false);
    }
  }, []);

  if (!state.impersonating) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 print:hidden">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <p className="text-sm font-medium truncate">
          {t("bannerImpersonation", {
            email: state.impersonatedUserEmail ?? "?",
            tenant: state.impersonatedTenantName ?? "?",
          })}
        </p>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
      >
        <X className="h-3.5 w-3.5" />
        {exiting ? "..." : t("quitterImpersonation")}
      </button>
    </div>
  );
}
