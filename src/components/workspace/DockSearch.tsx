"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useWindowManager } from "./WindowManager";
import { canAccessRoute, type PermissionOverrides } from "@/lib/permissions";
import { accueilPourRole } from "@/lib/accueil-par-role";
import { Command, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav-items";

interface SearchItem {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  groupKey: string;
  groupLabelKey: string;
  groupAccent: string;
}

const allSearchItems = NAV_GROUPS.map((g) => ({
  groupKey: g.groupKey,
  groupLabelKey: g.groupKey,
  groupAccent: g.accent,
  items: g.items,
}));

interface DockSearchProps {
  roleKey: string;
  open: boolean;
  onClose: () => void;
  /** Dérogations utilisateur : la recherche ne propose que le réellement autorisé. */
  permissionOverrides?: PermissionOverrides;
}

export function DockSearch({ roleKey, open, onClose, permissionOverrides }: DockSearchProps) {
  const t = useTranslations("nav");
  const { openWindow } = useWindowManager();
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
        if (!canAccessRoute(roleKey, item.href, permissionOverrides)) continue;
        items.push({
          ...item,
          groupKey: group.groupKey,
          groupLabelKey: group.groupLabelKey,
          groupAccent: group.groupAccent,
        });
      }
    }
    return items;
  }, [roleKey, permissionOverrides]);

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

  // Focus l'input et reset quand on ouvre
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Écouter Escape quand ouvert
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

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
          onClose();
        }
      }
    },
    [filteredItems, selectedIndex, openWindow, t, onClose]
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
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[100] bg-navy/20 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
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
              aria-label={t("searchModules")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={t("searchModules")}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
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
