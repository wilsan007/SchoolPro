"use client";

import { useState, useEffect } from "react";
import { MapPin, AlertCircle, Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";

interface SiteOption {
  id: string;
  nom: string;
  code?: string | null;
}

interface RequireSiteModalProps {
  open: boolean;
  sites: SiteOption[];
  onClose: () => void;
  onSiteSelected?: (siteId: string) => void;
  message?: string;
}

export function RequireSiteModal({
  open,
  sites,
  onClose,
  onSiteSelected,
  message = "Vous devez sélectionner un site avant de pouvoir créer un élément. Choisissez un site dans la liste ci-dessous.",
}: RequireSiteModalProps) {
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setError(null);
      setSwitching(false);
      setSwitchingTo(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleSelect(siteId: string) {
    if (switching) return;
    setSwitching(true);
    setSwitchingTo(siteId);
    setError(null);

    try {
      const res = await fetch("/api/switch-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors du changement de site");
      }

      onSiteSelected?.(siteId);
      router.refresh();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du changement de site");
      setSwitching(false);
      setSwitchingTo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Sélection de site requise
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Site list */}
        <div className="px-6 pb-2">
          <div className="max-h-64 overflow-y-auto space-y-1">
            {sites.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">
                Aucun site disponible. Contactez un administrateur.
              </p>
            )}
            {sites.map((site) => {
              const isSwitching = switchingTo === site.id;
              return (
                <button
                  key={site.id}
                  onClick={() => handleSelect(site.id)}
                  disabled={switching}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-colors ${
                    switching && !isSwitching
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  } ${isSwitching ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {site.nom}
                    </p>
                    {site.code && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {site.code}
                      </p>
                    )}
                  </div>
                  {isSwitching ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-transparent flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6 pt-2">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            disabled={switching}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
