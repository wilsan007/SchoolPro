"use client";

import React, { useRef, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useWindowManager } from "./WindowManager";
import { WindowFrame } from "./WindowFrame";
import { Dock } from "./Dock";
import { DockSearch } from "./DockSearch";
import { LAYOUT_GEOMETRY, type LayoutMode } from "./types";
import { getRouteMeta } from "@/lib/nav-metadata";
import { accueilPourRole } from "@/lib/accueil-par-role";
import { Monitor, Columns2, Rows2, Grid2x2, School, Search, Command } from "lucide-react";
import type { Role } from "@prisma/client";
import type { AvailableTenant } from "@/auth.config";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { SiteSwitcher } from "@/components/layout/SiteSwitcher";
import { RoleSwitcher } from "@/components/layout/RoleSwitcher";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { TimeMachineButton } from "@/components/time-machine/TimeMachineButton";

const LAYOUT_OPTIONS: { mode: LayoutMode; icon: typeof Monitor; label: string }[] = [
  { mode: "fullscreen", icon: Monitor, label: "Plein écran" },
  { mode: "split-h", icon: Columns2, label: "Split H" },
  { mode: "split-v", icon: Rows2, label: "Split V" },
  { mode: "quad-4", icon: Grid2x2, label: "4 quadrants" },
];

interface WorkspaceProps {
  roleKey: string;
  userName?: string;
  userAvatar?: string;
  tenantName?: string;
  tenantId?: string | null;
  isSuperAdmin?: boolean;
  availableTenants?: AvailableTenant[];
  sites?: { id: string; nom: string; code?: string | null }[];
  currentSiteId?: string | null;
  isSiteAdmin?: boolean;
  availableRoles?: Role[];
  currentRole?: Role;
}

export function Workspace({
  roleKey,
  userName = "Admin",
  userAvatar,
  tenantName = "Mon École",
  tenantId,
  isSuperAdmin = false,
  availableTenants = [],
  sites = [],
  currentSiteId = null,
  isSiteAdmin = false,
  availableRoles = [],
  currentRole,
}: WorkspaceProps) {
  const {
    visibleWindows,
    activeWindowId,
    layout,
    setLayout,
    openWindow,
  } = useWindowManager();

  const [searchOpen, setSearchOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const geometry = LAYOUT_GEOMETRY[layout];
  const pathname = usePathname();
  const initialOpenRef = useRef(false);

  // Ouvrir la fenêtre initiale basée sur la route courante.
  useEffect(() => {
    if (initialOpenRef.current) return;
    initialOpenRef.current = true;
    if (!pathname || pathname === "/") return;

    const accueil = accueilPourRole(roleKey);
    const routeCible = pathname === "/dashboard" && accueil ? accueil : pathname;

    const meta = getRouteMeta(routeCible);
    openWindow(routeCible, meta.title, meta.icon, meta.iconColor);
  }, [pathname, openWindow, roleKey]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-background via-background to-secondary/40">
      {/* Halo décoratif unique — Azure Bloom (réduit pour GPU) */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/[0.04] blur-[80px] pointer-events-none" aria-hidden />

      {/* Barre d'outils top — glassmorphisme Azure Bloom, bordure gris bleuté */}
      <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-card/60 backdrop-blur-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.02)] print:hidden gap-3">
        {/* Logo + switchers */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-[0_4px_16px_hsl(198_65%_46%/0.2)]">
              <School className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-display font-bold tracking-wide text-navy hidden sm:inline">SchoolPro</span>
          </div>
          <TenantSwitcher currentTenantName={tenantName} currentTenantId={tenantId} availableTenants={availableTenants} />
          <SiteSwitcher currentSiteId={currentSiteId} sites={sites} isAdmin={isSiteAdmin} />
        </div>

        {/* Barre de recherche + Layout switcher */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bouton recherche Cmd+K */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary/50 border border-border/40 text-sm text-muted-foreground hover:text-navy hover:bg-secondary/70 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            title="Rechercher un module (Cmd+K)"
          >
            <Search className="w-4 h-4" />
            <span className="text-xs">Rechercher...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-card text-[10px] font-mono text-muted-foreground border border-border">
              <Command className="w-3 h-3" />
              <span>K</span>
            </kbd>
          </button>

          {/* Layout switcher */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-secondary/40 border border-border/30">
            {LAYOUT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = layout === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setLayout(opt.mode)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-gradient-to-r from-primary to-info text-white shadow-[0_2px_8px_hsl(198_65%_46%/0.2)]"
                      : "text-muted-foreground hover:text-navy hover:bg-secondary/60"
                  )}
                  title={opt.label}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden lg:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Role switcher + langue + Time Machine + profil */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {availableRoles.length >= 2 && (
            <RoleSwitcher availableRoles={availableRoles} currentRole={currentRole ?? (roleKey as Role)} />
          )}
          <LanguageSwitcher />
          <TimeMachineButton />
          <a
            href="/profil"
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-secondary/60 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-accent text-white text-xs font-bold flex items-center justify-center shadow-[0_2px_8px_hsl(198_65%_46%/0.1)]">
              {userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-navy hidden md:inline">{userName.split(" ")[0]}</span>
          </a>
        </div>
      </div>

      {/* Zone de travail — les fenêtres sont positionnées selon le layout */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden p-2"
      >
        {visibleWindows.length === 0 ? (
          <EmptyWorkspace />
        ) : (
          visibleWindows.map((win, i) => {
            const slot = geometry[i] ?? geometry[geometry.length - 1];
            const isActive = activeWindowId === win.id;
            return (
              <WindowFrame
                key={win.id}
                window={win}
                slot={slot}
                isActive={isActive}
                containerRef={containerRef}
              />
            );
          })
        )}
      </div>

      {/* Dock en bas d'écran — barre divisée catégories | pages */}
      <Dock roleKey={roleKey} />

      {/* Recherche de modules Cmd+K */}
      <DockSearchTrigger open={searchOpen} onOpenChange={setSearchOpen} roleKey={roleKey} />
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      {/* Halo coloré derrière l'icône */}
      <div className="absolute w-48 h-48 rounded-full bg-primary/[0.05] blur-[50px]" aria-hidden />

      <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-tr from-primary/15 via-info/10 to-accent/10 flex items-center justify-center mb-4 shadow-[0_8px_32px_hsl(198_65%_46%/0.08),0_0_24px_hsl(258_58%_58%/0.06)] border border-primary/10">
        <Monitor className="w-12 h-12 text-primary/50" />
      </div>
      <h2 className="relative text-xl font-display font-bold text-navy mb-1.5">
        Espace de travail
      </h2>
      <p className="relative text-sm text-muted-foreground max-w-sm leading-relaxed">
        Sélectionnez une catégorie dans la barre en bas, puis choisissez une page.
        La page s&apos;affiche ici. En mode split ou quadrants, la nouvelle page
        remplace la dernière fenêtre affichée.
      </p>
    </div>
  );
}

/**
 * Trigger pour DockSearch — gère l'état ouvert/fermé et le raccourci clavier.
 * Séparé pour éviter de re-render tout le Workspace à chaque frappe dans la recherche.
 */
function DockSearchTrigger({ open, onOpenChange, roleKey }: { open: boolean; onOpenChange: (v: boolean) => void; roleKey: string }) {
  // Raccourci clavier global Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  if (!open) return null;
  return <DockSearch roleKey={roleKey} />;
}
