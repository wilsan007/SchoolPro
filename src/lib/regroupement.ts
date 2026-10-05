/**
 * Regroupement des affichages longs.
 *
 * Règle produit : dès qu'un affichage dépasse `SEUIL_REGROUPEMENT` éléments,
 * il est obligatoirement découpé par catégorie. Chaque écran déclare les axes
 * qui ont un sens pour ses données (site, structure, classe, matière, mois…) ;
 * `choisirAxe` retient celui qui découpe le mieux la liste réellement affichée.
 *
 * Module pur (aucune dépendance React / Prisma) pour rester testable.
 */

export const SEUIL_REGROUPEMENT = 20;

/** Clé interne des éléments dont l'axe ne renvoie aucune valeur. */
export const CLE_SANS_VALEUR = "__sans_valeur__";

export interface AxeRegroupement<T> {
  /** Identifiant stable ; sert aussi de clé de traduction (`regroupement.axes.<id>`). */
  id: string;
  /** Valeur de catégorie d'un élément. Vide / null = « non renseigné ». */
  cle: (item: T) => string | null | undefined;
  /** Libellé affiché pour une clé. Défaut : la clé elle-même. */
  libelle?: (cle: string) => string;
  /** Ordre des groupes. Défaut : alphabétique, sensible aux nombres. */
  tri?: (a: string, b: string) => number;
}

export interface Groupe<T> {
  cle: string;
  libelle: string;
  items: T[];
  /** Second niveau, présent seulement si le groupe dépasse lui-même le seuil. */
  sousGroupes?: Groupe<T>[];
  /** Axe utilisé pour le second niveau. */
  sousAxeId?: string;
}

const triParDefaut = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function cleDe<T>(axe: AxeRegroupement<T>, item: T): string {
  const brute = axe.cle(item);
  const propre = typeof brute === "string" ? brute.trim() : "";
  return propre === "" ? CLE_SANS_VALEUR : propre;
}

/** Découpe `items` selon un axe. Les « non renseigné » sont toujours placés en dernier. */
export function regrouper<T>(
  items: readonly T[],
  axe: AxeRegroupement<T>,
  libelleSansValeur = "—",
): Groupe<T>[] {
  const parCle = new Map<string, T[]>();
  for (const item of items) {
    const cle = cleDe(axe, item);
    const liste = parCle.get(cle);
    if (liste) liste.push(item);
    else parCle.set(cle, [item]);
  }
  const tri = axe.tri ?? triParDefaut;
  return Array.from(parCle.entries())
    .sort(([a], [b]) => {
      if (a === CLE_SANS_VALEUR) return 1;
      if (b === CLE_SANS_VALEUR) return -1;
      return tri(a, b);
    })
    .map(([cle, groupe]) => ({
      cle,
      libelle: cle === CLE_SANS_VALEUR ? libelleSansValeur : (axe.libelle?.(cle) ?? cle),
      items: groupe,
    }));
}

/**
 * Qualité d'un axe pour une liste donnée (plus haut = meilleur), ou `null` si
 * l'axe ne découpe rien d'utile.
 *
 * Un bon découpage a peu de groupes géants (sinon on retombe sur une liste
 * plate) et pas une poussière de groupes d'un seul élément (sinon les en-têtes
 * noient le contenu). La cible est de l'ordre de √n groupes.
 */
export function scoreAxe<T>(items: readonly T[], axe: AxeRegroupement<T>): number | null {
  const n = items.length;
  if (n === 0) return null;
  const tailles = new Map<string, number>();
  for (const item of items) {
    const cle = cleDe(axe, item);
    tailles.set(cle, (tailles.get(cle) ?? 0) + 1);
  }
  const nbGroupes = tailles.size;
  if (nbGroupes < 2) return null; // tout dans la même catégorie : aucun gain
  if (nbGroupes > n / 2) return null; // moins de 2 éléments par groupe en moyenne

  const partDuPlusGros = Math.max(...tailles.values()) / n;
  const ecartCible = Math.abs(Math.log(nbGroupes / Math.sqrt(n)));
  return -(2 * partDuPlusGros + ecartCible);
}

/**
 * Axe le plus adapté parmi ceux proposés, ou `null` si aucun ne découpe la
 * liste. À score égal, l'ordre de déclaration fait foi (le premier axe est
 * celui que l'écran juge le plus naturel).
 */
export function choisirAxe<T>(
  items: readonly T[],
  axes: readonly AxeRegroupement<T>[],
): AxeRegroupement<T> | null {
  let meilleur: AxeRegroupement<T> | null = null;
  let meilleurScore = -Infinity;
  axes.forEach((axe, rang) => {
    const score = scoreAxe(items, axe);
    if (score === null) return;
    const scoreDepartage = score - rang * 0.01;
    if (scoreDepartage > meilleurScore) {
      meilleur = axe;
      meilleurScore = scoreDepartage;
    }
  });
  return meilleur;
}

/** Axes qui découpent réellement la liste (ceux qu'on peut proposer à l'utilisateur). */
export function axesUtilisables<T>(
  items: readonly T[],
  axes: readonly AxeRegroupement<T>[],
): AxeRegroupement<T>[] {
  return axes.filter((axe) => scoreAxe(items, axe) !== null);
}

