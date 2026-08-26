"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useWindowManager } from "./WindowManager";
import { canAccessRoute } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";
import {
  LayoutDashboard, Users, ClipboardList, BookOpen, Target, Sparkles,
  Gauge, HandHeart, Calendar, GraduationCap, MessageSquare, Receipt,
  Settings, UserCheck, BarChart3, Shield, ShieldCheck, UserPlus,
  Briefcase, Bell, FileText, Compass, Archive, Package, Crown, PlayCircle,
  ListTodo, NotebookPen, Sun, Wrench, ClipboardCheck, BookOpenCheck,
  Grid3x3, GitCompare, Wallet, Gavel, HeartHandshake, CheckSquare, Activity,
  Brain, School, Search, Command,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SearchItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  groupKey: string;
  groupLabelKey: string;
  groupAccent: string;
}

const allSearchItems: { groupKey: string; groupLabelKey: string; groupAccent: string; items: Omit<SearchItem, "groupKey" | "groupLabelKey" | "groupAccent">[] }[] = [
  {
    groupKey: "accueil", groupLabelKey: "accueil", groupAccent: "200 70% 46%",
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
    groupKey: "groupPedagogie", groupLabelKey: "groupPedagogie", groupAccent: "186 55% 42%",
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
    groupKey: "groupVieScolaire", groupLabelKey: "groupVieScolaire", groupAccent: "220 60% 50%",
    items: [
      { labelKey: "absences", icon: ClipboardList, href: "/absences" },
      { labelKey: "veilleAssiduite", icon: Activity, href: "/veille-assiduite" },
      { labelKey: "vieScolaire", icon: Shield, href: "/vie-scolaire" },
      { labelKey: "parents", icon: UserCheck, href: "/parents" },
    ],
  },
  {
    groupKey: "groupGestion", groupLabelKey: "groupGestion", groupAccent: "188 55% 45%",
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
    groupKey: "groupCommunication", groupLabelKey: "groupCommunication", groupAccent: "260 55% 58%",
    items: [
      { labelKey: "messages", icon: MessageSquare, href: "/messages" },
      { labelKey: "communication", icon: Bell, href: "/communication" },
    ],
  },
  {
    groupKey: "groupRapports", groupLabelKey: "groupRapports", groupAccent: "245 50% 55%",
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
    groupKey: "systeme", groupLabelKey: "systeme", groupAccent: "210 18% 45%",
    items: [
      { labelKey: "taches", icon: CheckSquare, href: "/taches" },
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin" },
      { labelKey: "parametres", icon: Settings, href: "/parametres" },
    ],
  },
];

interface DockSearchProps {
  roleKey: string;
}

export function DockSearch({ roleKey }: DockSearchProps) {
  const t = useTranslations("nav");
  const { openWindow } = useWindowManager();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Construire la liste des items accessibles
  const accessibleItems = useMemo(() => {
    const items: SearchItem[] = [];
    for (const group of allSearchItems) {
      for (const item of group.items) {
        if (item.href === "/dashboard" && accueilPourRole(roleKey)) continue;
        if (!canAccessRoute(roleKey, item.href)) continue;
        items.push({
          ...item,
          groupKey: group.groupKey,
          groupLabelKey: group.groupLabelKey,
          groupAccent: group.groupAccent,
        });
      }
    }
    return items;
  }, [roleKey]);

  // Filtrer par recherche
  const filteredItems = useMemo(() => {
    if (!query.trim()) return accessibleItems;
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return accessibleItems.filter((item) => {
      const label = t(item.labelKey).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const group = t(item.groupLabelKey).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return label.includes(q) || group.includes(q);
    });
  }, [accessibleItems, query, t]);

  // Raccourci clavier global Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus l'input quand on ouvre
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Navigation au clavier dans la liste
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item) {
          openWindow(item.href, t(item.labelKey), item.icon, `hsl(${item.groupAccent})`);
          setIsOpen(false);
        }
      }
    },
    [filteredItems, selectedIndex, openWindow, t]
  );

  // Scroll vers l'item sélectionné
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  function handleItemClick(item: SearchItem) {
    openWindow(item.href, t(item.labelKey), item.icon, `hsl(${item.groupAccent})`);
    setIsOpen(false);
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[100] bg-navy/20 backdrop-blur-sm animate-fade-in"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette de commandes */}
      <div className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-lg px-4 animate-fade-up">
        <div
          className="w-full rounded-2xl border border-border/70 bg-card/95 backdrop-blur-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Barre de recherche */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={t("searchModules")}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              aria-label="Rechercher un module"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-mono text-muted-foreground border border-border">
              <Command className="w-3 h-3" />
              <span>K</span>
            </kbd>
          </div>

          {/* Liste des résultats */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin py-2">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Aucun module trouvé</p>
              </div>
            ) : (
              <div className="space-y-0.5 px-2">
                {filteredItems.map((item, index) => {
                  const ItemIcon = item.icon;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={item.href}
                      data-index={index}
                      onClick={() => handleItemClick(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-secondary/60"
                      )}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isSelected
                            ? `hsl(${item.groupAccent})`
                            : `hsl(${item.groupAccent} / 0.12)`,
                          color: isSelected ? "white" : `hsl(${item.groupAccent})`,
                        }}
                      >
                        <ItemIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", isSelected && "text-primary")}>
                          {t(item.labelKey)}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {t(item.groupLabelKey)}
                        </p>
                      </div>
                      {isSelected && (
                        <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono text-muted-foreground border border-border">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-secondary/30">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded bg-card border border-border text-[10px]">↑</kbd>
                <kbd className="px-1 rounded bg-card border border-border text-[10px]">↓</kbd>
                <span>naviguer</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 rounded bg-card border border-border text-[10px]">↵</kbd>
                <span>ouvrir</span>
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {filteredItems.length} module{filteredItems.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
