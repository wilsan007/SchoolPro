/**
 * LEARNOS — Analyses longitudinales : trajectoires & cohortes
 * ============================================================
 *
 * Ce module regroupe six analyses déterministes portant sur le suivi
 * longitudinal des élèves : écarts de genre dans le temps, comparaison
 * boursiers / non-boursiers, efficacité du redoublement, motifs de transfert,
 * probabilité de diplomation par cohorte et prédiction de remplissage des
 * classes. Aucune analyse n'en appelle à un modèle de langage : tout est
 * calculé à partir des données Prisma existantes.
 *
 *  A9  — Écart de genre dans le temps (filles vs garçons par période)
 *  A10 — Boursiers vs non-boursiers (par niveau, par période)
 *  A11 — Efficacité du redoublement (moyenne N vs N+1)
 *  A12 — Motifs de transfert / abandon (par classe, par niveau)
 *  A13 — Probabilité de diplomation par cohorte (par filière, par site)
 *  I11 — Prédiction de remplissage des classes (effectifs prévus)
 *
 * RÈGLES
 *  - Chaque requête Prisma inclut `tenantId` et `siteFilterForModel()`.
 *  - Les taux vont de 0 à 1 (0 = 0 %, 1 = 100 %).
 *  - Une donnée manquante ne produit pas un faux 0 : les fonctions renvoient
 *    un drapeau `donneesInsuffisantes` quand l'échantillon est vide.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { anneeActiveLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Borner une valeur dans [0, 1]. */
function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Taux = numérateur / dénominateur, borné dans [0, 1].
 * Renvoie `null` si le dénominateur est nul (division impossible).
 */
function taux(numerateur: number, denominateur: number): number | null {
  if (denominateur <= 0) return null;
  return clamp01(numerateur / denominateur);
}

/**
 * Moyenne d'un tableau de nombres, en ignorant les valeurs nulles.
 * Renvoie `null` si le tableau est vide ou ne contient que des nulls.
 */
function moyenneValeurs(valeurs: (number | null | undefined)[]): number | null {
  const valides = valeurs.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (valides.length === 0) return null;
  return valides.reduce((a, b) => a + b, 0) / valides.length;
}

/**
 * Calcule la pente d'une tendance linéaire (régression des moindres carrés)
 * sur une série ordonnée. Renvoie `null` si moins de deux points.
 *
 * Une pente positive signifie que la valeur augmente au fil du temps.
 */