/**
 * Découpe selon `axe`, puis re-découpe chaque groupe encore au-dessus du seuil
 * avec le meilleur des axes restants (ex. site → classe, classe → matière).
 */
export function regrouperAvecSousNiveau<T>(
  items: readonly T[],
  axe: AxeRegroupement<T>,
  axes: readonly AxeRegroupement<T>[],
  libelleSansValeur = "—",
): Groupe<T>[] {
  const autres = axes.filter((a) => a.id !== axe.id);
  return regrouper(items, axe, libelleSansValeur).map((groupe) => {
    if (groupe.items.length <= SEUIL_REGROUPEMENT) return groupe;
    const sousAxe = choisirAxe(groupe.items, autres);
    if (!sousAxe) return groupe;
    return {
      ...groupe,
      sousGroupes: regrouper(groupe.items, sousAxe, libelleSansValeur),
      sousAxeId: sousAxe.id,
    };
  });
}

// ─── Axes temporels ─────────────────────────────────────────────────────────

export type Granularite = "semestre" | "mois" | "semaine" | "jour";

const deuxChiffres = (n: number) => String(n).padStart(2, "0");

function versDate(valeur: Date | string | number | null | undefined): Date | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d;
}

const cleJour = (d: Date) =>
  `${d.getUTCFullYear()}-${deuxChiffres(d.getUTCMonth() + 1)}-${deuxChiffres(d.getUTCDate())}`;

/**
 * Clé triable d'une date pour une granularité (semaine = lundi).
 *
 * Tout est lu en UTC : le serveur et le navigateur n'ont pas le même fuseau, et
 * une clé calculée en heure locale rangerait un même élément dans deux groupes
 * différents entre le rendu serveur et l'hydratation.
 */
export function cleTemporelle(
  valeur: Date | string | number | null | undefined,
  granularite: Granularite,
): string | null {
  const d = versDate(valeur);
  if (!d) return null;
  switch (granularite) {
    case "jour":
      return cleJour(d);
    case "semaine": {
      const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      lundi.setUTCDate(lundi.getUTCDate() - ((lundi.getUTCDay() + 6) % 7));
      return cleJour(lundi);
    }
    case "mois":
      return `${d.getUTCFullYear()}-${deuxChiffres(d.getUTCMonth() + 1)}`;
    case "semestre":
      return `${d.getUTCFullYear()}-S${d.getUTCMonth() < 6 ? 1 : 2}`;
  }
}

export interface LibellesTemporels {
  /** Ex. (1, 2026) → « 1er semestre 2026 ». */
  semestre: (numero: 1 | 2, annee: number) => string;
  /** Ex. « 5 octobre 2026 » → « Semaine du 5 octobre 2026 ». */
  semaine: (lundiFormate: string) => string;
}

/**
 * Les quatre axes de date (semestre, mois, semaine, jour) pour un champ date.
 * `choisirAxe` retient ensuite la granularité adaptée à l'étendue réelle des
 * données : une liste sur deux ans se découpe en mois, une sur dix jours en
 * jours. Les groupes sont triés du plus récent au plus ancien.
 */
export function axesTemporels<T>(
  date: (item: T) => Date | string | number | null | undefined,
  localeICU: string,
  libelles: LibellesTemporels,
): AxeRegroupement<T>[] {
  const jourLong = new Intl.DateTimeFormat(localeICU, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const jourCourt = new Intl.DateTimeFormat(localeICU, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const moisLong = new Intl.DateTimeFormat(localeICU, { month: "long", year: "numeric", timeZone: "UTC" });
  const dateDeCle = (cle: string) => {
    const [a, m, j] = cle.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, j || 1));
  };
  const recentDabord = (a: string, b: string) => b.localeCompare(a);

  const libellesParGranularite: Record<Granularite, (cle: string) => string> = {
    semestre: (cle) => {
      const [annee, s] = cle.split("-S");
      return libelles.semestre(s === "1" ? 1 : 2, Number(annee));
    },
    mois: (cle) => moisLong.format(dateDeCle(`${cle}-01`)),
    semaine: (cle) => libelles.semaine(jourCourt.format(dateDeCle(cle))),
    jour: (cle) => jourLong.format(dateDeCle(cle)),
  };

  return (["mois", "semaine", "jour", "semestre"] as const).map((granularite) => ({
    id: granularite,
    cle: (item: T) => cleTemporelle(date(item), granularite),
    libelle: libellesParGranularite[granularite],
    tri: recentDabord,
  }));
}

/** Axe alphabétique (initiale), repli universel pour les listes de personnes. */
export function axeInitiale<T>(nom: (item: T) => string | null | undefined): AxeRegroupement<T> {
  return {
    id: "initiale",
    cle: (item) => {
      const premiere = (nom(item) ?? "").trim().charAt(0);
      if (!premiere) return null;
      const sansAccent = premiere.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
      return /[A-Z]/.test(sansAccent) ? sansAccent : "#";
    },
  };
}
