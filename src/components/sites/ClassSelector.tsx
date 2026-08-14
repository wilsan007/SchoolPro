"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SiteColor } from "@/lib/site-colors";

interface ClassOption {
  id: string;
  nom: string;
  niveau: string;
  siteId: string | null;
  siteNom: string | null;
}

interface ClassSelectorProps {
  classes: ClassOption[];
  siteColors: Record<string, SiteColor>;
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyLabel?: string;
}

const FALLBACK: SiteColor = {
  base: "#6b7280",
  light: "#f3f4f6",
  border: "#e5e7eb",
  text: "#374151",
};

export function ClassSelector({ classes, siteColors, selectedId, onSelect, emptyLabel }: ClassSelectorProps) {
  const bySite = new Map<string, { siteNom: string | null; color: SiteColor; niveaux: Map<string, { id: string; nom: string }[]> }>();

  for (const c of classes) {
    const key = c.siteId ?? "__none__";
    if (!bySite.has(key)) {
      bySite.set(key, {
        siteNom: c.siteNom,
        color: c.siteId ? (siteColors[c.siteId] ?? FALLBACK) : FALLBACK,
        niveaux: new Map(),
      });
    }
    const site = bySite.get(key)!;
    if (!site.niveaux.has(c.niveau)) site.niveaux.set(c.niveau, []);
    site.niveaux.get(c.niveau)!.push({ id: c.id, nom: c.nom });
  }

  const siteEntries = Array.from(bySite.entries()).sort((a, b) =>
    (a[1].siteNom ?? "").localeCompare(b[1].siteNom ?? "")
  );

  const [openSites, setOpenSites] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selectedId) {
      const selected = classes.find((c) => c.id === selectedId);
      initial.add(selected?.siteId ?? "__none__");
    }
    return initial;
  });

  useEffect(() => {
    if (!selectedId) return;
    const selected = classes.find((c) => c.id === selectedId);
    if (selected) {
      setOpenSites((prev) => new Set(prev).add(selected.siteId ?? "__none__"));
    }
  }, [selectedId, classes]);

  function toggleSite(siteId: string) {
    setOpenSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }

  if (classes.length === 0) {
    return <div className="text-sm text-muted-foreground">{emptyLabel ?? "—"}</div>;
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {siteEntries.map(([siteId, site]) => {
        const isOpen = openSites.has(siteId);
        const niveauEntries = Array.from(site.niveaux.entries()).sort(([a], [b]) => a.localeCompare(b));
        return (
          <details
            key={siteId}
            open={isOpen}
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: site.color.border }}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                toggleSite(siteId);
              }}
              className="list-none px-3 py-2 flex items-center justify-between cursor-pointer text-xs font-semibold"
              style={{ backgroundColor: site.color.light, color: site.color.text }}
            >
              <span>{site.siteNom ?? "Sans site"}</span>
              <span className="text-[10px] opacity-70">{isOpen ? "−" : "+"}</span>
            </summary>
            <div className="p-2.5 space-y-1.5" style={{ backgroundColor: site.color.light }}>
              {niveauEntries.map(([niveau, cs]) => (
                <div key={niveau} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground min-w-[40px] flex-shrink-0">
                    {niveau}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {cs.map((c) => {
                      const isSelected = c.id === selectedId;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelect(c.id)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-medium rounded border transition-colors",
                            isSelected ? "text-white" : "hover:bg-white/60"
                          )}
                          style={
                            isSelected
                              ? { backgroundColor: site.color.base, borderColor: site.color.base }
                              : { borderColor: site.color.border, color: site.color.text }
                          }
                        >
                          {c.nom}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
