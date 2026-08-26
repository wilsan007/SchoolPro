"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface ClassGroupedSelectProps {
  /** Hiérarchie des classes (depuis getClassesHierarchie). */
  hierarchie: ClassesHierarchie;
  /** ID de classe sélectionnée. */
  value: string | null | undefined;
  /** Callback quand l'utilisateur sélectionne une classe. */
  onValueChange: (classeId: string) => void;
  /** Placeholder. */
  placeholder?: string;
  /** ID HTML du trigger. */
  id?: string;
  /** Classe CSS du trigger. */
  className?: string;
  /** Désactiver le sélecteur. */
  disabled?: boolean;
}

/**
 * Sélecteur de classe dropdown avec groupes hiérarchiques.
 *
 * Affiche les classes groupées par Catégorie → Niveau dans un dropdown
 * shadcn/ui Select standard. Adapté aux formulaires (devoirs, évaluations,
 * notes, etc.) où un arbre repliable prendrait trop de place.
 *
 * Pour les contextes sidebar/filtres, utiliser `ClassTreeSelector` à la place.
 */
export function ClassGroupedSelect({
  hierarchie,
  value,
  onValueChange,
  placeholder,
  id,
  className,
  disabled,
}: ClassGroupedSelectProps) {
  const t = useTranslations("classes");

  if (hierarchie.length === 0) {
    return (
      <Select value="" onValueChange={() => {}} disabled>
        <SelectTrigger id={id} className={className}>
          <SelectValue placeholder={t("aucuneClasse")} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  return (
    <Select value={value ?? ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder ?? t("selectionnerClasse")} />
      </SelectTrigger>
      <SelectContent className="max-h-[320px] overflow-y-auto">
        {hierarchie.map((cat) => (
          <SelectGroup key={cat.categorie}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t(`categorie_${cat.label}`)}
            </SelectLabel>
            {cat.niveaux.map((niv) => (
              <SelectGroup key={`${cat.categorie}-${niv.niveau}`}>
                <SelectLabel className="text-xs font-medium text-muted-foreground/70 pl-4">
                  {niv.niveau}
                </SelectLabel>
                {niv.classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id} className="pl-6">
                    {cls.nom}
                    {cls.effectif > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                        ({cls.effectif})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
