"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { localeICU } from "@/lib/format-date";
import {
  SEUIL_REGROUPEMENT,
  axesTemporels,
  axesUtilisables,
  choisirAxe,
  regrouperAvecSousNiveau,
  type AxeRegroupement,
  type Groupe,
} from "@/lib/regroupement";

/**
 * Affichage regroupé obligatoire au-delà de `SEUIL_REGROUPEMENT` éléments.
 *
 * En dessous du seuil (ou si aucun axe ne découpe la liste), le rendu est
 * strictement celui d'un `items.map(rendu)`. Au-dessus, la liste est découpée
 * selon l'axe le plus adapté ; l'utilisateur peut en choisir un autre parmi
 * ceux qui ont un sens pour les données affichées.
 */

/** Les quatre axes de date, libellés dans la langue de l'utilisateur. */
export function useAxesTemporels<T>(
  date: (item: T) => Date | string | number | null | undefined,
): AxeRegroupement<T>[] {
  const t = useTranslations("regroupement");
  const locale = useLocale();
  // `date` est une fonction déclarée en ligne par l'appelant : la mettre en
  // dépendance recréerait les axes (et les formateurs Intl) à chaque rendu.
  return useMemo(
    () =>
      axesTemporels(date, localeICU(locale), {
        semestre: (numero, annee) => t("semestreLibelle", { numero, annee }),
        semaine: (lundi) => t("semaineLibelle", { date: lundi }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, t],
  );
}

interface ListeGroupeeProps<T> {
  items: readonly T[];
  /** Axes proposés, du plus naturel au moins naturel pour cet écran. */
  axes: readonly AxeRegroupement<T>[];
  /** Rendu d'un élément. L'élément racine doit porter sa `key`. */
  rendu: (item: T) => ReactNode;
  /**
   * `table` : à placer dans un `<tbody>` (rend des `<tr>`).
   * `liste` : rend des blocs ; `className` s'applique au conteneur des éléments
   * de chaque groupe (grille, pile…).
   */
  variante?: "table" | "liste";
  className?: string;
  /**
   * Groupes repliés à l'ouverture. À réserver aux listes de plusieurs centaines
   * d'éléments, où tout déplier d'emblée noie les en-têtes et alourdit le rendu.
   */
  replieAuDepart?: boolean;
}

export function ListeGroupee<T>({
  items,
  axes,
  rendu,
  variante = "liste",
  className,
  replieAuDepart = false,
}: ListeGroupeeProps<T>) {
  const t = useTranslations("regroupement");
  const [axeChoisi, setAxeChoisi] = useState<string | null>(null);
  // `null` = l'utilisateur n'a encore rien replié ni déplié : état de départ.
  const [repliesChoisis, setReplies] = useState<ReadonlySet<string> | null>(null);

  const depasse = items.length > SEUIL_REGROUPEMENT;
  const utilisables = useMemo(
    () => (depasse ? axesUtilisables(items, axes) : []),
    [depasse, items, axes],
  );
  const axe = useMemo(() => {
    if (!depasse) return null;
    return utilisables.find((a) => a.id === axeChoisi) ?? choisirAxe(items, axes);
  }, [depasse, utilisables, axeChoisi, items, axes]);
  const groupes = useMemo<Groupe<T>[]>(
    () => (axe ? regrouperAvecSousNiveau(items, axe, utilisables, t("nonRenseigne")) : []),
    [axe, items, utilisables, t],
  );

  const replies = useMemo<ReadonlySet<string>>(
    () => repliesChoisis ?? new Set(replieAuDepart ? groupes.map((g) => g.cle) : []),
    [repliesChoisis, replieAuDepart, groupes],
  );

  if (!axe) {
    if (variante === "table") return <>{items.map(rendu)}</>;
    return <div className={className}>{items.map(rendu)}</div>;
  }

  // Tout identifiant d'axe doit avoir son libellé sous `regroupement.axes`.
  const libelleAxe = (id: string) => t(`axes.${id}`);
  const basculer = (cle: string) =>
    setReplies(() => {
      const suivant = new Set(replies);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });
  const toutReplie = groupes.every((g) => replies.has(g.cle));

  const barre = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        {t("grouperPar")}
      </span>
      {utilisables.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-pressed={a.id === axe.id}
          onClick={() => {
            setAxeChoisi(a.id);
            setReplies(null);
          }}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
            a.id === axe.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {libelleAxe(a.id)}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setReplies(toutReplie ? new Set() : new Set(groupes.map((g) => g.cle)))}
        className="ml-auto text-xs font-medium text-primary hover:underline"
      >
        {toutReplie ? t("toutDeplier") : t("toutReplier")}
      </button>
    </div>
  );

  const enTete = (groupe: Groupe<T>, cle: string, niveau: 1 | 2) => {
    const replie = replies.has(cle);
    const Chevron = replie ? ChevronRight : ChevronDown;
    return (
      <button
        type="button"
        aria-expanded={!replie}
        onClick={() => basculer(cle)}
        className={cn(
          "flex w-full items-center gap-2 text-left",
          niveau === 1
            ? "text-xs font-semibold uppercase tracking-wide text-foreground"
            : "pl-6 text-xs font-medium text-muted-foreground",
        )}
      >
        <Chevron className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{groupe.libelle}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums normal-case",
            niveau === 1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {groupe.items.length}
        </span>
      </button>
    );
  };

  if (variante === "table") {
    // colSpan volontairement large : le navigateur le borne au nombre réel de
    // colonnes, ce qui évite à chaque tableau de déclarer le sien.
    return (
      <>
        <tr className="border-b">
          <td colSpan={100} className="px-4 py-2.5">
            {barre}
          </td>
        </tr>
        {groupes.map((g) => (
          <Fragment key={g.cle}>
            <tr className="border-b bg-muted/60">
              <td colSpan={100} className="px-4 py-2">
                {enTete(g, g.cle, 1)}
              </td>
            </tr>
            {!replies.has(g.cle) &&
              (g.sousGroupes
                ? g.sousGroupes.map((sg) => {
                    const cle = `${g.cle}›${sg.cle}`;
                    return (
                      <Fragment key={cle}>
                        <tr className="border-b bg-muted/25">
                          <td colSpan={100} className="px-4 py-1.5">
                            {enTete(sg, cle, 2)}
                          </td>
                        </tr>
                        {!replies.has(cle) && sg.items.map(rendu)}
                      </Fragment>
                    );
                  })
                : g.items.map(rendu))}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {barre}
      {groupes.map((g) => (
        <section key={g.cle} className="space-y-3">
          <div className="rounded-xl bg-muted/60 px-4 py-2">{enTete(g, g.cle, 1)}</div>
          {!replies.has(g.cle) &&
            (g.sousGroupes ? (
              g.sousGroupes.map((sg) => {
                const cle = `${g.cle}›${sg.cle}`;
                return (
                  <div key={cle} className="space-y-3">
                    <div className="px-4">{enTete(sg, cle, 2)}</div>
                    {!replies.has(cle) && <div className={className}>{sg.items.map(rendu)}</div>}
                  </div>
                );
              })
            ) : (
              <div className={className}>{g.items.map(rendu)}</div>
            ))}
        </section>
      ))}
    </div>
  );
}
