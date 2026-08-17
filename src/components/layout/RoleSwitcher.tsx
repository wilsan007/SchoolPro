"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronDown, Check, Loader2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { switchRoleAction } from "@/lib/actions/switch-role";

/** Labels courts pour chaque rôle, affichés dans le dropdown. */
const ROLE_LABEL_KEYS: Record<Role, string> = {
  SUPER_ADMIN: "SUPER_ADMIN",
  TENANT_ADMIN: "TENANT_ADMIN",
  PRINCIPAL: "PRINCIPAL",
  SECRETARY: "SECRETARY",
  TEACHER: "TEACHER",
  CLASS_TEACHER: "CLASS_TEACHER",
  COUNSELOR: "COUNSELOR",
  NURSE: "NURSE",
  ACCOUNTANT: "ACCOUNTANT",
  CAISSIER: "CAISSIER",
  SUPERVISOR: "SUPERVISOR",
  SUBJECT_LEAD: "SUBJECT_LEAD",
  SITE_MANAGER: "SITE_MANAGER",
  INSPECTOR: "INSPECTOR",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
};

interface RoleSwitcherProps {
  /** Tous les rôles possédés par l'utilisateur dans le tenant actif. */
  availableRoles: Role[];
  /** Rôle actuellement actif. */
  currentRole: Role;
}

/**
 * Bascule entre les rôles possédés par l'utilisateur dans le même tenant.
 *
 * Utilise une **Server Action** (`switchRoleAction`) au lieu d'une API
 * route : `unstable_update` de next-auth v5 persiste correctement le
 * cookie de session dans les Server Actions (pas dans les Route
 * Handlers). La page est rafraîchie automatiquement via
 * `revalidatePath` + `router.refresh()`.
 */
export function RoleSwitcher({ availableRoles, currentRole }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const tRoles = useTranslations("roles");
  const tCouverture = useTranslations("couverture");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ne pas afficher si moins de 2 rôles disponibles.
  if (availableRoles.length < 2) return null;

  function handleSwitch(role: Role) {
    if (isPending || role === currentRole) return;
    setSwitchingTo(role);

    startTransition(async () => {
      try {
        const result = await switchRoleAction(role);
        if (!result.success) {
          console.error("Erreur switch role:", result.error);
          setSwitchingTo(null);
          setOpen(false);
          return;
        }

        // La Server Action a déjà appelé revalidatePath, mais on
        // force un router.refresh() pour que les Server Components
        // re-render avec le nouveau rôle immédiatement.
        router.refresh();
      } catch (error) {
        console.error("Erreur switch role:", error);
        setSwitchingTo(null);
        setOpen(false);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
          "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
        )}
      >
        <UserCog className="flex-shrink-0 w-4 h-4 text-indigo-400" />
        <span className="flex-1 text-left truncate">
          {tRoles(currentRole)}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 flex-shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl z-[100] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tCouverture("switchRole")}
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {availableRoles.map((role) => {
              const isCurrent = role === currentRole;
              const isSwitching = switchingTo === role;
              return (
                <button
                  key={role}
                  onClick={() => {
                    if (!isCurrent) handleSwitch(role);
                    else setOpen(false);
                  }}
                  disabled={isPending}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2.5 text-sm transition-colors text-left",
                    isCurrent
                      ? "bg-indigo-600/20 text-indigo-200"
                      : "text-slate-300 hover:bg-slate-800",
                    isPending && !isSwitching && "opacity-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {tRoles(ROLE_LABEL_KEYS[role])}
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
