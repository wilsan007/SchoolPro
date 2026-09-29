// ============================================================
// RAPPROCHEMENT CLASSE ↔ GRILLE TARIFAIRE (domaine pur)
// ============================================================
//
// POURQUOI CE FICHIER EXISTE
// Le libellé du niveau est saisi librement des deux côtés, et PAS dans le
// même référentiel :
//
//   Classe.niveau        → une ANNÉE   (« 6ème », « 5ème », « 2nde », « Terminale A »)
//   TarifNiveau.niveau   → un CYCLE   (« Collège », « Lycée », « Primaire »)
//
// Comparer les chaînes telles quelles — ce que faisait
// `tarifMap.get(niveau.toLowerCase())` dans `genererMensualites` et
// `genererFraisInscription` — ne produit jamais de correspondance : « 6ème »
// n'est pas « Collège ». Résultat : chaque élève était compté en `skipped` et
// la génération affichait « 0 facture » sans le moindre message d'erreur.
// Une facturation qui échoue en silence est pire qu'une facturation qui refuse.
//
// `cycleDuNiveau` ramène donc les deux écritures à une clé commune, puis
// `choisirTarif` applique la règle métier : tarif du SITE de l'élève d'abord,
// tarif GLOBAL (`siteId = null`) à défaut, et JAMAIS le tarif d'un autre site.
//
// DEUX DIVERGENCES ASSUMÉES AVEC L'ÉQUIVALENT D'ECOLPRO (`src/lib/tarifs.ts`)
//   1. La clé canonique est le CYCLE, pas un rang (`an1`, `an6`…) : chez
//      SchoolPro la grille est libellée par cycle, donc une classe de
//      « Terminale » doit rencontrer la ligne « Lycée ».
//   2. EcolPro distingue « 1ère » (1ère année → `an1`) de « Première » (lycée).
//      Ici, les deux désignent la même année de lycée (cf.
//      `src/lib/school-groups.ts`, qui classe 1ère/première en 11 = Lycée).
//
// Rien n'est deviné : un libellé ambigu renvoie `null` et l'appelant doit
// REFUSER de facturer (règle 6 AGENTS.md — le cloisonnement par défaut est
// fermé). On préfère « aucun tarif » à « le tarif d'un autre cycle ».
//
// Ce module est PUR (règle 7) : aucun import de Prisma, de Next.js ou de
// Supabase. Il est testable sans mock, dans `tarifs.test.ts`.

/** Cycle pédagogique — clé canonique de rapprochement. */
export type Cycle = "maternelle" | "primaire" | "college" | "lycee";

/** Libellé affichable d'un cycle (messages d'erreur, journalisation). */
export const LIBELLE_CYCLE: Record<Cycle, string> = {
  maternelle: "Maternelle",
  primaire: "Primaire",
  college: "Collège",
  lycee: "Lycée",
};

/**
 * Normalisation de saisie : accents, casse, apostrophes et séparateurs.
 * « 1ère Année » → « 1ere annee », « Poésie/Chant » → « poesie chant ».
 */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Échelle numérique partagée avec `school-groups.ts` (0 = CI … 12 = Terminale). */
function cycleDeLaRangée(year: number): Cycle | null {
  if (year >= 0 && year <= 5) return "primaire";
  if (year >= 6 && year <= 9) return "college";
  if (year >= 10 && year <= 12) return "lycee";
  return null;
}

/**
 * Libellé débarrassé de ce qui ne change NI le niveau NI le tarif :
 * accents, casse, préfixe de saisie (« Classe de 6ème ») et section
 * (« Terminale A »). « Terminale A » et « Terminale » désignent ainsi le même
 * niveau — sans quoi un suffixe de section suffirait à empêcher la
 * correspondance avec la grille.
 */
function normaliserLibelle(niveau: string): string {
  let n = normaliser(niveau);
  if (!n) return "";

  // « Classe de 6ème », « niveau 1ère », « section B » → on retire le préfixe.
  n = n.replace(/^(?:classe|niveau|section|cours)\s+(?:de\s+|d )?/, "").trim();
  if (!n) return "";

  // « Terminale A », « 6ème B2 », « Lycée C », « 3ème 1 » → on retire la
  // section ou le groupe.
  return n.replace(/\s+(?:[a-d]\d?|\d{1,2})$/, "").trim();
}

