"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useWindowManager } from "./WindowManager";
import { canAccessRoute } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Users, ClipboardList, BookOpen, Target, Sparkles,
  Gauge, HandHeart, Calendar, GraduationCap, MessageSquare, Receipt,
  Settings, UserCheck, BarChart3, Shield, ShieldCheck, UserPlus,
  Briefcase, Bell, FileText, Compass, Archive, Package, Crown, PlayCircle,
  ListTodo, NotebookPen, Sun, Wrench, ClipboardCheck, BookOpenCheck,
  Grid3x3, GitCompare, Wallet, Gavel, HeartHandshake, CheckSquare, Activity,
  Brain, School, X,
} from "lucide-react";

interface DockItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
}

interface DockGroup {
  groupKey: string;
  labelKey: string;
  icon: LucideIcon;
  accent: string;
  iconColor: string;
  items: DockItem[];
}

const dockGroups: DockGroup[] = [
  {
    groupKey: "accueil",
    labelKey: "accueil",
    icon: School,
    accent: "200 70% 46%",
    iconColor: "text-primary",
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
    iconColor: "text-info",
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
    iconColor: "text-primary",
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
    iconColor: "text-info",
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
    iconColor: "text-accent",
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
    iconColor: "text-accent",
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
    iconColor: "text-muted-foreground",
    items: [
      { labelKey: "taches", icon: CheckSquare, href: "/taches" },
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin" },
      { labelKey: "parametres", icon: Settings, href: "/parametres" },
    ],
  },
];

interface DockProps {
  roleKey: string;
}