function penteTendance(points: { rang: number; valeur: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const xs = points.map((p) => p.rang);
  const ys = points.map((p) => p.valeur);
  const sommeX = xs.reduce((a, b) => a + b, 0);
  const sommeY = ys.reduce((a, b) => a + b, 0);
  const sommeXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sommeXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sommeXX - sommeX * sommeX;
  if (denom === 0) return null;
  return (n * sommeXY - sommeX * sommeY) / denom;
}

/**
 * Convertit un libellé d'année scolaire "2024-2025" en l'année de début
 * (2024) pour permettre le tri chronologique et le calcul d'année suivante.
 */
function anneeDebut(libelle: string): number | null {
  const match = libelle.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Calcule le libellé de l'année suivante : "2024-2025" → "2025-2026".
 * Renvoie `null` si le format n'est pas exploitable.
 */
function anneeSuivante(libelle: string): string | null {
  const debut = anneeDebut(libelle);
  if (debut === null) return null;
  return `${debut + 1}-${debut + 2}`;
}

// ============================================================
// A9 — ÉCART DE GENRE DANS LE TEMPS
// ============================================================

/**
 * Écart de performance entre filles et garçons, mesuré par période
 * (trimestre / semestre) et par année scolaire.
 */
export interface EcartGenre {
  /** Moyenne générale des filles sur l'ensemble du périmètre (0-20). */
  moyenneFilles: number | null;
  /** Moyenne générale des garçons sur l'ensemble du périmètre (0-20). */
  moyenneGarcons: number | null;
  /** Écart filles - garçons (positif = avantage filles, négatif = garçons). */
  ecartGlobal: number | null;
  /** Ventilation par période (trimestre / semestre). */
  parPeriode: {
    periodeId: string;
    periodeNom: string;
    anneeLibelle: string;
    moyenneFilles: number | null;
    moyenneGarcons: number | null;
    /** Écart filles - garçons pour cette période. */
    ecart: number | null;
    nbFilles: number;
    nbGarcons: number;
  }[];
  /** Tendance : pente de la régression linéaire des écarts par période. */
  tendance: number | null;
  /** `true` si l'écart se creuse (pente positive = avantage filles qui augmente
   *  ou pente négative = avantage garçons qui augmente en valeur absolue). */
  ecartSeCreuse: boolean;
  /** `true` si l'écart se réduit (pente tend vers zéro). */
  ecartSeReduit: boolean;
  /** `true` si aucune donnée n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse l'écart de genre dans le temps (A9).
 *
 * Calcule la moyenne générale des bulletins par sexe (M/F), ventilée par
 * période, puis détermine si l'écart filles-garçons se creuse ou se réduit
 * au fil du temps.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserEcartGenre(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<EcartGenre> {
  // 1. Charger tous les bulletins du périmètre avec l'élève et la période.
  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("bulletin", claims),
      moyenneGenerale: { not: null },
    },
    select: {
      eleveId: true,
      moyenneGenerale: true,
      periode: {
        select: {
          id: true,
          nom: true,
          numero: true,
          annee: { select: { libelle: true } },
        },
      },
      eleve: { select: { sexe: true } },
    },
  });

  if (bulletins.length === 0) {
    return {
      moyenneFilles: null,
      moyenneGarcons: null,
      ecartGlobal: null,
      parPeriode: [],
      tendance: null,
      ecartSeCreuse: false,
      ecartSeReduit: false,
      donneesInsuffisantes: true,
    };
  }

  // 2. Moyennes globales par sexe.
  const moyennesFilles = bulletins
    .filter((b) => b.eleve.sexe === "F")
    .map((b) => b.moyenneGenerale);
  const moyennesGarcons = bulletins
    .filter((b) => b.eleve.sexe === "M")
    .map((b) => b.moyenneGenerale);

  const moyenneFilles = moyenneValeurs(moyennesFilles);
  const moyenneGarcons = moyenneValeurs(moyennesGarcons);
  const ecartGlobal =
    moyenneFilles !== null && moyenneGarcons !== null
      ? moyenneFilles - moyenneGarcons
      : null;

  // 3. Ventilation par période.
  const parPeriodeMap = new Map<
    string,
    {
      periodeId: string;
      periodeNom: string;
      anneeLibelle: string;
      numero: number;
      filles: number[];
      garcons: number[];
    }
  >();

  for (const b of bulletins) {
    const cle = b.periode.id;
    const slot =
      parPeriodeMap.get(cle) ??
      {
        periodeId: b.periode.id,
        periodeNom: b.periode.nom,
        anneeLibelle: b.periode.annee.libelle,
        numero: b.periode.numero,
        filles: [],
        garcons: [],
      };
    if (b.eleve.sexe === "F") {
      slot.filles.push(b.moyenneGenerale!);
    } else {
      slot.garcons.push(b.moyenneGenerale!);
    }
    parPeriodeMap.set(cle, slot);
  }

  // 4. Calculer les écarts par période, triés chronologiquement.
  const parPeriode = Array.from(parPeriodeMap.values())
    .map((v) => {
      const moyF = moyenneValeurs(v.filles);
      const moyG = moyenneValeurs(v.garcons);
      return {
        periodeId: v.periodeId,
        periodeNom: v.periodeNom,
        anneeLibelle: v.anneeLibelle,
        moyenneFilles: moyF,
        moyenneGarcons: moyG,
        ecart: moyF !== null && moyG !== null ? moyF - moyG : null,
        nbFilles: v.filles.length,
        nbGarcons: v.garcons.length,
        _numero: v.numero,
        _anneeDebut: anneeDebut(v.anneeLibelle) ?? 0,
      };
    })
    .sort((a, b) => a._anneeDebut - b._anneeDebut || a._numero - b._numero);

  // 5. Tendance : pente de la régression sur les écarts par période.
  const pointsTendance = parPeriode
    .filter((p) => p.ecart !== null)
    .map((p, i) => ({ rang: i, valeur: p.ecart as number }));
  const tendance = penteTendance(pointsTendance);

  // 6. Interprétation de la tendance.
  //    L'écart se creuse si la pente et l'écart global sont de même signe
  //    (l'avantage du groupe en tête s'accentue). Il se réduit si la pente
  //    est de signe opposé à l'écart global (le groupe en retard rattrape).
  //    Seuil de significativité : |pente| > 0.05 point par période.
  const SEUIL_PENTE = 0.05;
  let ecartSeCreuse = false;
  let ecartSeReduit = false;
  if (tendance !== null && ecartGlobal !== null) {
    const penteSignificative = Math.abs(tendance) > SEUIL_PENTE;
    const memeSigne = tendance * ecartGlobal > 0;
    ecartSeCreuse = penteSignificative && memeSigne;
    ecartSeReduit = penteSignificative && !memeSigne;
  } else if (tendance !== null) {
    // Sans écart global de référence, on regarde juste l'amplitude.
    ecartSeCreuse = Math.abs(tendance) > SEUIL_PENTE;
    ecartSeReduit = Math.abs(tendance) <= SEUIL_PENTE;
  }

  return {
    moyenneFilles,
    moyenneGarcons,
    ecartGlobal,
    parPeriode: parPeriode.map(({ _numero, _anneeDebut, ...rest }) => rest),
    tendance,
    ecartSeCreuse,
    ecartSeReduit,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// A10 — BOURSIERS VS NON-BOURSIERS
// ============================================================

/**
 * Comparaison de performance entre élèves boursiers et non-boursiers.
 */
export interface BoursiersVsNonBoursiers {
  /** Moyenne générale des boursiers sur l'ensemble du périmètre (0-20). */
  moyenneBoursiers: number | null;
  /** Moyenne générale des non-boursiers sur l'ensemble du périmètre (0-20). */
  moyenneNonBoursiers: number | null;
  /** Écart boursiers - non-boursiers (positif = avantage boursiers). */
  ecartGlobal: number | null;
  /** Ventilation par niveau scolaire. */
  parNiveau: {
    niveau: string;
    moyenneBoursiers: number | null;
    moyenneNonBoursiers: number | null;
    ecart: number | null;
    nbBoursiers: number;
    nbNonBoursiers: number;
  }[];
  /** Ventilation par période (trimestre / semestre). */
  parPeriode: {
    periodeId: string;
    periodeNom: string;
    anneeLibelle: string;
    moyenneBoursiers: number | null;
    moyenneNonBoursiers: number | null;
    ecart: number | null;
    nbBoursiers: number;
    nbNonBoursiers: number;
  }[];
  /** `true` si aucune donnée n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Compare les performances des boursiers et des non-boursiers (A10).
 *
 * Calcule la moyenne générale des bulletins en distinguant les élèves dont
 * `numeroBoursier` est renseigné (boursiers) de ceux dont il est null
 * (non-boursiers), ventilé par niveau et par période.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function comparerBoursiers(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<BoursiersVsNonBoursiers> {
  // 1. Charger tous les bulletins du périmètre avec l'élève, la période
  //    et la classe (pour le niveau).
  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("bulletin", claims),
      moyenneGenerale: { not: null },
    },
    select: {
      eleveId: true,
      moyenneGenerale: true,
      periode: {
        select: {
          id: true,
          nom: true,
          numero: true,
          annee: { select: { libelle: true } },
        },
      },
      eleve: {
        select: {
          numeroBoursier: true,
          classe: { select: { niveau: true } },
        },
      },
    },
  });

  if (bulletins.length === 0) {
    return {
      moyenneBoursiers: null,
      moyenneNonBoursiers: null,
      ecartGlobal: null,
      parNiveau: [],
      parPeriode: [],
      donneesInsuffisantes: true,
    };
  }

  // 2. Séparer boursiers et non-boursiers.
  const estBoursier = (numeroBoursier: string | null) => numeroBoursier !== null && numeroBoursier !== "";

  const moyennesBoursiers = bulletins
    .filter((b) => estBoursier(b.eleve.numeroBoursier))
    .map((b) => b.moyenneGenerale);
  const moyennesNonBoursiers = bulletins
    .filter((b) => !estBoursier(b.eleve.numeroBoursier))
    .map((b) => b.moyenneGenerale);

  const moyenneBoursiers = moyenneValeurs(moyennesBoursiers);
  const moyenneNonBoursiers = moyenneValeurs(moyennesNonBoursiers);
  const ecartGlobal =
    moyenneBoursiers !== null && moyenneNonBoursiers !== null
      ? moyenneBoursiers - moyenneNonBoursiers
      : null;

  // 3. Ventilation par niveau (via la classe de l'élève).
  const parNiveauMap = new Map<
    string,
    { boursiers: number[]; nonBoursiers: number[] }
  >();

  for (const b of bulletins) {
    const niveau = b.eleve.classe?.niveau ?? "Non assigné";
    const slot = parNiveauMap.get(niveau) ?? { boursiers: [], nonBoursiers: [] };
    if (estBoursier(b.eleve.numeroBoursier)) {
      slot.boursiers.push(b.moyenneGenerale!);
    } else {
      slot.nonBoursiers.push(b.moyenneGenerale!);
    }
    parNiveauMap.set(niveau, slot);
  }

  const parNiveau = Array.from(parNiveauMap.entries())
    .map(([niveau, v]) => {
      const moyB = moyenneValeurs(v.boursiers);
      const moyNB = moyenneValeurs(v.nonBoursiers);
      return {
        niveau,
        moyenneBoursiers: moyB,
        moyenneNonBoursiers: moyNB,
        ecart: moyB !== null && moyNB !== null ? moyB - moyNB : null,
        nbBoursiers: v.boursiers.length,
        nbNonBoursiers: v.nonBoursiers.length,
      };
    })
    .sort((a, b) => a.niveau.localeCompare(b.niveau));

  // 4. Ventilation par période.
  const parPeriodeMap = new Map<
    string,
    {
      periodeId: string;
      periodeNom: string;
      anneeLibelle: string;
      numero: number;
      boursiers: number[];
      nonBoursiers: number[];
    }
  >();

  for (const b of bulletins) {
    const cle = b.periode.id;
    const slot =
      parPeriodeMap.get(cle) ??
      {
        periodeId: b.periode.id,
        periodeNom: b.periode.nom,
        anneeLibelle: b.periode.annee.libelle,
        numero: b.periode.numero,
        boursiers: [],
        nonBoursiers: [],
      };
    if (estBoursier(b.eleve.numeroBoursier)) {
      slot.boursiers.push(b.moyenneGenerale!);
    } else {
      slot.nonBoursiers.push(b.moyenneGenerale!);
    }
    parPeriodeMap.set(cle, slot);
  }

  const parPeriode = Array.from(parPeriodeMap.values())
    .map((v) => {
      const moyB = moyenneValeurs(v.boursiers);
      const moyNB = moyenneValeurs(v.nonBoursiers);
      return {
        periodeId: v.periodeId,
        periodeNom: v.periodeNom,
        anneeLibelle: v.anneeLibelle,
        moyenneBoursiers: moyB,
        moyenneNonBoursiers: moyNB,
        ecart: moyB !== null && moyNB !== null ? moyB - moyNB : null,
        nbBoursiers: v.boursiers.length,
        nbNonBoursiers: v.nonBoursiers.length,
        _numero: v.numero,
        _anneeDebut: anneeDebut(v.anneeLibelle) ?? 0,
      };
    })
    .sort((a, b) => a._anneeDebut - b._anneeDebut || a._numero - b._numero)
    .map(({ _numero, _anneeDebut, ...rest }) => rest);

  return {
    moyenneBoursiers,
    moyenneNonBoursiers,
    ecartGlobal,
    parNiveau,
    parPeriode,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// A11 — EFFICACITÉ DU REDOUBLEMENT
// ============================================================

/**
 * Mesure de l'efficacité du redoublement : comparaison des moyennes
 * avant et après redoublement.
 */
export interface EfficaciteRedoublement {
  /** Nombre d'élèves redoublants identifiés avec données exploitables. */
  nbRedoublants: number;
  /** Moyenne annuelle moyenne avant redoublement (année N, 0-20). */
  moyenneAvant: number | null;
  /** Moyenne annuelle moyenne après redoublement (année N+1, 0-20). */
  moyenneApres: number | null;
  /** Δ moyen = moyenneApres - moyenneAvant (positif = amélioration). */
  deltaMoyen: number | null;
  /** % d'élèves dont la moyenne s'est améliorée après redoublement (0-1). */
  pctAmeliores: number | null;
  /** % d'élèves dont la moyenne a stagné (|Δ| < 0.5 point, 0-1). */
  pctStagnants: number | null;
  /** % d'élèves dont la moyenne a régressé (0-1). */
  pctRegresses: number | null;
  /** Détail élève par élève (anonymisé par identifiant). */
  detail: {
    eleveId: string;
    moyenneAvant: number | null;
    moyenneApres: number | null;
    delta: number | null;
    ameliore: boolean;
  }[];
  /** `true` si aucun redoublant n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse l'efficacité du redoublement (A11).
 *
 * Identifie les élèves ayant un `ParcoursScolaire` avec
 * `decision = "Redoublement"` pour une année N, puis vérifie leur présence
 * pour l'année N+1. Compare alors leur `moyenneAnnuelle` en N vs N+1.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserEfficaciteRedoublement(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<EfficaciteRedoublement> {
  // 1. Charger tous les parcours scolaires du périmètre.
  const parcours = await prisma.parcoursScolaire.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("parcoursScolaire", claims),
    },
    select: {
      id: true,
      eleveId: true,
      annee: true,
      moyenneAnnuelle: true,
      decision: true,
    },
  });

  if (parcours.length === 0) {
    return {
      nbRedoublants: 0,
      moyenneAvant: null,
      moyenneApres: null,
      deltaMoyen: null,
      pctAmeliores: null,
      pctStagnants: null,
      pctRegresses: null,
      detail: [],
      donneesInsuffisantes: true,
    };
  }

  // 2. Identifier les décisions de redoublement (decision contient "Redoublement").
  const redoublements = parcours.filter(
    (p) =>
      p.decision !== null &&
      p.decision.toLowerCase().includes("redouble"),
  );

  if (redoublements.length === 0) {
    return {
      nbRedoublants: 0,
      moyenneAvant: null,
      moyenneApres: null,
      deltaMoyen: null,
      pctAmeliores: null,
      pctStagnants: null,
      pctRegresses: null,
      detail: [],
      donneesInsuffisantes: true,
    };
  }

  // 3. Indexer les parcours par élève pour retrouver l'année suivante.
  const parcoursParEleve = new Map<
    string,
    Map<string, (typeof parcours)[number]>
  >();
  for (const p of parcours) {
    const mapEleve = parcoursParEleve.get(p.eleveId) ?? new Map();
    mapEleve.set(p.annee, p);
    parcoursParEleve.set(p.eleveId, mapEleve);
  }

  // 4. Pour chaque redoublement, chercher le parcours de l'année suivante.
  const comparaisons: {
    eleveId: string;
    moyenneAvant: number | null;
    moyenneApres: number | null;
    delta: number | null;
    ameliore: boolean;
  }[] = [];

  for (const r of redoublements) {
    const anneeN = r.annee;
    const anneeN1 = anneeSuivante(anneeN);
    if (anneeN1 === null) continue;

    const mapEleve = parcoursParEleve.get(r.eleveId);
    if (!mapEleve) continue;

    const parcoursN1 = mapEleve.get(anneeN1);
    if (!parcoursN1) continue;

    const moyAvant = r.moyenneAnnuelle;
    const moyApres = parcoursN1.moyenneAnnuelle;
    const delta =
      moyAvant !== null && moyApres !== null ? moyApres - moyAvant : null;

    comparaisons.push({
      eleveId: r.eleveId,
      moyenneAvant: moyAvant,
      moyenneApres: moyApres,
      delta,
      ameliore: delta !== null && delta > 0.5, // seuil : +0.5 point = amélioration notable
    });
  }

  if (comparaisons.length === 0) {
    return {
      nbRedoublants: 0,
      moyenneAvant: null,
      moyenneApres: null,
      deltaMoyen: null,
      pctAmeliores: null,
      pctStagnants: null,
      pctRegresses: null,
      detail: [],
      donneesInsuffisantes: true,
    };
  }

  // 5. Agréger les résultats.
  const deltasValides = comparaisons
    .filter((c) => c.delta !== null)
    .map((c) => c.delta as number);

  const moyennesAvant = comparaisons.map((c) => c.moyenneAvant);
  const moyennesApres = comparaisons.map((c) => c.moyenneApres);

  const moyenneAvant = moyenneValeurs(moyennesAvant);
  const moyenneApres = moyenneValeurs(moyennesApres);
  const deltaMoyen = moyenneValeurs(deltasValides);

  const nbAvecDelta = deltasValides.length;
  const nbAmeliores = deltasValides.filter((d) => d > 0.5).length;
  const nbStagnants = deltasValides.filter((d) => Math.abs(d) <= 0.5).length;
  const nbRegresses = deltasValides.filter((d) => d < -0.5).length;

  return {
    nbRedoublants: comparaisons.length,
    moyenneAvant,
    moyenneApres,
    deltaMoyen,
    pctAmeliores: taux(nbAmeliores, nbAvecDelta),
    pctStagnants: taux(nbStagnants, nbAvecDelta),
    pctRegresses: taux(nbRegresses, nbAvecDelta),
    detail: comparaisons,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// A12 — MOTIFS DE TRANSFERT
// ============================================================

/**
 * Recensement des motifs de sortie (transfert, abandon) par classe et niveau.
 */
export interface MotifsTransfert {
  /** Nombre total d'élèves sortis (transférés ou abandonnés) dans le périmètre. */
  nbTotalSortants: number;
  /** Ventilation par motif de sortie. */
  parMotif: {
    motif: string;
    nb: number;
    /** Part relative du motif (0-1). */
    part: number | null;
  }[];
  /** Ventilation par classe. */
  parClasse: {
    classeNom: string | null;
    niveau: string | null;
    nb: number;
    motifs: { motif: string; nb: number }[];
  }[];
  /** Ventilation par niveau scolaire. */
  parNiveau: {
    niveau: string;
    nb: number;
    motifs: { motif: string; nb: number }[];
  }[];
  /** `true` si aucun élève sorti n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse les motifs de transfert et d'abandon (A12).
 *
 * Recense les élèves dont le statut est `TRANSFERE` ou `ABANDONNE`, puis
 * ventile par `motifSortie`, par classe et par niveau.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserMotifsTransfert(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<MotifsTransfert> {
  // 1. Charger les élèves sortis (transférés ou abandonnés) du périmètre.
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("eleve", claims),
      statut: { in: ["TRANSFERE", "ABANDONNE"] },
      deletedAt: null,
    },
    select: {
      id: true,
      motifSortie: true,
      classe: { select: { nom: true, niveau: true } },
    },
  });

  if (eleves.length === 0) {
    return {
      nbTotalSortants: 0,
      parMotif: [],
      parClasse: [],
      parNiveau: [],
      donneesInsuffisantes: true,
    };
  }

  const nbTotalSortants = eleves.length;

  // 2. Ventilation par motif.
  const parMotifMap = new Map<string, number>();
  for (const e of eleves) {
    const motif = e.motifSortie ?? "Non précisé";
    parMotifMap.set(motif, (parMotifMap.get(motif) ?? 0) + 1);
  }

  const parMotif = Array.from(parMotifMap.entries())
    .map(([motif, nb]) => ({
      motif,
      nb,
      part: taux(nb, nbTotalSortants),
    }))
    .sort((a, b) => b.nb - a.nb);

  // 3. Ventilation par classe.
  const parClasseMap = new Map<
    string,
    {
      classeNom: string | null;
      niveau: string | null;
      motifs: Map<string, number>;
    }
  >();

  for (const e of eleves) {
    const classeNom = e.classe?.nom ?? null;
    const niveau = e.classe?.niveau ?? null;
    const cle = classeNom ?? "__sans_classe__";
    const slot =
      parClasseMap.get(cle) ??
      {
        classeNom,
        niveau,
        motifs: new Map<string, number>(),
      };
    const motif = e.motifSortie ?? "Non précisé";
    slot.motifs.set(motif, (slot.motifs.get(motif) ?? 0) + 1);
    parClasseMap.set(cle, slot);
  }

  const parClasse = Array.from(parClasseMap.values())
    .map((v) => ({
      classeNom: v.classeNom,
      niveau: v.niveau,
      nb: Array.from(v.motifs.values()).reduce((a, b) => a + b, 0),
      motifs: Array.from(v.motifs.entries())
        .map(([motif, nb]) => ({ motif, nb }))
        .sort((a, b) => b.nb - a.nb),
    }))
    .sort((a, b) => b.nb - a.nb);

  // 4. Ventilation par niveau.
  const parNiveauMap = new Map<
    string,
    { motifs: Map<string, number> }
  >();

  for (const e of eleves) {
    const niveau = e.classe?.niveau ?? "Non assigné";
    const slot = parNiveauMap.get(niveau) ?? { motifs: new Map<string, number>() };
    const motif = e.motifSortie ?? "Non précisé";
    slot.motifs.set(motif, (slot.motifs.get(motif) ?? 0) + 1);
    parNiveauMap.set(niveau, slot);
  }

  const parNiveau = Array.from(parNiveauMap.entries())
    .map(([niveau, v]) => ({
      niveau,
      nb: Array.from(v.motifs.values()).reduce((a, b) => a + b, 0),
      motifs: Array.from(v.motifs.entries())
        .map(([motif, nb]) => ({ motif, nb }))
        .sort((a, b) => b.nb - a.nb),
    }))
    .sort((a, b) => b.nb - a.nb);

  return {
    nbTotalSortants,
    parMotif,
    parClasse,
    parNiveau,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// A13 — PROBABILITÉ DE DIPLOMATION PAR COHORTE
// ============================================================

/**
 * Probabilité de diplomation par cohorte (année d'inscription).
 */
export interface ProbabiliteDiplomation {
  /** Taux de diplomation global sur l'ensemble du périmètre (0-1). */
  tauxGlobal: number | null;
  /** Nombre total d'élèves inscrits (toutes cohortes confondues). */
  nbInscrits: number;
  /** Nombre d'élèves diplômés. */
  nbDiplomes: number;
  /** Ventilation par cohorte (année d'inscription). */
  parCohorte: {
    cohorte: string;
    nbInscrits: number;
    nbDiplomes: number;
    taux: number | null;
  }[];
  /** Ventilation par filière (via la classe de l'élève). */
  parFiliere: {
    filiere: string;
    nbInscrits: number;
    nbDiplomes: number;
    taux: number | null;
  }[];
  /** Ventilation par site. */
  parSite: {
    siteId: string | null;
    siteNom: string | null;
    nbInscrits: number;
    nbDiplomes: number;
    taux: number | null;
  }[];
  /** `true` si aucun élève n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Calcule la probabilité de diplomation par cohorte (A13).
 *
 * Pour chaque cohorte (année d'inscription), calcule le ratio
 * `COUNT(statut=DIPLOME) / COUNT(inscrits initial)`, ventilé par filière
 * et par site.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function calculerProbabiliteDiplomation(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<ProbabiliteDiplomation> {
  // 1. Charger tous les élèves du périmètre (non supprimés).
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("eleve", claims),
      deletedAt: null,
    },
    select: {
      id: true,
      anneeInscription: true,
      statut: true,
      siteId: true,
      classe: { select: { filiere: true } },
    },
  });

  if (eleves.length === 0) {
    return {
      tauxGlobal: null,
      nbInscrits: 0,
      nbDiplomes: 0,
      parCohorte: [],
      parFiliere: [],
      parSite: [],
      donneesInsuffisantes: true,
    };
  }

  // 2. Statistiques globales.
  const nbInscrits = eleves.length;
  const nbDiplomes = eleves.filter((e) => e.statut === "DIPLOME").length;
  const tauxGlobal = taux(nbDiplomes, nbInscrits);

  // 3. Ventilation par cohorte (année d'inscription).
  const parCohorteMap = new Map<
    string,
    { nbInscrits: number; nbDiplomes: number }
  >();
  for (const e of eleves) {
    const cohorte = e.anneeInscription;
    const slot = parCohorteMap.get(cohorte) ?? { nbInscrits: 0, nbDiplomes: 0 };
    slot.nbInscrits += 1;
    if (e.statut === "DIPLOME") slot.nbDiplomes += 1;
    parCohorteMap.set(cohorte, slot);
  }

  const parCohorte = Array.from(parCohorteMap.entries())
    .map(([cohorte, v]) => ({
      cohorte,
      nbInscrits: v.nbInscrits,
      nbDiplomes: v.nbDiplomes,
      taux: taux(v.nbDiplomes, v.nbInscrits),
    }))
    .sort((a, b) => a.cohorte.localeCompare(b.cohorte));

  // 4. Ventilation par filière (via la classe actuelle de l'élève).
  const parFiliereMap = new Map<
    string,
    { nbInscrits: number; nbDiplomes: number }
  >();
  for (const e of eleves) {
    const filiere = e.classe?.filiere ?? "Non assignée";
    const slot = parFiliereMap.get(filiere) ?? { nbInscrits: 0, nbDiplomes: 0 };
    slot.nbInscrits += 1;
    if (e.statut === "DIPLOME") slot.nbDiplomes += 1;
    parFiliereMap.set(filiere, slot);
  }

  const parFiliere = Array.from(parFiliereMap.entries())
    .map(([filiere, v]) => ({
      filiere,
      nbInscrits: v.nbInscrits,
      nbDiplomes: v.nbDiplomes,
      taux: taux(v.nbDiplomes, v.nbInscrits),
    }))
    .sort((a, b) => b.nbInscrits - a.nbInscrits);

  // 5. Ventilation par site.
  //    On charge les noms des sites pour un affichage lisible.
  const siteIds = Array.from(
    new Set(eleves.map((e) => e.siteId).filter((id): id is string => id !== null)),
  );
  const sites =
    siteIds.length > 0
      ? await prisma.site.findMany({
          where: { id: { in: siteIds }, tenantId },
          select: { id: true, nom: true },
        })
      : [];
  const siteNomParId = new Map(sites.map((s) => [s.id, s.nom]));

  const parSiteMap = new Map<
    string,
    { siteId: string | null; nbInscrits: number; nbDiplomes: number }
  >();
  for (const e of eleves) {
    const cle = e.siteId ?? "__sans_site__";
    const slot = parSiteMap.get(cle) ?? {
      siteId: e.siteId,
      nbInscrits: 0,
      nbDiplomes: 0,
    };
    slot.nbInscrits += 1;
    if (e.statut === "DIPLOME") slot.nbDiplomes += 1;
    parSiteMap.set(cle, slot);
  }

  const parSite = Array.from(parSiteMap.values())
    .map((v) => ({
      siteId: v.siteId,
      siteNom: v.siteId !== null ? (siteNomParId.get(v.siteId) ?? null) : null,
      nbInscrits: v.nbInscrits,
      nbDiplomes: v.nbDiplomes,
      taux: taux(v.nbDiplomes, v.nbInscrits),
    }))
    .sort((a, b) => b.nbInscrits - a.nbInscrits);

  return {
    tauxGlobal,
    nbInscrits,
    nbDiplomes,
    parCohorte,
    parFiliere,
    parSite,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// I11 — PRÉDICTION DE REMPLISSAGE DES CLASSES
// ============================================================

/**
 * Prédiction du remplissage des classes pour l'année suivante.
 */
export interface PredictionRemplissage {
  /** Année scolaire cible de la prédiction. */
  anneeCible: string;
  /** Ventilation par classe. */
  parClasse: {
    classeId: string;
    classeNom: string;
    niveau: string;
    siteId: string | null;
    siteNom: string | null;
    /** Effectif actuel (élèves actifs dans la classe). */
    effectifActuel: number;
    /** Effectif maximum de la classe. */
    effectifMax: number;
    /** Sortants prévus (diplômés + transférés + abandonnés). */
    sortantsPrevus: number;
    /** Candidatures admises pour cette classe / année cible. */
    candidaturesAdmises: number;
    /** Taux de rétention historique (0-1) : part d'élèves qui restent d'une
     *  année sur l'autre, calculé sur les années précédentes. */
    tauxRetention: number | null;
    /** Effectif prévu = effectifActuel - sortantsPrevus + candidaturesAdmises
     *  + (effectifActuel × tauxRetention si non nul). */
    effectifPrevu: number;
    /** `true` si la classe est sous-effective prévue (< 60 % de l'effectif max). */
    sousEffective: boolean;
    /** `true` si la classe est en surcharge prévue (> 100 % de l'effectif max). */
    surcharge: boolean;
    /** Taux de remplissage prévu (0-1+). */
    tauxRemplissage: number | null;
  }[];
  /** Classes identifiées comme sous-effectives prévues. */
  classesSousEffectives: string[];
  /** Classes identifiées en surcharge prévue. */
  classesSurcharge: string[];
  /** `true` si aucune classe n'est disponible dans le périmètre. */
  donneesInsuffisantes: boolean;
}

/**
 * Prédit le remplissage des classes pour l'année suivante (I11).
 *
 * Pour chaque classe active, calcule l'effectif prévu selon la formule :
 *
 *   effectifPrevu = effectifActuel
 *                  - sortantsPrevus (diplômés + transférés + abandonnés)
 *                  + candidaturesAdmises (statut ADMIS pour l'année cible)
 *                  + tauxRetention × effectifActuel (rétention historique)
 *
 * Identifie les classes sous-effectives (< 60 % de l'effectif max) et en
 * surcharge (> 100 % de l'effectif max).
 *
 * @param tenantId     Le tenant de l'appelant.
 * @param claims       Périmètre de l'appelant (isolation par site).
 * @param anneeCible   Libellé de l'année scolaire cible (ex: "2026-2027").
 *                     Par défaut : l'année suivante de l'année courante.
 */
export async function predireRemplissageClasses(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeCible?: string,
): Promise<PredictionRemplissage> {
  // 1. Déterminer l'année cible.
  //    Si non fournie, on prend l'année courante et on calcule la suivante.
  let anneeCibleFinale = anneeCible;
  if (!anneeCibleFinale) {
    const anneeCouranteLibelle = await anneeActiveLibelle(tenantId);
    if (anneeCouranteLibelle) {
      anneeCibleFinale = anneeSuivante(anneeCouranteLibelle) ?? anneeCouranteLibelle;
    } else {
      // Fallback : année courante calendaire (respecte la Time Machine).
      const now = await getDemoNow();
      const debut = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      anneeCibleFinale = `${debut + 1}-${debut + 2}`;
    }
  }

  // 2. Charger les classes actives du périmètre.
  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("classe", claims),
      deletedAt: null,
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      filiere: true,
      effectifMax: true,
      annee: true,
      siteId: true,
      eleves: {
        where: { deletedAt: null },
        select: {
          id: true,
          statut: true,
        },
      },
    },
  });

  if (classes.length === 0) {
    return {
      anneeCible: anneeCibleFinale,
      parClasse: [],
      classesSousEffectives: [],
      classesSurcharge: [],
      donneesInsuffisantes: true,
    };
  }

  // 3. Charger les noms des sites.
  const siteIds = Array.from(
    new Set(classes.map((c) => c.siteId).filter((id): id is string => id !== null)),
  );
  const sites =
    siteIds.length > 0
      ? await prisma.site.findMany({
          where: { id: { in: siteIds }, tenantId },
          select: { id: true, nom: true },
        })
      : [];
  const siteNomParId = new Map(sites.map((s) => [s.id, s.nom]));

  // 4. Charger les candidatures admises pour l'année cible.
  //    On récupère toutes les candidatures ADMIS et INSCRIT pour l'année cible,
  //    puis on les regroupe par classeVoulue (qui correspond au nom du niveau).
  const candidatures = await prisma.candidature.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("candidature", claims),
      statut: { in: ["ADMIS", "INSCRIT"] },
      annee: anneeCibleFinale,
    },
    select: {
      classeVoulue: true,
    },
  });

  // Indexer les candidatures par classeVoulue.
  const candidaturesParClasse = new Map<string, number>();
  for (const c of candidatures) {
    candidaturesParClasse.set(
      c.classeVoulue,
      (candidaturesParClasse.get(c.classeVoulue) ?? 0) + 1,
    );
  }

  // 5. Calculer le taux de rétention historique.
  //    On prend les parcours scolaires pour comparer les effectifs d'une année
  //    sur l'autre, par niveau. Le taux de rétention = effectifs année N+1 / effectifs année N
  //    pour le même niveau (approximation : les élèves qui restent dans le même niveau
  //    ou qui passent au niveau supérieur dans l'établissement).
  const parcours = await prisma.parcoursScolaire.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("parcoursScolaire", claims),
    },
    select: {
      eleveId: true,
      annee: true,
      niveau: true,
    },
  });

  // Calculer le taux de rétention par niveau : pour chaque niveau, comparer
  // le nombre d'élèves présents en année N et encore présents en N+1.
  const retentionParNiveau = new Map<string, { presents: number; retenus: number }>();

  // Indexer les parcours par année + niveau (cle: "annee|niveau" → set eleveId).
  const parcoursParAnneeNiveau = new Map<string, Set<string>>();

  for (const p of parcours) {
    const cleAnneeNiveau = `${p.annee}|${p.niveau}`;
    const setNiveau = parcoursParAnneeNiveau.get(cleAnneeNiveau) ?? new Set<string>();
    setNiveau.add(p.eleveId);
    parcoursParAnneeNiveau.set(cleAnneeNiveau, setNiveau);
  }

  // Pour chaque niveau, calculer le taux de rétention moyen sur les années disponibles.
  const anneesDisponibles = Array.from(
    new Set(parcours.map((p) => p.annee)),
  ).sort();

  // Indexer les eleveId par année pour une recherche O(1).
  const elevesParAnnee = new Map<string, Set<string>>();
  for (const p of parcours) {
    const set = elevesParAnnee.get(p.annee) ?? new Set<string>();
    set.add(p.eleveId);
    elevesParAnnee.set(p.annee, set);
  }

  for (let i = 0; i < anneesDisponibles.length - 1; i++) {
    const anneeN = anneesDisponibles[i];
    const anneeN1 = anneesDisponibles[i + 1];

    // Pour chaque niveau présent en année N, compter les élèves encore présents en N+1.
    const niveauxAnneeN = Array.from(
      new Set(
        parcours
          .filter((p) => p.annee === anneeN)
          .map((p) => p.niveau),
      ),
    );

    const elevesAnneeN1 = elevesParAnnee.get(anneeN1) ?? new Set<string>();

    for (const niveau of niveauxAnneeN) {
      const elevesN = parcoursParAnneeNiveau.get(`${anneeN}|${niveau}`);
      if (!elevesN) continue;

      // Compter combien de ces élèves sont encore présents en N+1 (tous niveaux confondus).
      let retenus = 0;
      for (const eleveId of elevesN) {
        if (elevesAnneeN1.has(eleveId)) retenus += 1;
      }

      const slot = retentionParNiveau.get(niveau) ?? { presents: 0, retenus: 0 };
      slot.presents += elevesN.size;
      slot.retenus += retenus;
      retentionParNiveau.set(niveau, slot);
    }
  }

  // 6. Calculer la prédiction pour chaque classe.
  const parClasse = classes.map((c) => {
    const effectifActuel = c.eleves.length;

    // Sortants prévus : élèves dont le statut indique une sortie.
    const sortantsPrevus = c.eleves.filter(
      (e) => e.statut === "DIPLOME" || e.statut === "TRANSFERE" || e.statut === "ABANDONNE" || e.statut === "EXCLU",
    ).length;

    // Candidatures admises pour cette classe.
    // On matche sur le nom de la classe ou le niveau.
    const candidaturesAdmises =
      (candidaturesParClasse.get(c.nom) ?? 0) +
      (candidaturesParClasse.get(c.niveau) ?? 0);

    // Taux de rétention historique pour ce niveau.
    const retention = retentionParNiveau.get(c.niveau);
    const tauxRetention = retention ? taux(retention.retenus, retention.presents) : null;

    // Effectif prévu.
    // Formule : effectifActuel - sortantsPrevus + candidaturesAdmises
    //           + (effectifActuel × tauxRetention) — mais pour éviter le double
    //           comptage des élèves qui restent, on utilise :
    //   effectifPrevu = (effectifActuel - sortantsPrevus) × (tauxRetention ?? 1) + candidaturesAdmises
    const effectifRestant = effectifActuel - sortantsPrevus;
    const effectifPrevu =
      Math.round(
        effectifRestant * (tauxRetention ?? 1) + candidaturesAdmises,
      );

    const tauxRemplissage = taux(effectifPrevu, c.effectifMax);
    const sousEffective = effectifPrevu < c.effectifMax * 0.6;
    const surcharge = effectifPrevu > c.effectifMax;

    return {
      classeId: c.id,
      classeNom: c.nom,
      niveau: c.niveau,
      siteId: c.siteId,
      siteNom: c.siteId !== null ? (siteNomParId.get(c.siteId) ?? null) : null,
      effectifActuel,
      effectifMax: c.effectifMax,
      sortantsPrevus,
      candidaturesAdmises,
      tauxRetention,
      effectifPrevu,
      sousEffective,
      surcharge,
      tauxRemplissage,
    };
  });

  // 7. Identifier les classes sous-effectives et en surcharge.
  const classesSousEffectives = parClasse
    .filter((c) => c.sousEffective)
    .map((c) => c.classeNom);
  const classesSurcharge = parClasse
    .filter((c) => c.surcharge)
    .map((c) => c.classeNom);

  return {
    anneeCible: anneeCibleFinale,
    parClasse,
    classesSousEffectives,
    classesSurcharge,
    donneesInsuffisantes: false,
  };
}