/**
 * Cycle d'un libellé de niveau, ou `null` si le libellé est vide, inconnu ou
 * ambigu.
 *
 * AMBIGUÏTÉ VOLONTAIREMENT NON LEVÉE : un chiffre nu de 1 ou 2 n'est pas
 * interprété. « 2 » peut être la 2ème année du primaire ou la classe de 2nde ;
 * « 1 » peut être la 1ère année ou la 1ère (lycée). Deviner reviendrait à
 * facturer un montant arbitraire : on renvoie `null`.
 * Les chiffres nus 6, 5, 4 et 3 sont acceptés (« 6 » = 6ème) parce que le
 * primaire s'écrit toujours avec le mot « année » chez SchoolPro.
 *
 * NOTE : plus strict que `getSchoolGroup()` (`src/lib/school-groups.ts`), qui
 * sert au regroupement d'AFFICHAGE — il renvoie « Autre » et accepte n'importe
 * quel nombre trouvé dans le libellé (« Salle 12 » → Lycée). Ici, un libellé
 * approximatif doit faire échouer la facturation, pas la fausser.
 */
export function cycleDuNiveau(niveau: string | null | undefined): Cycle | null {
  if (typeof niveau !== "string") return null;

  const n = normaliserLibelle(niveau);
  if (!n) return null;

  // « 1ere annee », « 6eme annee », « 3 annee » → l'année est explicite.
  const avecAnnee = n.match(/^(\d{1,2})\s*(?:ere|eme|e)?\s*(?:annee|an|year)\b/);
  if (avecAnnee) return cycleDeLaRangée(parseInt(avecAnnee[1], 10));

  // Maternelle : libellés longs et sigles usuels.
  if (/^(?:maternelle|maternel|petite section|moyenne section|grande section|ps|ms|gs)$/.test(n)) {
    return "maternelle";
  }

  // Primaire : cycle écrit tel quel, ou classes de l'école élémentaire.
  if (/^primaire$/.test(n) || /^(?:ci|cp|ce1|ce2|cm1|cm2)$/.test(n)) return "primaire";

  // Collège / Lycée : cycle écrit tel quel.
  if (/^college$/.test(n)) return "college";
  if (/^lycee$/.test(n)) return "lycee";

  // Années nommées du lycée.
  if (/^(?:seconde|2nde|2nd)$/.test(n)) return "lycee";
  if (/^(?:premiere|1ere|1re)$/.test(n)) return "lycee";
  if (/^(?:terminale|term|tle)$/.test(n)) return "lycee";

  // Années du collège : « 6eme », « 6e », « 6 ».
  const ordinal = n.match(/^(\d{1,2})\s*(?:eme|ere|e|er)?$/);
  if (ordinal) {
    const year = parseInt(ordinal[1], 10);
    // 1 et 2 restent ambigus (voir ci-dessus) : jamais devinés.
    if (year === 1 || year === 2) return null;
    // Écrit en chiffres SANS le mot « année », l'ordinal est celui du
    // secondaire : 6ème, 5ème, 4ème, 3ème sont des classes de collège
    // (l'école primaire écrit toujours « 5ème année »).
    if (year >= 3 && year <= 9) return "college";
    return cycleDeLaRangée(year);
  }

  return null;
}

// ============================================================
// Types de frais facturables à partir de la grille
// ============================================================

/** Types de frais que la grille tarifaire sait chiffrer. */
export const TYPES_FRAIS = [
  "MENSUALITE",
  "INSCRIPTION",
  "RENOUVELLEMENT",
  "CANTINE",
  "TRANSPORT",
] as const;

export type TypeFrais = (typeof TYPES_FRAIS)[number];

/**
 * Normalise le paramètre `type` d'une requête HTTP. Toute valeur inconnue
 * retombe sur `MENSUALITE` : c'est le comportement historique de
 * `/api/facturation/tarif`, conservé pour ne pas changer le contrat d'API.
 */
