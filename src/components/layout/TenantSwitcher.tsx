"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Building2, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AvailableTenant } from "@/auth.config";
import { useTranslations } from "next-intl";

interface TenantSwitcherProps {
  currentTenantName: string;
  currentTenantId?: string | null;
  availableTenants?: AvailableTenant[];
}

export function TenantSwitcher({ currentTenantName, currentTenantId, availableTenants = [] }: TenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("login");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ne pas afficher le switcher si moins de 2 tenants
  if (availableTenants.length < 2) {
    return (
      <p className="text-sm text-indigo-300/60 truncate mt-2 font-medium tracking-tight">
        {currentTenantName}
      </p>
    );
  }

  async function handleSwitch(tenantId: string) {
    if (switching) return;
    setSwitching(true);
    setSwitchingTo(tenantId);

    try {
      const res = await fetch("/api/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors du changement");
      }

      // Recharger la page pour que le JWT soit mis à jour
      router.refresh();
      window.location.reload();
    } catch (error) {
      console.error("Erreur switch tenant:", error);
      setSwitching(false);
      setSwitchingTo(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm text-indigo-300/60 hover:text-indigo-200 transition-colors group"
      >
        <span className="truncate font-medium tracking-tight max-w-[180px]">
          {currentTenantName}
        </span>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {t("switchTenant")}
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {availableTenants.map((tenant) => {
              const isCurrent = tenant.tenantId === currentTenantId;
              const isSwitching = switchingTo === tenant.tenantId;
              return (
                <button
                  key={tenant.tenantId}
                  onClick={() => {
                    if (!isCurrent) handleSwitch(tenant.tenantId);
                    else setOpen(false);
                  }}
                  disabled={switching}
                  className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left ${
                    isCurrent
                      ? "bg-indigo-600/20 text-indigo-200"
                      : "text-slate-300 hover:bg-slate-800"
                  } ${switching && !isSwitching ? "opacity-50" : ""}`}
                >
                  <Building2 className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{tenant.tenantName}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {tenant.tenantSlug}
                    </p>
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
