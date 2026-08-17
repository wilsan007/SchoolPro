"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, ChevronRight, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import type { AvailableTenant } from "@/auth.config";
import { useTranslations } from "next-intl";

interface TenantSelectorProps {
  tenants: AvailableTenant[];
  userName: string;
}

export function TenantSelector({ tenants, userName }: TenantSelectorProps) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const t = useTranslations("login");

  async function handleSelect(tenantId: string) {
    if (switching) return;
    setSwitching(tenantId);

    try {
      const res = await fetch("/api/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Erreur sélection tenant:", error);
      setSwitching(null);
    }
  }

  return (
    <div className="w-full max-w-lg">
      {/* En-tête */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 mb-4 shadow-lg shadow-indigo-500/20">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {t("selectTenantTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t("selectTenantSubtitle")} <span className="font-semibold text-foreground">{userName}</span>
        </p>
      </div>

      {/* Liste des tenants */}
      <div className="space-y-3">
        {tenants.map((tenant) => {
          const isSwitching = switching === tenant.tenantId;
          return (
            <button
              key={tenant.tenantId}
              onClick={() => handleSelect(tenant.tenantId)}
              disabled={switching !== null}
              className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl border transition-all duration-300 text-left group
                ${switching === null
                  ? "border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 cursor-pointer"
                  : isSwitching
                    ? "border-primary bg-primary/5"
                    : "border-border opacity-50"
                }`}
            >
              {/* Logo / icône */}
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center overflow-hidden">
                {tenant.tenantLogo ? (
                  // Logo téléversé par l'établissement : URL arbitraire, hors des
                  // `remotePatterns` de next.config — `next/image` la rejetterait.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.tenantLogo} alt={tenant.tenantName} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-indigo-500" />
                )}
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {tenant.tenantName}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {tenant.tenantSlug}
                </p>
                <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {tenant.role}
                </span>
              </div>

              {/* Action */}
              <div className="flex-shrink-0">
                {isSwitching ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Déconnexion */}
      <div className="mt-8 text-center">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t("switchAccount")}
        </button>
      </div>
    </div>
  );
}