export function normaliserTypeFrais(valeur: string | null | undefined): TypeFrais {
  const haut = (valeur ?? "").toUpperCase();
  return (TYPES_FRAIS as readonly string[]).includes(haut) ? (haut as TypeFrais) : "MENSUALITE";
}

// ============================================================
// Choix du tarif applicable
// ============================================================

/** Champs de `TarifNiveau` nécessaires au rapprochement. */
export interface TarifLike {
  niveau: string;
  siteId: string | null;
  annee?: string;
  mensualite: number;
  fraisInscription: number;
  fraisRenouvellement: number;
  fraisCantine?: number | null;
  fraisTransport?: number | null;
  devise: string;
  nbMois?: number;
  actif: boolean;
}

export interface TarifChoisi<T extends TarifLike> {
  tarif: T;
  /** `SITE` = tarif propre au site de l'élève, `GLOBAL` = tarif hérité. */
  source: "SITE" | "GLOBAL";
  /** `true` si la ligne choisie porte le libellé exact de la classe. */
  libelleExact: boolean;
}

/**
 * Tarif applicable à un élève — celui de son site, sinon le tarif global.
 *
 * Ordre de préférence, du plus précis au plus général :
 *   1. même libellé que la classe + site de l'élève   (« 6ème » vs « 6ème »)
 *   2. même libellé que la classe + global
 *   3. même cycle + site de l'élève                   (« 6ème » vs « Collège »)
 *   4. même cycle + global
 *
 * Un tarif appartenant à un AUTRE site n'est jamais retenu. Un tarif inactif
 * non plus. Un niveau non reconnu (`cycleDuNiveau` → `null`) ne donne aucun
 * résultat : l'appelant DOIT refuser de facturer plutôt que deviner.
 */
export function choisirTarif<T extends TarifLike>(
  tarifs: readonly T[],
  siteId: string | null | undefined,
  niveau: string | null | undefined
): TarifChoisi<T> | null {
  const cycle = cycleDuNiveau(niveau);
  if (!cycle) return null;

  const cible = typeof niveau === "string" ? normaliserLibelle(niveau) : "";

  const duCycle = tarifs.filter((t) => t.actif && cycleDuNiveau(t.niveau) === cycle);
  if (duCycle.length === 0) return null;

  const memeLibelle = duCycle.filter((t) => normaliserLibelle(t.niveau) === cible);
  const base = memeLibelle.length > 0 ? memeLibelle : duCycle;
  const libelleExact = memeLibelle.length > 0;

  if (siteId) {
    const duSite = base.find((t) => t.siteId === siteId);
    if (duSite) return { tarif: duSite, source: "SITE", libelleExact };
  }

  const global = base.find((t) => t.siteId === null);
  return global ? { tarif: global, source: "GLOBAL", libelleExact } : null;
}

// ============================================================
// Montants
// ============================================================

/**
 * Montant correspondant au type de frais.
 *
 * Renvoie `null` quand la grille ne propose pas l'option (cantine ou transport
 * absents) : l'appelant décide s'il affiche « non proposé » ou s'il refuse la
 * facture — le domaine n'invente jamais 0, qui se lit « gratuit ».
 */
export function montantPourTypeFrais(tarif: TarifLike, type: TypeFrais): number | null {
  switch (type) {
    case "INSCRIPTION":
      return tarif.fraisInscription;
    case "RENOUVELLEMENT":
      return tarif.fraisRenouvellement;
    case "CANTINE":
      return tarif.fraisCantine ?? null;
    case "TRANSPORT":
      return tarif.fraisTransport ?? null;
    case "MENSUALITE":
    default:
      return tarif.mensualite;
  }
}

/** Mensualité, augmentée des options demandées et réellement tarifées. */
export function montantMensuel(
  tarif: TarifLike,
  options?: { cantine?: boolean; transport?: boolean }
): number {
  let montant = tarif.mensualite;
  if (options?.cantine && tarif.fraisCantine) montant += tarif.fraisCantine;
  if (options?.transport && tarif.fraisTransport) montant += tarif.fraisTransport;
  return montant;
}

