"use client";

import { useState, useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import {
  ChevronRight,
  ChevronDown,
  School,
  GraduationCap,
  BookOpen,
  Layers,
  Users,
  ArrowLeft,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClassesHierarchie, ClasseNode } from "@/lib/classes-hierarchie";
import type { SchoolGroup } from "@/lib/school-groups";

// ── Icônes et couleurs par catégorie ──────────────────────────

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

const CATEGORIE_ACTIVE_BG: Record<SchoolGroup, string> = {
  Primaire: "bg-emerald-100 dark:bg-emerald-900/40",
  Collège: "bg-sky-100 dark:bg-sky-900/40",
  Lycée: "bg-violet-100 dark:bg-violet-900/40",
  Autre: "bg-slate-100 dark:bg-slate-800/40",
};

// ── Types ─────────────────────────────────────────────────────

export interface DrillDownItem {
  /** Identifiant unique de l'élément (ex: ligne de couverture, examen, etc.) */
  id: string;
  /** Nom de la classe associée (peut être vide pour les données sans classe). */
  classeNom?: string | null;
  /** Nom de la matière associée (si applicable). */
  matiereNom?: string | null;
  /** Niveau de la classe (pour le groupement par catégorie). */
  niveau?: string | null;
}

export interface DrillDownNavigatorProps<T extends DrillDownItem> {
  /** Hiérarchie des classes (depuis getClassesHierarchie). */
  hierarchie: ClassesHierarchie;
  /** Tous les éléments à afficher. */
  items: T[];
  /**
   * Fonction de rendu pour un groupe d'éléments filtrés.
   * Appelée avec les éléments correspondant au niveau de drill-down courant.
   */
  renderItems: (items: T[], context: DrillDownContext) => ReactNode;
  /** Active le drill-down par matière (3 niveaux au lieu de 2). */
  groupByMatiere?: boolean;
  /** Libellé affiché quand il n'y a aucun élément. */
  emptyLabel?: string;
  /** Classe CSS additionnelle. */
  className?: string;
}

export interface DrillDownContext {
  /** Catégorie sélectionnée (null = vue d'ensemble). */
  categorie: SchoolGroup | null;
  /** Classe sélectionnée (null = toutes les classes de la catégorie). */
  classe: ClasseNode | null;
  /** Matière sélectionnée (null = toutes les matières de la classe). */
  matiere: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Détermine la catégorie (SchoolGroup) d'un élément à partir de son niveau
 * ou du nom de sa classe, en cherchant dans la hiérarchie.
 */
function categorieForItem<T extends DrillDownItem>(
  item: T,
  hierarchie: ClassesHierarchie,
): SchoolGroup | null {
  // Cherche par classeNom dans la hiérarchie
  if (item.classeNom) {
    for (const cat of hierarchie) {
      for (const niv of cat.niveaux) {
        for (const cls of niv.classes) {
          if (cls.nom === item.classeNom) return cat.categorie;
        }
      }
    }
  }
  // Fallback: utilise le niveau
  if (item.niveau) {
    for (const cat of hierarchie) {
      if (cat.niveaux.some((n) => n.niveau === item.niveau)) return cat.categorie;
    }
  }
  return null;
}

// ── Composant principal ──────────────────────────────────────

export function DrillDownNavigator<T extends DrillDownItem>({
  hierarchie,
  items,
  renderItems,
  groupByMatiere = false,
  emptyLabel,
  className,
}: DrillDownNavigatorProps<T>) {
  const t = useTranslations("drillDown");
  const tClasses = useTranslations("classes");
  const libelleNiveau = useLibelleNiveau();

  // État de navigation: catégorie → classe → matière
  const [selectedCat, setSelectedCat] = useState<SchoolGroup | null>(null);
  const [selectedClasse, setSelectedClasse] = useState<ClasseNode | null>(null);
  const [selectedMatiere, setSelectedMatiere] = useState<string | null>(null);

  // Indexer les éléments par catégorie pour les compteurs
  const itemsByCategorie = useMemo(() => {
    const map = new Map<SchoolGroup, T[]>();
    for (const item of items) {
      const cat = categorieForItem(item, hierarchie);
      if (cat) {
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(item);
      }
    }
    return map;
  }, [items, hierarchie]);

  // Classes disponibles dans la catégorie sélectionnée
  const classesInCategorie = useMemo(() => {
    if (!selectedCat) return [];
    const cat = hierarchie.find((c) => c.categorie === selectedCat);
    if (!cat) return [];
    return cat.niveaux.flatMap((n) => n.classes);
  }, [selectedCat, hierarchie]);

  // Filtrer les éléments selon le niveau de drill-down
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedCat) {
      result = result.filter((item) => categorieForItem(item, hierarchie) === selectedCat);
    }

    if (selectedClasse) {
      result = result.filter((item) => item.classeNom === selectedClasse.nom);
    }

    if (selectedMatiere) {
      result = result.filter((item) => item.matiereNom === selectedMatiere);
    }

    return result;
  }, [items, selectedCat, selectedClasse, selectedMatiere, hierarchie]);

  // Matières disponibles dans la classe sélectionnée
  const matieresInClasse = useMemo(() => {
    if (!selectedClasse) return [];
    const matieres = new Set<string>();
    for (const item of items) {
      if (item.classeNom === selectedClasse.nom && item.matiereNom) {
        matieres.add(item.matiereNom);
      }
    }
    return Array.from(matieres).sort();
  }, [selectedClasse, items]);

  // Compteurs par classe dans la catégorie sélectionnée
  const countByClasse = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedCat) return map;
    const catItems = itemsByCategorie.get(selectedCat) ?? [];
    for (const item of catItems) {
      if (item.classeNom) {
        map.set(item.classeNom, (map.get(item.classeNom) ?? 0) + 1);
      }
    }
    return map;
  }, [selectedCat, itemsByCategorie]);

  // Compteurs par matière dans la classe sélectionnée
  const countByMatiere = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedClasse) return map;
    for (const item of items) {
      if (item.classeNom === selectedClasse.nom && item.matiereNom) {
        map.set(item.matiereNom, (map.get(item.matiereNom) ?? 0) + 1);
      }
    }
    return map;
  }, [selectedClasse, items]);

  // ── Breadcrumb ──
  const breadcrumb = (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
      <button
        onClick={() => {
          setSelectedCat(null);
          setSelectedClasse(null);
          setSelectedMatiere(null);
        }}
        className={cn(
          "hover:text-foreground transition-colors",
          !selectedCat && "text-foreground font-medium",
        )}
      >
        {t("overview")}
      </button>
      {selectedCat && (
        <>
          <ChevronRight className="w-3.5 h-3.5" />
          <button
            onClick={() => {
              setSelectedClasse(null);
              setSelectedMatiere(null);
            }}
            className={cn(
              "hover:text-foreground transition-colors",
              selectedCat && !selectedClasse && "text-foreground font-medium",
            )}
          >
            {tClasses(`categorie_${hierarchie.find((c) => c.categorie === selectedCat)?.label}`)}
          </button>
        </>
      )}
      {selectedClasse && (
        <>
          <ChevronRight className="w-3.5 h-3.5" />
          <button
            onClick={() => setSelectedMatiere(null)}
            className={cn(
              "hover:text-foreground transition-colors",
              selectedClasse && !selectedMatiere && "text-foreground font-medium",
            )}
          >
            {selectedClasse.nom}
          </button>
        </>
      )}
      {selectedMatiere && (
        <>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{selectedMatiere}</span>
        </>
      )}
    </div>
  );

  // ── Vue 0: Vue d'ensemble (catégories) ──
  if (!selectedCat) {
    return (
      <div className={cn("space-y-4", className)}>
        {breadcrumb}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {hierarchie.map((cat) => {
            const Icon = CATEGORIE_ICONS[cat.categorie];
            const count = (itemsByCategorie.get(cat.categorie) ?? []).length;
            const totalClasses = cat.niveaux.reduce((s, n) => s + n.classes.length, 0);
            const totalEffectif = cat.niveaux.reduce(
              (s, n) => s + n.classes.reduce((s2, c) => s2 + c.effectif, 0),
              0,
            );
            return (
              <button
                key={cat.categorie}
                onClick={() => setSelectedCat(cat.categorie)}
                className={cn(
                  "rounded-xl border p-5 text-left transition-all hover:shadow-md hover:scale-[1.02]",
                  CATEGORIE_BORDER[cat.categorie],
                  CATEGORIE_BG[cat.categorie],
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("p-2 rounded-lg bg-white dark:bg-gray-900", CATEGORIE_COLORS[cat.categorie])}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={cn("font-semibold", CATEGORIE_COLORS[cat.categorie])}>
                      {tClasses(`categorie_${cat.label}`)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {totalClasses} {tClasses("classes")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {count} {t("items")}
                  </span>
                  {totalEffectif > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{totalEffectif}</span>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {/* Affichage des éléments sans catégorie */}
        {items.length > 0 && itemsByCategorie.size === 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            {renderItems(items, { categorie: null, classe: null, matiere: null })}
          </div>
        )}
      </div>
    );
  }

  // ── Vue 1: Classes dans la catégorie sélectionnée ──
  if (selectedCat && !selectedClasse) {
    return (
      <div className={cn("space-y-4", className)}>
        {breadcrumb}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedCat(null);
              setSelectedClasse(null);
              setSelectedMatiere(null);
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {classesInCategorie.map((cls) => {
            const count = countByClasse.get(cls.nom) ?? 0;
            return (
              <button
                key={cls.id}
                onClick={() => setSelectedClasse(cls)}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{cls.nom}</p>
                    <p className="text-xs text-muted-foreground">{libelleNiveau(cls.niveau)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cls.effectif > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{cls.effectif}</span>
                      </span>
                    )}
                    {count > 0 && (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", CATEGORIE_ACTIVE_BG[selectedCat], CATEGORIE_COLORS[selectedCat])}>
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Affichage de tous les éléments de la catégorie si pas de classe sélectionnée */}
        {filteredItems.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">{t("allItemsInCategory")}</h3>
            </div>
            {renderItems(filteredItems, { categorie: selectedCat, classe: null, matiere: null })}
          </div>
        )}
      </div>
    );
  }

  // ── Vue 2: Matières dans la classe sélectionnée (optionnel) ──
  if (selectedClasse && groupByMatiere && !selectedMatiere) {
    return (
      <div className={cn("space-y-4", className)}>
        {breadcrumb}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedClasse(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {matieresInClasse.map((matiere) => {
            const count = countByMatiere.get(matiere) ?? 0;
            return (
              <button
                key={matiere}
                onClick={() => setSelectedMatiere(matiere)}
                className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{matiere}</p>
                    <p className="text-xs text-muted-foreground">{selectedClasse.nom}</p>
                  </div>
                  {count > 0 && (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ml-2", CATEGORIE_ACTIVE_BG[selectedCat], CATEGORIE_COLORS[selectedCat])}>
                      {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {filteredItems.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">{t("allItemsInClass")}</h3>
            </div>
            {renderItems(filteredItems, { categorie: selectedCat, classe: selectedClasse, matiere: null })}
          </div>
        )}
      </div>
    );
  }

  // ── Vue 3: Détail (matière sélectionnée ou pas de groupByMatiere) ──
  return (
    <div className={cn("space-y-4", className)}>
      {breadcrumb}
      <div className="flex items-center gap-2">
        <button
          onClick={() => (groupByMatiere ? setSelectedMatiere(null) : setSelectedClasse(null))}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("back")}
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {emptyLabel ?? t("noItems")}
        </div>
      ) : (
        renderItems(filteredItems, { categorie: selectedCat, classe: selectedClasse, matiere: selectedMatiere })
      )}
    </div>
  );
}
