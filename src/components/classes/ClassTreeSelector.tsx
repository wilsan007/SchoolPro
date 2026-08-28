"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { ChevronRight, ChevronDown, Users, School, GraduationCap, BookOpen, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import type { SchoolGroup } from "@/lib/school-groups";

const CATEGORIE_ICONS: Record<SchoolGroup, typeof School> = {
  Primaire: School,
  Collège: BookOpen,
  Lycée: GraduationCap,
  Autre: Layers,
};

const CATEGORIE_COLORS: Record<SchoolGroup, string> = {
  Primaire: "text-emerald-600 dark:text-emerald-400",
  Collège: "text-sky-600 dark:text-sky-400",
  Lycée: "text-violet-600 dark:text-violet-400",
  Autre: "text-slate-500 dark:text-slate-400",
};

const CATEGORIE_BG: Record<SchoolGroup, string> = {
  Primaire: "bg-emerald-50 dark:bg-emerald-950/30",
  Collège: "bg-sky-50 dark:bg-sky-950/30",
  Lycée: "bg-violet-50 dark:bg-violet-950/30",
  Autre: "bg-slate-50 dark:bg-slate-900/30",
};

const CATEGORIE_BORDER: Record<SchoolGroup, string> = {
  Primaire: "border-emerald-200 dark:border-emerald-900",
  Collège: "border-sky-200 dark:border-sky-900",
  Lycée: "border-violet-200 dark:border-violet-900",
  Autre: "border-slate-200 dark:border-slate-800",
};

interface ClassTreeSelectorProps {
  /** Hiérarchie des classes (depuis getClassesHierarchie). */
  hierarchie: ClassesHierarchie;
  /** ID de classe sélectionnée. */
  value: string | null;
  /** Callback quand l'utilisateur sélectionne une classe. */
  onChange: (classeId: string | null) => void;
  /** Placeholder quand aucune classe n'est sélectionnée. */
  placeholder?: string;
  /** Classe CSS additionnelle pour le conteneur. */
  className?: string;
  /** Compact mode (pour les sidebars / espaces réduits). */
  compact?: boolean;
}

/**
 * Arbre repliable Catégorie ▸ Niveau ▸ Classe.
 *
 * Utilisé comme sélecteur de classe dans toutes les pages dashboard.
 * - Chaque catégorie est repliable (icône chevron + libellé localisé).
 * - Chaque niveau est repliable à l'intérieur d'une catégorie.
 * - Les classes sont des éléments cliquables (radio-like).
 * - La sélection ferme automatiquement les branches non pertinentes.
 */
