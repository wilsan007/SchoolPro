import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SEUIL_REGROUPEMENT,
  regrouperAvecSousNiveau,
  type AxeRegroupement,
  type Groupe,
} from "@/lib/regroupement";

/**
 * Pendant serveur de `ListeGroupee` : même règle (regroupement obligatoire
 * au-delà de `SEUIL_REGROUPEMENT`), mais sans état client — les groupes sont
 * des `<details>` natifs. À utiliser dans les Server Components, où `rendu`
 * ne peut pas traverser la frontière client.
 *
 * Le premier axe découpe la liste ; les suivants servent de second niveau
 * quand un groupe dépasse lui-même le seuil.
 */
interface GroupesStatiquesProps<T> {
  items: readonly T[];
  axes: readonly AxeRegroupement<T>[];
  /** Rendu d'un élément. L'élément racine doit porter sa `key`. */
  rendu: (item: T) => ReactNode;
  /** S'applique au conteneur des éléments de chaque groupe. */
  className?: string;
  /** Groupe ouvert d'emblée s'il contient un élément qui satisfait ce test. Défaut : le premier groupe. */
  ouvertSi?: (item: T) => boolean;
  libelleSansValeur?: string;
}

export function GroupesStatiques<T>({
  items,
  axes,
  rendu,
  className,
  ouvertSi,
  libelleSansValeur = "—",
}: GroupesStatiquesProps<T>) {
  if (items.length <= SEUIL_REGROUPEMENT || axes.length === 0) {
    return <div className={className}>{items.map(rendu)}</div>;
  }

  const groupes = regrouperAvecSousNiveau(items, axes[0], axes, libelleSansValeur);
  if (groupes.length < 2 && !groupes[0]?.sousGroupes) {
    return <div className={className}>{items.map(rendu)}</div>;
  }

  const ouvert = (groupe: Groupe<T>, rang: number) =>
    ouvertSi ? groupe.items.some(ouvertSi) : rang === 0;

  const resume = (groupe: Groupe<T>, niveau: 1 | 2) => (
    <summary
      className={cn(
        "flex cursor-pointer items-center gap-2",
        niveau === 1
          ? "rounded-xl bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground"
          : "px-4 py-1 text-xs font-medium text-muted-foreground",
      )}
    >
      <span className="truncate">{groupe.libelle}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums normal-case",
          niveau === 1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {groupe.items.length}
      </span>
    </summary>
  );

  return (
    <div className="space-y-3">
      {groupes.map((g, i) => (
        <details key={g.cle} open={ouvert(g, i)} className="space-y-3">
          {resume(g, 1)}
          {g.sousGroupes ? (
            <div className="mt-3 space-y-2">
              {g.sousGroupes.map((sg, j) => (
                <details key={sg.cle} open={ouvert(sg, ouvertSi ? j : 1)} className="space-y-2">
                  {resume(sg, 2)}
                  <div className={cn("mt-2", className)}>{sg.items.map(rendu)}</div>
                </details>
              ))}
            </div>
          ) : (
            <div className={cn("mt-3", className)}>{g.items.map(rendu)}</div>
          )}
        </details>
      ))}
    </div>
  );
}
