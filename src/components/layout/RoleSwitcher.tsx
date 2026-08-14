"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Rôles entre lesquels l'utilisateur peut basculer.
 *
 * "WORK" = mode Travail (enseignant, personnel).
 * "PARENT" = mode Parent (accès à l'espace famille).
 */
export type RoleMode = "WORK" | "PARENT";

interface RoleSwitcherProps {
  /** Rôles effectivement disponibles pour cet utilisateur. */
  availableModes: RoleMode[];
  /** Mode actuellement actif. */
  currentMode: RoleMode;
}

/**
 * Bascule entre le mode Travail et le mode Parent.
 *
 * Un utilisateur qui est à la fois enseignant et parent dans le même
 * établissement peut changer de contexte sans se déconnecter. Le bouton
 * appelle `/api/switch-role` qui met à jour le rôle actif dans la session.
 */
export function RoleSwitcher({ availableModes, currentMode }: RoleSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const router = useRouter();
  const t = useTranslations("couverture");

  // Ne pas afficher si moins de 2 modes disponibles.
  if (availableModes.length < 2) return null;

  const targetMode: RoleMode = currentMode === "WORK" ? "PARENT" : "WORK";

  async function handleSwitch() {
    if (switching) return;
    setSwitching(true);

    try {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: targetMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors du changement de rôle");
      }

      // Recharger la page pour que le JWT soit mis à jour.
      router.refresh();
      window.location.reload();
    } catch (error) {
      console.error("Erreur switch role:", error);
      setSwitching(false);
    }
  }

  return (
    <button
      onClick={handleSwitch}
      disabled={switching}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
        "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60",
        switching && "opacity-60 cursor-wait"
      )}
    >
      {switching ? (
        <Loader2 className="flex-shrink-0 w-4 h-4 animate-spin text-indigo-400" />
      ) : currentMode === "WORK" ? (
        <Briefcase className="flex-shrink-0 w-4 h-4 text-emerald-400" />
      ) : (
        <Heart className="flex-shrink-0 w-4 h-4 text-pink-400" />
      )}
      <span className="flex-1 text-left truncate">
        {currentMode === "WORK" ? t("modeTravail") : t("modeParent")}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-300 transition-colors">
        {t("basculerRole")}
      </span>
    </button>
  );
}
