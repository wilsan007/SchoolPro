"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MapPin, Check, Loader2, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface SiteOption {
  id: string;
  nom: string;
  code?: string | null;
}

interface SiteSwitcherProps {
  currentSiteId: string | null | undefined;
  sites: SiteOption[];
  isAdmin?: boolean;
}

export function SiteSwitcher({ currentSiteId, sites, isAdmin = false }: SiteSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("nav");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ne pas afficher le switcher s'il n'y a qu'un seul site ou aucun
  if (sites.length <= 1) {
    const current = sites.find((s) => s.id === currentSiteId);
    if (current) {
      return (
        <p className="text-xs text-slate-500 truncate mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          {current.nom}
        </p>
      );
    }
    return null;
  }

  const currentSite = sites.find((s) => s.id === currentSiteId);
  const displayLabel = currentSite ? currentSite.nom : t("allSites");

  async function handleSwitch(siteId: string | null) {
    if (switching) return;
    setSwitching(true);
    setSwitchingTo(siteId ?? "ALL");

    try {
      const res = await fetch("/api/switch-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors du changement");
      }

      router.refresh();
      window.location.reload();
    } catch (error) {
      console.error("Erreur switch site:", error);
      setSwitching(false);
      setSwitchingTo(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors group"
      >
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span className="truncate font-medium max-w-[160px]">
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-[100] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {t("switchSite")}
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {/* Option "Tous les sites" — réservée aux TENANT_ADMIN / SUPER_ADMIN */}
            {isAdmin && (
            <button
              onClick={() => handleSwitch(null)}
              disabled={switching}
              className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left ${
                !currentSiteId
                  ? "bg-indigo-600/20 text-indigo-200"
                  : "text-slate-300 hover:bg-slate-800"
              } ${switching && switchingTo !== "ALL" ? "opacity-50" : ""}`}
            >
              <Layers className="w-4 h-4 flex-shrink-0 text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{t("allSites")}</p>
              </div>
              {switchingTo === "ALL" && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 flex-shrink-0" />
              )}
              {!currentSiteId && switchingTo !== "ALL" && (
                <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              )}
            </button>
            )}

            {/* Liste des sites */}
            {sites.map((site) => {
              const isCurrent = site.id === currentSiteId;
              const isSwitching = switchingTo === site.id;
              return (
                <button
                  key={site.id}
                  onClick={() => {
                    if (!isCurrent) handleSwitch(site.id);
                    else setOpen(false);
                  }}
                  disabled={switching}
                  className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left ${
                    isCurrent
                      ? "bg-indigo-600/20 text-indigo-200"
                      : "text-slate-300 hover:bg-slate-800"
                  } ${switching && !isSwitching ? "opacity-50" : ""}`}
                >
                  <MapPin className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{site.nom}</p>
                    {site.code && (
                      <p className="text-[10px] text-slate-500 truncate">
                        {site.code}
                      </p>
                    )}
                  </div>
                  {isSwitching && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 flex-shrink-0" />
                  )}
                  {isCurrent && !isSwitching && (
                    <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