export function Dock({ roleKey }: DockProps) {
  const {
    windows,
    activeWindowId,
    openWindow,
    focusWindow,
    closeWindow,
    registerDockItem,
  } = useWindowManager();
  const t = useTranslations("nav");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const availableGroups = useMemo(() => {
    return dockGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.href === "/dashboard" && accueilPourRole(roleKey)) return false;
          return canAccessRoute(roleKey, item.href);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [roleKey]);

  // Groupe de la fenêtre active
  const activeRoute = useMemo(() => {
    const activeWin = windows.find((w) => w.id === activeWindowId);
    return activeWin?.route ?? null;
  }, [activeWindowId, windows]);

  const activeGroupKey = useMemo(() => {
    if (!activeRoute) return null;
    for (const group of availableGroups) {
      if (group.items.some((item) => item.href === activeRoute)) {
        return group.groupKey;
      }
    }
    return null;
  }, [activeRoute, availableGroups]);

  // Fermer le panneau si on clique en dehors
  useEffect(() => {
    if (!expandedGroup) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpandedGroup(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expandedGroup]);

  // Scroll vers l'onglet actif dans la barre de tabs
  useEffect(() => {
    if (!tabsScrollRef.current || !activeWindowId) return;
    const activeTab = tabsScrollRef.current.querySelector(
      `[data-tab-id="${activeWindowId}"]`
    ) as HTMLElement | null;
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [activeWindowId]);

  function handleGroupClick(groupKey: string) {
    setExpandedGroup((prev) => (prev === groupKey ? null : groupKey));
  }

  function handleItemClick(item: DockItem, groupAccent: string) {
    openWindow(item.href, t(item.labelKey), item.icon, `hsl(${groupAccent})`);
    setExpandedGroup(null);
  }

  function handleTabClick(winId: string) {
    focusWindow(winId);
  }

  function handleTabClose(e: React.MouseEvent, winId: string) {
    e.stopPropagation();
    closeWindow(winId);
  }

  const openGroup = availableGroups.find((g) => g.groupKey === expandedGroup) ?? null;

  // Onglets triés par ordre de focus (plus récent en premier)
  const sortedTabs = useMemo(() => {
    return [...windows].sort((a, b) => b.focusOrder - a.focusOrder);
  }, [windows]);

  return (
    <>
      {/* PANNEAU VERTICAL — se déploie vers le haut au-dessus de la barre */}
      {openGroup && (
        <>
          <div
            className="fixed inset-0 z-40 bg-navy/10 backdrop-blur-[2px] animate-fade-in print:hidden"
            onClick={() => setExpandedGroup(null)}
          />
          <div
            ref={panelRef}
            className="fixed left-0 right-0 bottom-[76px] z-50 animate-fade-up print:hidden"
            style={{ borderBottom: `2px solid hsl(${openGroup.accent} / 0.35)` }}
          >
            <div
              className="w-full bg-card/97 backdrop-blur-[12px] shadow-[0_-12px_48px_hsl(0_0%_0%_/_0.12)] border-t"
              style={{ borderTopColor: `hsl(${openGroup.accent} / 0.4)` }}
            >
              <div className="flex items-center gap-3 px-6 pt-4 pb-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: `hsl(${openGroup.accent})`,
                    color: "white",
                    boxShadow: `0 4px 16px hsl(${openGroup.accent} / 0.35)`,
                  }}
                >
                  <openGroup.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2
                    className="text-lg font-display font-bold tracking-wide leading-tight"
                    style={{ color: `hsl(${openGroup.accent})` }}
                  >
                    {t(openGroup.labelKey)}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {openGroup.items.length} module{openGroup.items.length > 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedGroup(null)}
                  className="ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-navy hover:bg-secondary transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 pb-5 max-h-[45vh] overflow-y-auto scrollbar-thin">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                  {openGroup.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActiveItem = activeRoute === item.href;
                    const isOpen = windows.some((w) => w.route === item.href);

                    return (
                      <button
                        key={item.href}
                        onClick={() => handleItemClick(item, openGroup.accent)}
                        className={cn(
                          "flex flex-col items-start gap-2 p-3 rounded-2xl border transition-all duration-200 text-left group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          isActiveItem
                            ? "border-transparent ring-2"
                            : "border-border/70 hover:border-transparent hover:-translate-y-0.5"
                        )}
                        style={
                          isActiveItem
                            ? {
                                backgroundColor: `hsl(${openGroup.accent} / 0.12)`,
                                boxShadow: `0 4px 16px hsl(${openGroup.accent} / 0.18)`,
                                // @ts-expect-error -- propriété CSS custom pour le ring Tailwind
                                "--tw-ring-color": `hsl(${openGroup.accent} / 0.55)`,
                              }
                            : { backgroundColor: `hsl(${openGroup.accent} / 0.04)` }
                        }
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 flex-shrink-0"
                            style={{
                              backgroundColor: isActiveItem
                                ? `hsl(${openGroup.accent})`
                                : `hsl(${openGroup.accent} / 0.14)`,
                              color: isActiveItem ? "white" : `hsl(${openGroup.accent})`,
                            }}
                          >
                            <ItemIcon className="w-[18px] h-[18px]" />
                          </div>
                          {isOpen && !isActiveItem && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: `hsl(${openGroup.accent})` }}
                              title="Déjà ouvert"
                            />
                          )}
                        </div>

                        <span
                          className={cn(
                            "text-[12px] leading-snug line-clamp-2",
                            isActiveItem
                              ? "font-semibold text-navy"
                              : "font-medium text-muted-foreground group-hover:text-navy"
                          )}
                        >
                          {t(item.labelKey)}
                        </span>

                        {isActiveItem && (
                          <span
                            className="text-[9px] font-display font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md"
                            style={{
                              color: `hsl(${openGroup.accent})`,
                              backgroundColor: `hsl(${openGroup.accent} / 0.16)`,
                            }}
                          >
                            À l&apos;écran
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* BARRE DU DOCK — catégories (gauche) | onglets ouverts (droite, scroll horizontal) */}
      <div className="relative z-50 flex-shrink-0 bg-gradient-to-t from-background to-card/95 backdrop-blur-[12px] border-t border-border/70 print:hidden">
        <div className="flex items-stretch h-[76px]">
          {/* PARTIE GAUCHE — Catégories (menu généraux) */}
          <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 border-r border-border/40">
            {availableGroups.map((group) => {
              const isExpanded = expandedGroup === group.groupKey;
              const isActiveGroup = activeGroupKey === group.groupKey;
              const GroupIcon = group.icon;

              return (
                <button
                  key={group.groupKey}
                  onClick={() => handleGroupClick(group.groupKey)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-2xl transition-all duration-200 group relative focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isExpanded
                      ? "bg-white/70 shadow-inner"
                      : isActiveGroup
                        ? "bg-white/50 shadow-[0_2px_8px_hsl(0_0%_0%_/_0.04)]"
                        : "hover:bg-white/40"
                  )}
                  title={t(group.labelKey)}
                >
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
                    style={{
                      backgroundColor: isExpanded
                        ? `hsl(${group.accent})`
                        : isActiveGroup
                          ? `hsl(${group.accent} / 0.2)`
                          : `hsl(${group.accent} / 0.1)`,
                      color: isExpanded ? "white" : `hsl(${group.accent})`,
                      boxShadow: isExpanded
                        ? `0 4px 16px hsl(${group.accent} / 0.35)`
                        : isActiveGroup
                          ? `0 4px 12px hsl(${group.accent} / 0.2)`
                          : `inset 0 1px 2px hsl(0 0% 100% / 0.5)`,
                    }}
                  >
                    <GroupIcon className="w-5 h-5" />
                  </div>

                  <span
                    className={cn(
                      "text-[10px] font-display font-semibold tracking-wide max-w-[72px] truncate leading-tight",
                      isExpanded || isActiveGroup
                        ? "text-navy"
                        : "text-muted-foreground group-hover:text-navy"
                    )}
                  >
                    {t(group.labelKey)}
                  </span>

                  {isActiveGroup && !isExpanded && (
                    <span
                      className="absolute -top-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: `hsl(${group.accent})` }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* PARTIE DROITE — Onglets des pages ouvertes (scroll horizontal) */}
          <div className="flex-1 min-w-0 relative">
            {sortedTabs.length > 0 ? (
              <>
                <div
                  ref={tabsScrollRef}
                  className="flex items-center gap-1.5 px-3 h-full overflow-x-auto scrollbar-thin-x"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {sortedTabs.map((win) => {
                    const isActive = win.id === activeWindowId;
                    const TabIcon = win.icon;

                    return (
                      <div
                        key={win.id}
                        data-tab-id={win.id}
                        ref={(el) => registerDockItem(win.id, el)}
                        onClick={() => handleTabClick(win.id)}
                        className={cn(
                          "flex-shrink-0 flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-2xl border transition-all duration-200 cursor-pointer group",
                          isActive
                            ? "border-transparent ring-2"
                            : "border-border/40 hover:border-border/70 hover:bg-secondary/40"
                        )}
                        style={
                          isActive
                            ? {
                                backgroundColor: `${win.iconColor}14`,
                                boxShadow: `0 4px 16px ${win.iconColor}20`,
                                // @ts-expect-error -- propriété CSS custom pour le ring Tailwind
                                "--tw-ring-color": `${win.iconColor}55`,
                              }
                            : undefined
                        }
                        title={win.title}
                      >
                        {/* Icône colorée de la page */}
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                          style={{
                            backgroundColor: isActive ? win.iconColor : `${win.iconColor}1a`,
                            color: isActive ? "white" : win.iconColor,
                          }}
                        >
                          <TabIcon className="w-[14px] h-[14px]" />
                        </div>

                        {/* Nom de la page — police Plus Jakarta Sans (différente des catégories) */}
                        <span
                          className={cn(
                            "text-[12px] whitespace-nowrap max-w-[140px] truncate",
                            isActive
                              ? "font-semibold text-navy"
                              : "font-medium text-muted-foreground group-hover:text-navy"
                          )}
                        >
                          {win.title}
                        </span>

                        {/* Bouton fermer l'onglet */}
                        <button
                          onClick={(e) => handleTabClose(e, win.id)}
                          className={cn(
                            "w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            isActive
                              ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              : "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                          )}
                          title="Fermer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Dégradé d'indication de scroll à droite */}
                <div
                  className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-card/90 to-transparent"
                  aria-hidden
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-full px-4">
                <p className="text-[13px] font-sans text-muted-foreground/70 italic">
                  Cliquez sur une catégorie pour voir ses pages
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
