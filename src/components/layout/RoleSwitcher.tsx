"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronDown, Check, Loader2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { switchRoleAction } from "@/lib/actions/switch-role";
import { accueilPourRole } from "@/lib/accueil-par-role";
import { useWindowManager } from "@/components/workspace/WindowManager";

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
  const { closeAllWindows } = useWindowManager();
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

    // Fermer toutes les fenêtres ouvertes : les pages de l'ancien rôle
    // ne sont pas pertinentes pour le nouveau.
    closeAllWindows();

    startTransition(async () => {
      try {
        const result = await switchRoleAction(role);
        if (!result.success) {
          console.error("Erreur switch role:", result.error);
          setSwitchingTo(null);
          setOpen(false);
          return;
        }

        // Naviguer vers l'accueil du nouveau rôle : rester sur la page
        // courante enverrait vers /acces-bloque tout rôle sans droit sur
        // elle (ex. basculer vers STUDENT depuis /direction).
        const accueil = accueilPourRole(role);
        if (accueil) {
          router.push(accueil);
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
          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
          "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        )}
      >
        <UserCog className="flex-shrink-0 w-4 h-4 text-accent/70" />
        <span className="flex-1 text-left truncate hidden md:inline">
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
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-2xl shadow-xl z-[300] overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-muted",
                    isPending && !isSwitching && "opacity-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {tRoles(ROLE_LABEL_KEYS[role])}
                    </p>
                  </div>
                  {isSwitching && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent flex-shrink-0" />
                  )}
                  {isCurrent && !isSwitching && (
                    <Check className="w-4 h-4 text-accent flex-shrink-0" />
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
