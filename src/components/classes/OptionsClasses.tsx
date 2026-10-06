"use client";

import { useMemo, type ReactNode } from "react";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { SEUIL_REGROUPEMENT, type AxeRegroupement } from "@/lib/regroupement";

/**
 * Options de sélecteur regroupées au-delà de `SEUIL_REGROUPEMENT`. En dessous
 * (ou si le regroupement ne produit qu'un seul groupe), le rendu est une
 * simple liste à plat.
 *
 * - `Options…` : à placer dans un `<select>` natif (`<optgroup>`).
 * - `Items…` : à placer dans un `<SelectContent>` shadcn (`SelectGroup`).
 *
 * L'ordre des groupes et des éléments est celui reçu : les appelants les
 * fournissent déjà triés.
 */

interface PropsGroupees<T> {
  items: readonly T[];
  /** Catégorie d'un élément (libellé affiché en en-tête de groupe). */
  groupe: (item: T) => string | null | undefined;
  valeur: (item: T) => string;
  libelle: (item: T) => ReactNode;
}

function useGroupes<T>(items: readonly T[], groupe: PropsGroupees<T>["groupe"]) {
  // `groupe` est une fonction déclarée en ligne par l'appelant : la mettre en
  // dépendance recalculerait les groupes à chaque rendu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => grouper(items, groupe), [items]);
}

function grouper<T>(items: readonly T[], groupe: PropsGroupees<T>["groupe"]) {
  if (items.length <= SEUIL_REGROUPEMENT) return null;
  const parGroupe = new Map<string, T[]>();
  for (const item of items) {
    const cle = groupe(item)?.trim() || "—";
    const liste = parGroupe.get(cle);
    if (liste) liste.push(item);
    else parGroupe.set(cle, [item]);
  }
  // Un seul groupe : l'en-tête n'apporterait rien.
  if (parGroupe.size < 2) return null;
  return Array.from(parGroupe.entries()).map(([libelle, liste]) => ({ libelle, items: liste }));
}

export function OptionsGroupees<T>({ items, groupe, valeur, libelle }: PropsGroupees<T>) {
  const groupes = useGroupes(items, groupe);
  const option = (item: T) => (
    <option key={valeur(item)} value={valeur(item)}>
      {libelle(item)}
    </option>
  );
  if (!groupes) return <>{items.map(option)}</>;
  return (
    <>
      {groupes.map((g) => (
        <optgroup key={g.libelle} label={g.libelle}>
          {g.items.map(option)}
        </optgroup>
      ))}
    </>
  );
}

export function ItemsGroupes<T>({ items, groupe, valeur, libelle }: PropsGroupees<T>) {
  const groupes = useGroupes(items, groupe);
  const item = (element: T) => (
    <SelectItem key={valeur(element)} value={valeur(element)}>
      {libelle(element)}
    </SelectItem>
  );
  if (!groupes) return <>{items.map(item)}</>;
  return (
    <>
      {groupes.map((g) => (
        <SelectGroup key={g.libelle}>
          <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.libelle}
          </SelectLabel>
          {g.items.map(item)}
        </SelectGroup>
      ))}
    </>
  );
}

// ─── Classes ────────────────────────────────────────────────────────────────

interface ClasseOption {
  id: string;
  nom: string;
  niveau?: string | null;
}

interface PropsClasses<C extends ClasseOption> {
  classes: readonly C[];
  /** Valeur de l'option. Défaut : l'identifiant de la classe. */
  valeur?: (classe: C) => string;
  /** Libellé de l'option. Défaut : le nom de la classe. */
  libelle?: (classe: C) => ReactNode;
}

/**
 * Niveau d'une classe. Certains écrans ne chargent que `{ id, nom }` : on
 * retombe alors sur le nom privé de sa section (« 6ème A » → « 6ème »,
 * « Terminale ES » → « Terminale »).
 */
function useNiveauDeClasse() {
  const libelleNiveau = useLibelleNiveau();
  return (classe: ClasseOption) => {
    if (classe.niveau?.trim()) return libelleNiveau(classe.niveau);
    const mots = classe.nom.trim().split(/\s+/);
    return mots.length > 1 ? mots.slice(0, -1).join(" ") : classe.nom;
  };
}

/** Classes rangées par niveau, pour un `<select>` natif. */
export function OptionsClasses<C extends ClasseOption>({ classes, valeur, libelle }: PropsClasses<C>) {
  const niveau = useNiveauDeClasse();
  return (
    <OptionsGroupees
      items={classes}
      groupe={niveau}
      valeur={valeur ?? ((c) => c.id)}
      libelle={libelle ?? ((c) => c.nom)}
    />
  );
}

/** Classes rangées par niveau, pour un `<SelectContent>` shadcn. */
export function ItemsClasses<C extends ClasseOption>({ classes, valeur, libelle }: PropsClasses<C>) {
  const niveau = useNiveauDeClasse();
  return (
    <ItemsGroupes
      items={classes}
      groupe={niveau}
      valeur={valeur ?? ((c) => c.id)}
      libelle={libelle ?? ((c) => c.nom)}
    />
  );
}

/** Axe « niveau » d'une liste de classes, pour `ListeGroupee`. */
export function useAxesClasses<C extends { niveau: string }>(): AxeRegroupement<C>[] {
  const libelleNiveau = useLibelleNiveau();
  return useMemo(() => [{ id: "niveau", cle: (c: C) => libelleNiveau(c.niveau) }], [libelleNiveau]);
}

/** Initiale d'un nom, pour ranger une longue liste de personnes. */
export function initiale(nom: string | null | undefined): string {
  const premiere = (nom ?? "").trim().charAt(0);
  const sansAccent = premiere.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return /[A-Z]/.test(sansAccent) ? sansAccent : "#";
}
