"use client";

import React, { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { canAccessRoute, type PermissionOverrides } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";
import { ChevronRight, Grid3x3, LogOut, Menu, School, X } from "lucide-react";
import { signOut } from "next-auth/react";
import type { LucideIcon } from "lucide-react";
import { NAV_GROUPS, PINNED_MOBILE, PINNED_MOBILE_DEFAUT } from "@/lib/nav-items";

interface MobileNavItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
}

interface MobileNavGroup {
  groupKey: string;
  labelKey: string;
  icon: LucideIcon;
  accent: string;
  items: MobileNavItem[];
}

const mobileNavGroups: MobileNavGroup[] = NAV_GROUPS.map((g) => ({
  groupKey: g.groupKey,
  labelKey: g.groupKey,
  icon: g.icon,
  accent: g.accent,
  items: g.items,
}));

/* ------------------------------------------------------------------ */
//  Détecte les 4 items les plus "importants" pour la barre du bas
/* ------------------------------------------------------------------ */

interface MobileLayoutProps {
  roleKey: string;
  userName?: string;
  children: React.ReactNode;
  /** Dérogations utilisateur calculées par le layout serveur (cf. `Dock`). */
  permissionOverrides?: PermissionOverrides;
}

export function MobileLayout({ roleKey, userName = "Admin", children, permissionOverrides }: MobileLayoutProps) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const availableGroups = useMemo(() => {
    return mobileNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.href === "/dashboard" && accueilPourRole(roleKey)) return false;
          return canAccessRoute(roleKey, item.href, permissionOverrides);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [roleKey, permissionOverrides]);

  // Items épinglés pour la barre du bas
  const pinned = useMemo(
    () => PINNED_MOBILE[roleKey] ?? PINNED_MOBILE_DEFAUT,
    [roleKey]
  );
  const bottomItems = useMemo(() => {
    const flat = availableGroups.flatMap((g) => g.items);
    return pinned
      .map((href) => flat.find((i) => i.href === href))
      .filter(Boolean) as MobileNavItem[];
  }, [availableGroups, pinned]);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      {/* Header mobile — compact, sans glassmorphisme lourd */}
      <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-navy hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t("menu")}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-sm">
            <School className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-display font-bold text-navy">SchoolPro</span>
        </div>
        <a
          href="/profil"
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent text-white text-[10px] font-bold flex items-center justify-center shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </a>
      </header>

      {/* Contenu — rendu DIRECTEMENT (pas d'iframe) */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>

      {/* Barre de navigation du bas — 4 items + bouton menu */}
      <nav className="shrink-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 safe-area-pb">
        {bottomItems.map((item) => {
          const ItemIcon = item.icon;
          const active = isActive(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-2xl transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-navy hover:bg-secondary/50"
              )}
            >
              <ItemIcon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{t(item.labelKey)}</span>
            </a>
          );
        })}
        <button
          onClick={() => { setDrawerOpen(true); setActiveGroup(null); }}
          className="flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-2xl text-muted-foreground hover:text-navy hover:bg-secondary/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <Grid3x3 className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">{t("plus")}</span>
        </button>
      </nav>

      {/* Drawer de navigation complète */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-navy/30 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm bg-card border-r border-border shadow-2xl animate-sidebar-expand flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-sm">
                  <School className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-display font-bold text-navy">SchoolPro</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-navy hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
              {activeGroup ? (
                /* Vue groupe */
                <>
                  <button
                    onClick={() => setActiveGroup(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-navy mb-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg px-2 py-1"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Retour
                  </button>
                  {(() => {
                    const group = availableGroups.find((g) => g.groupKey === activeGroup);
                    if (!group) return null;
                    return (
                      <div className="space-y-1">
                        <h3
                          className="text-xs font-display font-bold tracking-wider uppercase px-2 py-1 mb-2"
                          style={{ color: `hsl(${group.accent})` }}
                        >
                          {t(group.labelKey)}
                        </h3>
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const active = isActive(item.href);
                          return (
                            <a
                              key={item.href}
                              href={item.href}
                              onClick={() => setDrawerOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "text-foreground hover:bg-secondary"
                              )}
                            >
                              <ItemIcon className="w-4 h-4 shrink-0" />
                              {t(item.labelKey)}
                            </a>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* Vue groupes */
                availableGroups.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <button
                      key={group.groupKey}
                      onClick={() => setActiveGroup(group.groupKey)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `hsl(${group.accent} / 0.15)`,
                          color: `hsl(${group.accent})`,
                        }}
                      >
                        <GroupIcon className="w-4 h-4" />
                      </div>
                      <span className="flex-1">{t(group.labelKey)}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{group.items.length}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Drawer footer — déconnexion */}
            <div className="shrink-0 border-t border-border px-4 py-3 safe-area-pb">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {tCommon("logout")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
