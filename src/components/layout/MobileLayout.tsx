"use client";

import React, { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { canAccessRoute } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";
import {
  LayoutDashboard, Users, ClipboardList, BookOpen, Target, Sparkles,
  Gauge, HandHeart, Calendar, GraduationCap, MessageSquare, Receipt,
  Settings, UserCheck, BarChart3, Shield, ShieldCheck, UserPlus,
  Briefcase, Bell, FileText, Compass, Archive, Package, Crown, PlayCircle,
  ListTodo, NotebookPen, Sun, Wrench, ClipboardCheck, BookOpenCheck,
  Grid3x3, GitCompare, Wallet, Gavel, HeartHandshake, CheckSquare, Activity,
  Brain, School, Menu, X, ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

const mobileNavGroups: MobileNavGroup[] = [
  {
    groupKey: "accueil",
    labelKey: "accueil",
    icon: School,
    accent: "200 70% 46%",
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { labelKey: "direction", icon: Gauge, href: "/direction" },
      { labelKey: "monEspace", icon: Briefcase, href: "/mon-espace" },
      { labelKey: "maClasse", icon: Users, href: "/ma-classe" },
      { labelKey: "maMatiere", icon: Target, href: "/ma-matiere" },
      { labelKey: "couverture", icon: ShieldCheck, href: "/couverture" },
      { labelKey: "devoirs", icon: NotebookPen, href: "/devoirs" },
      { labelKey: "monParcours", icon: HandHeart, href: "/parent" },
      { labelKey: "monParcoursEleve", icon: Target, href: "/eleve" },
      { labelKey: "monEmploi", icon: Calendar, href: "/mon-emploi" },
      { labelKey: "travail", icon: ListTodo, href: "/travail" },
      { labelKey: "maJournee", icon: Sun, href: "/ma-journee" },
      { labelKey: "entrainement", icon: Sparkles, href: "/entrainement" },
      { labelKey: "revisionSemaine", icon: BookOpenCheck, href: "/revision-semaine" },
      { labelKey: "secretariat", icon: FileText, href: "/secretariat" },
      { labelKey: "conseiller", icon: Compass, href: "/conseiller" },
      { labelKey: "infirmerie", icon: HandHeart, href: "/infirmerie" },
      { labelKey: "comptabilite", icon: Receipt, href: "/comptabilite" },
      { labelKey: "exploitation", icon: Wrench, href: "/exploitation" },
      { labelKey: "inspection", icon: ClipboardCheck, href: "/inspection" },
    ],
  },
  {
    groupKey: "groupPedagogie",
    labelKey: "groupPedagogie",
    icon: BookOpen,
    accent: "186 55% 42%",
    items: [
      { labelKey: "eleves", icon: Users, href: "/eleves" },
      { labelKey: "notes", icon: BookOpen, href: "/notes" },
      { labelKey: "cahierJournal", icon: NotebookPen, href: "/cahier-journal" },
      { labelKey: "curriculum", icon: Target, href: "/curriculum" },
      { labelKey: "recommandations", icon: Sparkles, href: "/recommandations" },
      { labelKey: "plansLecon", icon: BookOpenCheck, href: "/plans-lecon" },
      { labelKey: "rubriquesEvaluation", icon: Grid3x3, href: "/rubriques-evaluation" },
      { labelKey: "propositionsIa", icon: ClipboardCheck, href: "/propositions-ia" },
      { labelKey: "examens", icon: GraduationCap, href: "/evaluations" },
      { labelKey: "sessionsExamens", icon: ClipboardCheck, href: "/examens" },
      { labelKey: "conseilAugmente", icon: Brain, href: "/conseil-augmente" },
      { labelKey: "mentorat", icon: HeartHandshake, href: "/mentorat" },
      { labelKey: "cours", icon: PlayCircle, href: "/cours" },
      { labelKey: "emploi", icon: Calendar, href: "/emploi-du-temps" },
      { labelKey: "fournitures", icon: Package, href: "/fournitures" },
    ],
  },
  {
    groupKey: "groupVieScolaire",
    labelKey: "groupVieScolaire",
    icon: Shield,
    accent: "220 60% 50%",
    items: [
      { labelKey: "absences", icon: ClipboardList, href: "/absences" },
      { labelKey: "veilleAssiduite", icon: Activity, href: "/veille-assiduite" },
      { labelKey: "vieScolaire", icon: Shield, href: "/vie-scolaire" },
      { labelKey: "parents", icon: UserCheck, href: "/parents" },
    ],
  },
  {
    groupKey: "groupGestion",
    labelKey: "groupGestion",
    icon: Receipt,
    accent: "188 55% 45%",
    items: [
      { labelKey: "admissions", icon: UserPlus, href: "/admissions" },
      { labelKey: "facturation", icon: Receipt, href: "/facturation" },
      { labelKey: "caisse", icon: Wallet, href: "/caisse" },
      { labelKey: "rh", icon: Briefcase, href: "/rh" },
      { labelKey: "inventaire", icon: Package, href: "/inventaire" },
      { labelKey: "gouvernance", icon: Gavel, href: "/gouvernance" },
    ],
  },
  {
    groupKey: "groupCommunication",
    labelKey: "groupCommunication",
    icon: Bell,
    accent: "260 55% 58%",
    items: [
      { labelKey: "messages", icon: MessageSquare, href: "/messages" },
      { labelKey: "communication", icon: Bell, href: "/communication" },
    ],
  },
  {
    groupKey: "groupRapports",
    labelKey: "groupRapports",
    icon: BarChart3,
    accent: "245 50% 55%",
    items: [
      { labelKey: "rapports", icon: FileText, href: "/rapports" },
      { labelKey: "analytics", icon: BarChart3, href: "/analytics" },
      { labelKey: "intelligence", icon: Brain, href: "/intelligence" },
      { labelKey: "comparateur", icon: GitCompare, href: "/comparateur" },
      { labelKey: "orientation", icon: Compass, href: "/orientation" },
      { labelKey: "alumni", icon: Archive, href: "/alumni" },
    ],
  },
  {
    groupKey: "systeme",
    labelKey: "systeme",
    icon: Settings,
    accent: "210 18% 45%",
    items: [
      { labelKey: "taches", icon: CheckSquare, href: "/taches" },
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin" },
      { labelKey: "parametres", icon: Settings, href: "/parametres" },
    ],
  },
];

/* ------------------------------------------------------------------ */
//  Détecte les 4 items les plus "importants" pour la barre du bas
/* ------------------------------------------------------------------ */
const pinnedMobileItems: Record<string, string[]> = {
  SUPER_ADMIN: ["/dashboard", "/super-admin", "/parametres", "/analytics"],
  TENANT_ADMIN: ["/dashboard", "/direction", "/eleves", "/parametres"],
  PRINCIPAL: ["/dashboard", "/direction", "/eleves", "/absences"],
  SECRETARY: ["/dashboard", "/secretariat", "/eleves", "/absences"],
  TEACHER: ["/ma-matiere", "/cahier-journal", "/notes", "/emploi-du-temps"],
  CLASS_TEACHER: ["/ma-classe", "/eleves", "/absences", "/notes"],
  COUNSELOR: ["/conseiller", "/eleves", "/orientation", "/mentorat"],
  NURSE: ["/infirmerie", "/vie-scolaire", "/eleves", "/absences"],
  ACCOUNTANT: ["/comptabilite", "/facturation", "/caisse", "/parametres"],
  CAISSIER: ["/caisse", "/facturation", "/comptabilite", "/parametres"],
  PARENT: ["/parent", "/eleve", "/factures", "/messages"],
  STUDENT: ["/eleve", "/mon-emploi", "/entrainement", "/devoirs"],
};

interface MobileLayoutProps {
  roleKey: string;
  userName?: string;
  children: React.ReactNode;
}

export function MobileLayout({ roleKey, userName = "Admin", children }: MobileLayoutProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const availableGroups = useMemo(() => {
    return mobileNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.href === "/dashboard" && accueilPourRole(roleKey)) return false;
          return canAccessRoute(roleKey, item.href);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [roleKey]);

  // Items épinglés pour la barre du bas
  const pinned = pinnedMobileItems[roleKey] ?? ["/dashboard", "/eleves", "/notes", "/parametres"];
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
          </div>
        </>
      )}
    </div>
  );
}
