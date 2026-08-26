"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Layers, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import type { SchoolGroup } from "@/lib/school-groups";

interface CascadeClassFilterProps {
  /** Hiérarchie des classes (depuis getClassesHierarchie). */
  hierarchie: ClassesHierarchie;
  /** Catégorie sélectionnée (URL ou état parent). */
  initialCategorie?: string | null;
  /** Niveau sélectionné (URL ou état parent). */
  initialNiveau?: string | null;
  /** Classe sélectionnée (URL ou état parent). */
  initialClasseId?: string | null;
  /** Callback quand un filtre change. */
  onChange: (filters: { categorie?: string | null; niveau?: string | null; classeId?: string | null }) => void;
  /** Classe CSS additionnelle. */
  className?: string;
}

/**
 * Filtres cascade : Catégorie → Niveau → Classe.
 *
 * 3 sélecteurs liés : le choix d'une catégorie filtre les niveaux
 * disponibles, le choix d'un niveau filtre les classes disponibles.
 *
 * Utilisé dans les listes d'élèves et tableaux de bord où l'utilisateur
 * navigue par hiérarchie plutôt que par arbre repliable.
 */
export function CascadeClassFilter({
  hierarchie,
  initialCategorie = null,
  initialNiveau = null,
  initialClasseId = null,
  onChange,
  className,
}: CascadeClassFilterProps) {
  const t = useTranslations("classes");
  const tCommon = useTranslations("common");

  const [categorie, setCategorie] = useState<string | null>(initialCategorie);
  const [niveau, setNiveau] = useState<string | null>(initialNiveau);
  const [classeId, setClasseId] = useState<string | null>(initialClasseId);

  // Sync avec les props quand l'URL change (navigation back/forward).
  useEffect(() => {
    setCategorie(initialCategorie ?? null);
  }, [initialCategorie]);
  useEffect(() => {
    setNiveau(initialNiveau ?? null);
  }, [initialNiveau]);
  useEffect(() => {
    setClasseId(initialClasseId ?? null);
  }, [initialClasseId]);

  // Niveaux disponibles selon la catégorie sélectionnée.
  const niveauxDisponibles = useMemo(() => {
    if (!categorie) {
      // Tous les niveaux de toutes les catégories (dédupliqués).
      const all = new Set<string>();
      hierarchie.forEach((cat) => cat.niveaux.forEach((n) => all.add(n.niveau)));
      return Array.from(all).sort((a, b) => a.localeCompare(b));
    }
    const cat = hierarchie.find((c) => c.categorie === categorie);
    return cat ? cat.niveaux.map((n) => n.niveau).sort((a, b) => a.localeCompare(b)) : [];
  }, [hierarchie, categorie]);

  // Classes disponibles selon catégorie + niveau.
  const classesDisponibles = useMemo(() => {
    let result = hierarchie;
    if (categorie) {
      result = result.filter((c) => c.categorie === categorie);
    }
    let classes: { id: string; nom: string; niveau: string; siteNom: string | null }[] = [];
    for (const cat of result) {
      for (const niv of cat.niveaux) {
        if (!niveau || niv.niveau === niveau) {
          for (const cls of niv.classes) {
            classes.push({ id: cls.id, nom: cls.nom, niveau: cls.niveau, siteNom: cls.siteNom });
          }
        }
      }
    }
    return classes.sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hierarchie, categorie, niveau]);

  function handleCategorieChange(value: string) {
    const newCat = value || null;
    setCategorie(newCat);
    // Reset cascade en dessous.
    setNiveau(null);
    setClasseId(null);
    onChange({ categorie: newCat, niveau: null, classeId: null });
  }

  function handleNiveauChange(value: string) {
    const newNiv = value || null;
    setNiveau(newNiv);
    setClasseId(null);
    onChange({ categorie, niveau: newNiv, classeId: null });
  }

  function handleClasseChange(value: string) {
    const newId = value || null;
    setClasseId(newId);
    onChange({ categorie, niveau, classeId: newId });
  }

  function resetAll() {
    setCategorie(null);
    setNiveau(null);
    setClasseId(null);
    onChange({ categorie: null, niveau: null, classeId: null });
  }

  const hasActiveFilter = categorie || niveau || classeId;

  const selectClass = cn(
    "h-9 rounded-xl border border-input bg-background px-3 text-sm",
    "focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow",
    "appearance-none cursor-pointer",
  );

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {/* Catégorie */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Layers className="w-3 h-3" />
          {t("categorie")}
        </label>
        <div className="relative">
          <select
            value={categorie ?? ""}
            onChange={(e) => handleCategorieChange(e.target.value)}
            className={cn(selectClass, "pr-8 w-full")}
          >
            <option value="">{tCommon("all")}</option>
            {hierarchie.map((cat) => (
              <option key={cat.categorie} value={cat.categorie}>
                {t(`categorie_${cat.label}`)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Niveau */}
      <div className="flex flex-col gap-1 min-w-[140px]">
        <label className="text-xs font-medium text-muted-foreground">
          {t("niveau")}
        </label>
        <div className="relative">
          <select
            value={niveau ?? ""}
            onChange={(e) => handleNiveauChange(e.target.value)}
            className={cn(selectClass, "pr-8 w-full", !categorie && "opacity-60")}
            disabled={!categorie && niveauxDisponibles.length === 0}
          >
            <option value="">{tCommon("all")}</option>
            {niveauxDisponibles.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Classe */}
      <div className="flex flex-col gap-1 min-w-[180px]">
        <label className="text-xs font-medium text-muted-foreground">
          {t("classe")}
        </label>
        <div className="relative">
          <select
            value={classeId ?? ""}
            onChange={(e) => handleClasseChange(e.target.value)}
            className={cn(selectClass, "pr-8 w-full", !niveau && "opacity-60")}
            disabled={!niveau && classesDisponibles.length === 0}
          >
            <option value="">{tCommon("all")}</option>
            {classesDisponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
                {c.siteNom ? ` — ${c.siteNom}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Reset */}
      {hasActiveFilter && (
        <button
          onClick={resetAll}
          className="h-9 px-3 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          {tCommon("clear")}
        </button>
      )}
    </div>
  );
}