export function ClassTreeSelector({
  hierarchie,
  value,
  onChange,
  placeholder,
  className,
  compact = false,
}: ClassTreeSelectorProps) {
  const t = useTranslations("classes");
  const tCommon = useTranslations("common");
  const libelleNiveau = useLibelleNiveau();

  // Catégories ouvertes par défaut : toutes si peu de classes, sinon la
  // catégorie contenant la classe sélectionnée.
  const initialOpenCats = useMemo(() => {
    const cats = new Set<SchoolGroup>();
    if (hierarchie.length <= 2) {
      hierarchie.forEach((c) => cats.add(c.categorie));
    } else if (value) {
      for (const cat of hierarchie) {
        if (cat.niveaux.some((n) => n.classes.some((c) => c.id === value))) {
          cats.add(cat.categorie);
        }
      }
    }
    return cats;
  }, [hierarchie, value]);

  const [openCats, setOpenCats] = useState<Set<SchoolGroup>>(initialOpenCats);
  const [openNiveaux, setOpenNiveaux] = useState<Set<string>>(new Set());

  const selectedClasse = useMemo(() => {
    if (!value) return null;
    for (const cat of hierarchie) {
      for (const niv of cat.niveaux) {
        const found = niv.classes.find((c) => c.id === value);
        if (found) return found;
      }
    }
    return null;
  }, [hierarchie, value]);

  function toggleCat(cat: SchoolGroup) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleNiveau(key: string) {
    setOpenNiveaux((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (hierarchie.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground py-4 text-center", className)}>
        {t("aucuneClasse")}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* Classe sélectionnée (badge) */}
      {selectedClasse && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-sm">
          <span className="font-medium text-foreground">{selectedClasse.nom}</span>
          <span className="text-xs text-muted-foreground">— {libelleNiveau(selectedClasse.niveau)}</span>
          <button
            onClick={() => onChange(null)}
            className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
            aria-label={tCommon("clear")}
          >
            ✕
          </button>
        </div>
      )}

      {!selectedClasse && placeholder && (
        <div className="mb-2 px-3 py-2 text-sm text-muted-foreground italic">{placeholder}</div>
      )}

      {hierarchie.map((cat) => {
        const Icon = CATEGORIE_ICONS[cat.categorie];
        const isOpen = openCats.has(cat.categorie);
        const totalClasses = cat.niveaux.reduce((sum, n) => sum + n.classes.length, 0);
        const totalEffectif = cat.niveaux.reduce(
          (sum, n) => sum + n.classes.reduce((s, c) => s + c.effectif, 0),
          0,
        );

        return (
          <div key={cat.categorie} className={cn("rounded-xl border overflow-hidden", CATEGORIE_BORDER[cat.categorie])}>
            {/* En-tête catégorie */}
            <button
              onClick={() => toggleCat(cat.categorie)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50",
                CATEGORIE_BG[cat.categorie],
                compact && "py-1.5",
              )}
            >
              {isOpen ? (
                <ChevronDown className={cn("w-4 h-4 shrink-0", CATEGORIE_COLORS[cat.categorie])} />
              ) : (
                <ChevronRight className={cn("w-4 h-4 shrink-0", CATEGORIE_COLORS[cat.categorie])} />
              )}
              <Icon className={cn("w-4 h-4 shrink-0", CATEGORIE_COLORS[cat.categorie])} />
              <span className={cn("font-medium text-sm", CATEGORIE_COLORS[cat.categorie])}>
                {t(`categorie_${cat.label}`)}
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{totalClasses}</span>
                {!compact && totalEffectif > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3" />
                    <span className="tabular-nums">{totalEffectif}</span>
                  </span>
                )}
              </span>
            </button>

            {/* Niveaux */}
            {isOpen && (
              <div className="flex flex-col">
                {cat.niveaux.map((niv) => {
                  const nivKey = `${cat.categorie}::${niv.niveau}`;
                  const nivOpen = openNiveaux.has(nivKey);
                  const nivEffectif = niv.classes.reduce((s, c) => s + c.effectif, 0);

                  return (
                    <div key={nivKey} className="border-t border-border/50">
                      {/* En-tête niveau */}
                      <button
                        onClick={() => toggleNiveau(nivKey)}
                        className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-muted/30 transition-colors"
                      >
                        {nivOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium text-foreground/80">{libelleNiveau(niv.niveau)}</span>
                        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">{niv.classes.length}</span>
                          {nivEffectif > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="w-3 h-3" />
                              <span className="tabular-nums">{nivEffectif}</span>
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Classes */}
                      {nivOpen && (
                        <div className="flex flex-col pb-1">
                          {niv.classes.map((cls) => {
                            const isSelected = cls.id === value;
                            return (
                              <button
                                key={cls.id}
                                onClick={() => onChange(isSelected ? null : cls.id)}
                                className={cn(
                                  "flex items-center gap-2 px-6 py-1.5 text-left text-sm transition-colors",
                                  isSelected
                                    ? "bg-primary/15 text-primary font-medium"
                                    : "text-foreground/70 hover:bg-muted/40",
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                    isSelected ? "bg-primary" : "bg-transparent border border-muted-foreground/30",
                                  )}
                                />
                                <span className="truncate">{cls.nom}</span>
                                {cls.siteNom && !compact && (
                                  <span className="text-xs text-muted-foreground/70 ml-auto shrink-0">
                                    {cls.siteNom}
                                  </span>
                                )}
                                {!compact && cls.effectif > 0 && (
                                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                                    <Users className="w-3 h-3" />
                                    <span className="tabular-nums">{cls.effectif}</span>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
