/**
 * EcolPro / LEARNOS — Équité & Inclusion (I18 → I21)
 * ===================================================
 *
 * Ce module mesure l'équité éducative à quatre niveaux, sans aucun appel à
 * un modèle de langage — statistiques pures sur les données du tenant.
 *
 *  1. BESOINS SPÉCIAUX VS INTERVENTIONS (I18) — les élèves à besoins
 *     spéciaux reçoivent-ils au moins autant d'interventions pédagogiques
 *     que les autres ? Un ratio < 1 signale une sous-desserte.
 *
 *  2. ÉCART INTER-SITE CORRIGÉ PAR LES MOYENS (I19) — les sites avec le
 *     plus de moyens (budget/élève, ratio enseignants/élèves) obtiennent-
 *     ils les meilleurs résultats ? La corrélation de Pearson quantifie le
 *     lien ; la classification isole les sites sur-performants et
 *     sous-performants.
 *
 *  3. SOUS-REPRÉSENTATION DES FILLES EN EXCELLENCE (I20) — les filles
 *     reçoivent-elles proportionnellement autant de recommandations
 *     d'excellence et d'orientations scientifiques que les garçons ?
 *     Un ratio < 0,8 signale une sous-représentation.
 *
 *  4. INTERNES VS EXTERNES (I21) — compare les moyennes et la dispersion
 *     de maîtrise par régime (interne, demi-pensionnaire, externe), en
 *     contrôlant par niveau scolaire pour neutraliser l'effet structurel.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  resolveSiteScope,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Seuil en-deçà duquel on parle de sous-représentation des filles. */
const SEUIL_SOUS_REPRESENTATION_FILLES = 0.8;

/** Nombre minimum de sites pour qu'une corrélation de Pearson soit fiable. */
const MIN_SITES_CORRELATION = 3;

/** Régimes scolaires à comparer (I21). */
const REGIMES = ["interne", "demi-pensionnaire", "externe"] as const;

// ------------------------------------------------------------
// Types — Analyse 1 : Besoins spéciaux vs interventions (I18)
// ------------------------------------------------------------

export type StatutEquiteBesoins = "EQUILIBRE" | "SOUS_DESSERVIE" | "SUR_DESSERVIE";

export interface BesoinsSpeciauxInterventions {
  /** Nombre d'élèves actifs avec besoins spéciaux renseignés. */
  nbElevesAvecBesoin: number;
  /** Nombre d'élèves actifs sans besoins spéciaux. */
  nbElevesSansBesoin: number;
  /** Nombre total d'interventions pour les élèves à besoins spéciaux. */
  interventionsAvecBesoin: number;
  /** Nombre total d'interventions pour les élèves sans besoins spéciaux. */
  interventionsSansBesoin: number;
  /** Interventions par élève à besoins spéciaux (0 si aucun élève). */
  interventionsParEleveAvecBesoin: number;
  /** Interventions par élève sans besoins spéciaux (0 si aucun élève). */
  interventionsParEleveSansBesoin: number;
  /** Ratio = interventionsParEleveAvecBesoin / interventionsParEleveSansBesoin. */
  ratio: number;
  /** Classification automatique du ratio. */
  statut: StatutEquiteBesoins;
  /** `true` si aucune intervention n'a été enregistrée (analyse non concluante). */
  donneesInsuffisantes: boolean;
}

// ------------------------------------------------------------
// Types — Analyse 2 : Écart inter-site corrigé par les moyens (I19)
// ------------------------------------------------------------

export type ClassificationSite =
  | "SUR_PERFORMANT"
  | "SOUS_PERFORMANT"
  | "EQUILIBRE";

export interface SiteMoyensResultats {
  siteId: string;
  siteNom: string;
  /** Moyenne générale moyenne des bulletins du site (sur 20). */
  moyenneGenerale: number | null;
  /** Nombre d'élèves actifs rattachés au site. */
  nbEleves: number;
  /** Nombre d'enseignants rattachés au site (via EnseignantSite). */
  nbEnseignants: number;
  /** Ratio enseignants / élèves (0 si aucun élève). */
  ratioEnseignantsEleves: number;
  /** Total des dépenses du site. */
  totalDepenses: number;
  /** Budget par élève (0 si aucun élève). */
  budgetParEleve: number;
  /** Taux de couverture = dépenses / budget prévu (0 si aucun budget). */
  tauxCouverture: number;
  /** Classification du site selon moyens vs résultats. */
  classification: ClassificationSite;
}

export interface EquiteInterSite {
  sites: SiteMoyensResultats[];
  /** Corrélation de Pearson entre budget/élève et moyenne générale. */
  correlationBudgetMoyenne: number;
  /** Corrélation de Pearson entre ratio enseignants/élèves et moyenne générale. */
  correlationEnseignantsMoyenne: number;
  /** Nombre de sites sur-performants. */
  nbSurPerformant: number;
  /** Nombre de sites sous-performants. */
  nbSousPerformant: number;
  /** Nombre de sites à l'équilibre. */
  nbEquilibre: number;
  /** `true` si aucun site ou moins de `MIN_SITES_CORRELATION` sites avec moyenne. */
  donneesInsuffisantes: boolean;
}

// ------------------------------------------------------------
// Types — Analyse 3 : Sous-représentation des filles en excellence (I20)
// ------------------------------------------------------------

export interface ComptageGenre {
  filles: number;
  garcons: number;
  /** ratio = filles / garçons (0 si aucun garçon). */
  ratio: number;
}

export interface RepresentationGenre {
  /** Recommandations de niveau EXCELLENCE ou AVANCE, par sexe. */
  recommandationsExcellence: ComptageGenre;
  /** Parcours orientés en filière scientifique, par sexe. */
  orientationsScientifiques: ComptageGenre;
  /** `true` si le ratio filles/garçons < 0,8 sur au moins un des deux indicateurs. */
  sousRepresentation: boolean;
  /** `true` si aucune recommandation d'excellence ni orientation scientifique. */
  donneesInsuffisantes: boolean;
}

// ------------------------------------------------------------
// Types — Analyse 4 : Internes vs externes (I21)
// ------------------------------------------------------------

export interface ResultatRegime {
  regime: string;
  /** Nombre d'élèves dans ce régime. */
  nbEleves: number;
  /** Moyenne générale moyenne (sur 20), ou `null` si aucun bulletin. */
  moyenneGenerale: number | null;
  /** Écart-type des scores de maîtrise (StudentLearningProfile.masteryScore). */
  ecartTypeMastery: number;
  /** Détail par niveau scolaire (contrôle structurel). */
  parNiveau: {
    niveau: string;
    nbEleves: number;
    moyenneGenerale: number | null;
  }[];
}

export interface InternesExternes {
  regimes: ResultatRegime[];
  /** Régime avec la meilleure moyenne générale, ou `null` si indéterminable. */
  meilleurRegime: string | null;
  /** Écart absolu entre la meilleure et la pire moyenne de régime. */
  ecartMax: number;
  /** `true` si aucun élève actif avec régime renseigné. */
  donneesInsuffisantes: boolean;
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/**
 * Corrélation de Pearson entre deux séries numériques.
 * Retourne 0 si l'une des séries a moins de 2 éléments ou un écart-type nul.
 */
function correlationPearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let numerateur = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = x[i] - mx;
    const ey = y[i] - my;
    numerateur += ex * ey;
    dx += ex * ex;
    dy += ey * ey;
  }

  const denominateur = Math.sqrt(dx * dy);
  return denominateur === 0 ? 0 : numerateur / denominateur;
}

/** Écart-type populationnel d'une série de valeurs. */
function ecartType(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  const variance =
    valeurs.reduce((acc, v) => acc + (v - moyenne) ** 2, 0) / valeurs.length;
  return Math.sqrt(variance);
}

/** Médiane d'une série numérique (0 si vide). */
function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const trie = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(trie.length / 2);
  return trie.length % 2 === 0
    ? (trie[milieu - 1] + trie[milieu]) / 2
    : trie[milieu];
}

/**
 * Filtre de site pour les modèles `Depense` et `Budget` qui ne sont pas
 * référencés dans `SITE_PATHS`. On résout le périmètre manuellement et on
 * filtre par `siteId` directement.
 *
 * - `ALL` / `RELATION` → pas de filtre (tout le tenant).
 * - `SITES` → `siteId IN (...)`.
 * - `NONE` → prédicat toujours faux.
 */
function filtreSiteColumn(
  scope: ReturnType<typeof resolveSiteScope>
): Record<string, unknown> {
  if (scope.kind === "SITES") {
    return { siteId: { in: scope.siteIds } };
  }
  if (scope.kind === "NONE") {
    return { AND: [{ id: "__ecolpro_no_site_access__" }] };
  }
  return {};
}

// ------------------------------------------------------------
// Analyse 1 — Besoins spéciaux vs interventions (I18)
// ------------------------------------------------------------

/**
 * Compare le nombre d'interventions pédagogiques reçues par les élèves à
 * besoins spéciaux vs ceux sans besoins.
 *
 * Un ratio < 1 indique que les élèves à besoins spéciaux reçoivent en
 * moyenne MOINS d'interventions que les autres — un signal d'alerte
 * d'iniquité.
 */
export async function analyserBesoinsSpeciauxInterventions(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<BesoinsSpeciauxInterventions> {
  // --- 1. Séparation des élèves selon la présence de besoins spéciaux ---
  const [elevesAvecBesoin, elevesSansBesoin] = await Promise.all([
    prisma.eleve.findMany({
      where: {
        tenantId,
        deletedAt: null,
        besoinsSpeciaux: { not: null, notIn: [""] },
        ...siteFilterForModel("eleve", claims),
      },
      select: { id: true },
    }),
    prisma.eleve.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ besoinsSpeciaux: null }, { besoinsSpeciaux: "" }],
        ...siteFilterForModel("eleve", claims),
      },
      select: { id: true },
    }),
  ]);

  const idsAvecBesoin = elevesAvecBesoin.map((e) => e.id);
  const idsSansBesoin = elevesSansBesoin.map((e) => e.id);

  // --- 2. Comptage des interventions par groupe (un seul aller-retour) ---
  const [interventionsAvec, interventionsSans] = await Promise.all([
    idsAvecBesoin.length > 0
      ? prisma.studentIntervention.groupBy({
          by: ["eleveId"],
          where: {
            tenantId,
            eleveId: { in: idsAvecBesoin },
            ...siteFilterForModel("studentIntervention", claims),
          },
          _count: { eleveId: true },
        })
      : Promise.resolve([]),
    idsSansBesoin.length > 0
      ? prisma.studentIntervention.groupBy({
          by: ["eleveId"],
          where: {
            tenantId,
            eleveId: { in: idsSansBesoin },
            ...siteFilterForModel("studentIntervention", claims),
          },
          _count: { eleveId: true },
        })
      : Promise.resolve([]),
  ]);

  const totalAvec = interventionsAvec.reduce(
    (acc, l) => acc + l._count.eleveId,
    0
  );
  const totalSans = interventionsSans.reduce(
    (acc, l) => acc + l._count.eleveId,
    0
  );

  const parEleveAvec =
    elevesAvecBesoin.length > 0 ? totalAvec / elevesAvecBesoin.length : 0;
  const parEleveSans =
    elevesSansBesoin.length > 0 ? totalSans / elevesSansBesoin.length : 0;

  // --- 3. Ratio et classification ---
  const ratio =
    parEleveSans > 0 ? parEleveAvec / parEleveSans : parEleveAvec > 0 ? Infinity : 1;

  let statut: StatutEquiteBesoins = "EQUILIBRE";
  if (parEleveSans === 0 && parEleveAvec === 0) {
    // Aucune intervention nulle part — on ne peut pas conclure.
    statut = "EQUILIBRE";
  } else if (ratio < 1) {
    statut = "SOUS_DESSERVIE";
  } else if (ratio > 1.2) {
    statut = "SUR_DESSERVIE";
  }

  return {
    nbElevesAvecBesoin: elevesAvecBesoin.length,
    nbElevesSansBesoin: elevesSansBesoin.length,
    interventionsAvecBesoin: totalAvec,
    interventionsSansBesoin: totalSans,
    interventionsParEleveAvecBesoin: Math.round(parEleveAvec * 100) / 100,
    interventionsParEleveSansBesoin: Math.round(parEleveSans * 100) / 100,
    ratio: ratio === Infinity ? -1 : Math.round(ratio * 100) / 100,
    statut,
    donneesInsuffisantes: totalAvec === 0 && totalSans === 0,
  };
}

// ------------------------------------------------------------
// Analyse 2 — Écart inter-site corrigé par les moyens (I19)
// ------------------------------------------------------------

/**
 * Compare les sites du tenant sur deux axes : les moyens (budget/élève,
 * ratio enseignants/élèves, taux de couverture budgétaire) et les résultats
 * (moyenne générale des bulletins).
 *
 * Calcule la corrélation de Pearson entre moyens et résultats, puis
 * classifie chaque site :
 *  - SUR_PERFORMANT : bons résultats avec des moyens limités.
 *  - SOUS_PERFORMANT : moyens élevés mais résultats faibles.
 *  - EQUILIBRE : le reste.
 *
 * Si moins de 3 sites, la corrélation est fixée à 0 (non fiable).
 */
export async function analyserEquiteInterSite(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<EquiteInterSite> {
  const scope = resolveSiteScope(claims);
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // --- 1. Sites du tenant (filtrés par périmètre) ---
  const sites = await prisma.site.findMany({
    where: {
      tenantId,
      actif: true,
      ...(scope.kind === "SITES" ? { id: { in: scope.siteIds } } : {}),
      ...(scope.kind === "NONE" ? { AND: [{ id: "__ecolpro_no_site_access__" }] } : {}),
    },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  if (sites.length === 0) {
    return {
      sites: [],
      correlationBudgetMoyenne: 0,
      correlationEnseignantsMoyenne: 0,
      nbSurPerformant: 0,
      nbSousPerformant: 0,
      nbEquilibre: 0,
      donneesInsuffisantes: true,
    };
  }

  const siteIds = sites.map((s) => s.id);
  const filtreSite = filtreSiteColumn(scope);

  // --- 2. Données agrégées en batch ---
  const [elevesParSite, enseignantsParSite, depensesParSite, budgetsParSite, bulletins] =
    await Promise.all([
      // Nombre d'élèves actifs par site
      prisma.eleve.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          deletedAt: null,
          statut: "ACTIF",
          siteId: { in: siteIds },
          ...siteFilterForModel("eleve", claims),
        },
        _count: { id: true },
      }),
      // Nombre d'enseignants par site (via EnseignantSite)
      prisma.enseignantSite.groupBy({
        by: ["siteId"],
        where: {
          siteId: { in: siteIds },
          enseignant: { tenantId },
          ...siteFilterForModel("enseignantSite", claims),
        },
        _count: { enseignantId: true },
      }),
      // Total des dépenses par site
      prisma.depense.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          ...filtreSite,
          ...siteFilterForModel("depense", claims),
        },
        _sum: { montant: true },
      }),
      // Budgets par site (prévu + dépensé)
      prisma.budget.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          ...filtreSite,
          ...siteFilterForModel("budget", claims),
        },
        _sum: { montantPrevu: true, montantDepense: true },
      }),
      // Bulletins avec moyenne générale, joints à l'élève pour le site.
      // Le filtre de site du bulletin passe par l'élève (path { one: "eleve" }),
      // on l'applique donc sur la relation eleve plutôt que sur le bulletin.
      prisma.bulletin.findMany({
        where: {
          tenantId,
          ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}),
          ...siteFilterForModel("bulletin", claims),
          eleve: {
            deletedAt: null,
            siteId: { in: siteIds },
            ...siteFilterForModel("eleve", claims),
          },
        },
        select: {
          moyenneGenerale: true,
          eleve: { select: { siteId: true } },
        },
      }),
    ]);

  // --- 3. Indexation par site ---
  const nbElevesMap = new Map<string, number>();
  for (const l of elevesParSite) {
    if (l.siteId) nbElevesMap.set(l.siteId, l._count.id);
  }

  const nbEnseignantsMap = new Map<string, number>();
  for (const l of enseignantsParSite) {
    nbEnseignantsMap.set(l.siteId, l._count.enseignantId);
  }

  const totalDepensesMap = new Map<string, number>();
  for (const l of depensesParSite) {
    if (l.siteId) totalDepensesMap.set(l.siteId, l._sum.montant ?? 0);
  }

  const budgetMap = new Map<string, { prevu: number; depense: number }>();
  for (const l of budgetsParSite) {
    if (l.siteId) {
      budgetMap.set(l.siteId, {
        prevu: l._sum.montantPrevu ?? 0,
        depense: l._sum.montantDepense ?? 0,
      });
    }
  }

  // Moyennes des bulletins par site
  const moyennesParSite = new Map<string, number[]>();
  for (const b of bulletins) {
    const sid = b.eleve.siteId;
    if (!sid || b.moyenneGenerale == null) continue;
    if (!moyennesParSite.has(sid)) moyennesParSite.set(sid, []);
    moyennesParSite.get(sid)!.push(b.moyenneGenerale);
  }

  // --- 4. Construction des résultats par site ---
  const sitesResultats: SiteMoyensResultats[] = sites.map((s) => {
    const nbEleves = nbElevesMap.get(s.id) ?? 0;
    const nbEnseignants = nbEnseignantsMap.get(s.id) ?? 0;
    const totalDepenses = totalDepensesMap.get(s.id) ?? 0;
    const budget = budgetMap.get(s.id);

    const moyennes = moyennesParSite.get(s.id) ?? [];
    const moyenneGenerale =
      moyennes.length > 0
        ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length
        : null;

    const ratioEnseignantsEleves = nbEleves > 0 ? nbEnseignants / nbEleves : 0;
    const budgetParEleve = nbEleves > 0 ? totalDepenses / nbEleves : 0;
    const tauxCouverture =
      budget && budget.prevu > 0 ? budget.depense / budget.prevu : 0;

    return {
      siteId: s.id,
      siteNom: s.nom,
      moyenneGenerale:
        moyenneGenerale != null
          ? Math.round(moyenneGenerale * 100) / 100
          : null,
      nbEleves,
      nbEnseignants,
      ratioEnseignantsEleves: Math.round(ratioEnseignantsEleves * 1000) / 1000,
      totalDepenses: Math.round(totalDepenses * 100) / 100,
      budgetParEleve: Math.round(budgetParEleve * 100) / 100,
      tauxCouverture: Math.round(tauxCouverture * 100) / 100,
      classification: "EQUILIBRE" as ClassificationSite,
    };
  });

  // --- 5. Classification par médiane ---
  const sitesAvecMoyenne = sitesResultats.filter(
    (s) => s.moyenneGenerale != null
  );
  const medianeMoyenne = mediane(
    sitesAvecMoyenne.map((s) => s.moyenneGenerale!)
  );
  const medianeBudget = mediane(
    sitesResultats.map((s) => s.budgetParEleve)
  );

  for (const s of sitesResultats) {
    if (s.moyenneGenerale == null) {
      s.classification = "EQUILIBRE";
      continue;
    }
    const bonsResultats = s.moyenneGenerale >= medianeMoyenne;
    const moyensLimites = s.budgetParEleve <= medianeBudget;
    const moyensEleves = s.budgetParEleve > medianeBudget;
    const resultatsFaibles = s.moyenneGenerale < medianeMoyenne;

    if (bonsResultats && moyensLimites) {
      s.classification = "SUR_PERFORMANT";
    } else if (resultatsFaibles && moyensEleves) {
      s.classification = "SOUS_PERFORMANT";
    } else {
      s.classification = "EQUILIBRE";
    }
  }

  // --- 6. Corrélations de Pearson ---
  let correlationBudgetMoyenne = 0;
  let correlationEnseignantsMoyenne = 0;

  if (sitesAvecMoyenne.length >= MIN_SITES_CORRELATION) {
    const xBudget = sitesAvecMoyenne.map((s) => s.budgetParEleve);
    const xEnseignants = sitesAvecMoyenne.map((s) => s.ratioEnseignantsEleves);
    const yMoyenne = sitesAvecMoyenne.map((s) => s.moyenneGenerale!);

    correlationBudgetMoyenne = correlationPearson(xBudget, yMoyenne);
    correlationEnseignantsMoyenne = correlationPearson(xEnseignants, yMoyenne);
  }

  return {
    sites: sitesResultats,
    correlationBudgetMoyenne: Math.round(correlationBudgetMoyenne * 1000) / 1000,
    correlationEnseignantsMoyenne:
      Math.round(correlationEnseignantsMoyenne * 1000) / 1000,
    nbSurPerformant: sitesResultats.filter((s) => s.classification === "SUR_PERFORMANT").length,
    nbSousPerformant: sitesResultats.filter((s) => s.classification === "SOUS_PERFORMANT").length,
    nbEquilibre: sitesResultats.filter((s) => s.classification === "EQUILIBRE").length,
    donneesInsuffisantes: sitesAvecMoyenne.length < MIN_SITES_CORRELATION,
  };
}

// ------------------------------------------------------------
// Analyse 3 — Sous-représentation des filles en excellence (I20)
// ------------------------------------------------------------

/**
 * Mesure la parité dans les recommandations d'excellence et les orientations
 * vers la filière scientifique.
 *
 * Le ratio filles/garçons est calculé pour deux indicateurs :
 *  1. Les recommandations de niveau EXCELLENCE ou AVANCE.
 *  2. Les parcours orientés en FILIERE_SCIENTIFIQUE.
 *
 * Un ratio < 0,8 sur au moins un indicateur signale une sous-représentation
 * des filles.
 */
export async function analyserRepresentationGenre(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<RepresentationGenre> {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // --- 1. Recommandations d'excellence / avancé, par sexe ---
  const recosExcellence = await prisma.recommandation.findMany({
    where: {
      tenantId,
      niveau: { in: ["EXCELLENCE", "AVANCE"] },
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      ...siteFilterForModel("recommandation", claims),
    },
    select: {
      eleve: { select: { sexe: true } },
    },
  });

  let fillesExcellence = 0;
  let garconsExcellence = 0;
  for (const r of recosExcellence) {
    if (r.eleve.sexe === "F") fillesExcellence++;
    else garconsExcellence++;
  }

  // --- 2. Orientations en filière scientifique, par sexe ---
  const parcoursScientifique = await prisma.parcoursScolaire.findMany({
    where: {
      tenantId,
      recommandation: "FILIERE_SCIENTIFIQUE",
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
      ...siteFilterForModel("parcoursScolaire", claims),
    },
    select: {
      eleve: { select: { sexe: true } },
    },
  });

  let fillesScientifique = 0;
  let garconsScientifique = 0;
  for (const p of parcoursScientifique) {
    if (p.eleve.sexe === "F") fillesScientifique++;
    else garconsScientifique++;
  }

  // --- 3. Ratios et conclusion ---
  const ratioExcellence =
    garconsExcellence > 0 ? fillesExcellence / garconsExcellence : fillesExcellence > 0 ? Infinity : 1;
  const ratioScientifique =
    garconsScientifique > 0
      ? fillesScientifique / garconsScientifique
      : fillesScientifique > 0
        ? Infinity
        : 1;

  const ratioExcellenceNum = ratioExcellence === Infinity ? -1 : ratioExcellence;
  const ratioScientifiqueNum = ratioScientifique === Infinity ? -1 : ratioScientifique;

  const sousRepresentation =
    (ratioExcellenceNum >= 0 && ratioExcellenceNum < SEUIL_SOUS_REPRESENTATION_FILLES) ||
    (ratioScientifiqueNum >= 0 && ratioScientifiqueNum < SEUIL_SOUS_REPRESENTATION_FILLES);

  return {
    recommandationsExcellence: {
      filles: fillesExcellence,
      garcons: garconsExcellence,
      ratio: Math.round(ratioExcellenceNum * 100) / 100,
    },
    orientationsScientifiques: {
      filles: fillesScientifique,
      garcons: garconsScientifique,
      ratio: Math.round(ratioScientifiqueNum * 100) / 100,
    },
    sousRepresentation,
    donneesInsuffisantes:
      fillesExcellence + garconsExcellence === 0 &&
      fillesScientifique + garconsScientifique === 0,
  };
}

// ------------------------------------------------------------
// Analyse 4 — Internes vs externes (I21)
// ------------------------------------------------------------

/**
 * Compare les résultats scolaires et la dispersion de maîtrise entre les
 * trois régimes (interne, demi-pensionnaire, externe).
 *
 * Les moyennes sont calculées globalement ET par niveau scolaire (via la
 * classe de l'élève) pour neutraliser l'effet structurel : un niveau où
 * les internes sont majoritaires peut fausser la comparaison brute.
 *
 * L'écart-type des scores de maîtrise (StudentLearningProfile.masteryScore)
 * mesure l'homogénéité du régime : un écart-type élevé signale une grande
 * disparité de niveaux au sein du régime.
 */
export async function comparerInternesExternes(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<InternesExternes> {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // --- 1. Élèves actifs avec leur régime et leur niveau (via classe) ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      regime: { not: null },
      ...siteFilterForModel("eleve", claims),
    },
    select: {
      id: true,
      regime: true,
      classe: { select: { niveau: true } },
    },
  });

  if (eleves.length === 0) {
    return { regimes: [], meilleurRegime: null, ecartMax: 0, donneesInsuffisantes: true };
  }

  const eleveIds = eleves.map((e) => e.id);

  // Indexation : élève → régime, élève → niveau
  const regimeParEleve = new Map<string, string>();
  const niveauParEleve = new Map<string, string>();
  for (const e of eleves) {
    regimeParEleve.set(e.id, e.regime ?? "externe");
    niveauParEleve.set(e.id, e.classe?.niveau ?? "Inconnu");
  }

  // --- 2. Bulletins et profils de maîtrise en batch ---
  const [bulletins, profilsMastery] = await Promise.all([
    prisma.bulletin.findMany({
      where: {
        tenantId,
        eleveId: { in: eleveIds },
        ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}),
        ...siteFilterForModel("bulletin", claims),
      },
      select: {
        eleveId: true,
        moyenneGenerale: true,
      },
    }),
    prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId: { in: eleveIds },
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      select: {
        eleveId: true,
        masteryScore: true,
      },
    }),
  ]);

  // --- 3. Agrégation par régime ---
  // Moyennes générales par régime et par (régime, niveau)
  const moyennesParRegime = new Map<string, number[]>();
  const moyennesParRegimeNiveau = new Map<string, Map<string, number[]>>();
  const masteryParRegime = new Map<string, number[]>();

  for (const b of bulletins) {
    if (b.moyenneGenerale == null) continue;
    const regime = regimeParEleve.get(b.eleveId);
    if (!regime) continue;

    if (!moyennesParRegime.has(regime)) moyennesParRegime.set(regime, []);
    moyennesParRegime.get(regime)!.push(b.moyenneGenerale);

    const niveau = niveauParEleve.get(b.eleveId) ?? "Inconnu";
    if (!moyennesParRegimeNiveau.has(regime)) {
      moyennesParRegimeNiveau.set(regime, new Map());
    }
    const parNiveau = moyennesParRegimeNiveau.get(regime)!;
    if (!parNiveau.has(niveau)) parNiveau.set(niveau, []);
    parNiveau.get(niveau)!.push(b.moyenneGenerale);
  }

  for (const p of profilsMastery) {
    const regime = regimeParEleve.get(p.eleveId);
    if (!regime) continue;
    if (!masteryParRegime.has(regime)) masteryParRegime.set(regime, []);
    masteryParRegime.get(regime)!.push(p.masteryScore);
  }

  // Comptage d'élèves par régime
  const nbElevesParRegime = new Map<string, number>();
  for (const e of eleves) {
    const regime = e.regime ?? "externe";
    nbElevesParRegime.set(regime, (nbElevesParRegime.get(regime) ?? 0) + 1);
  }

  // --- 4. Construction des résultats par régime ---
  const regimes: ResultatRegime[] = REGIMES.map((regime) => {
    const moyennes = moyennesParRegime.get(regime) ?? [];
    const mastery = masteryParRegime.get(regime) ?? [];
    const nbEleves = nbElevesParRegime.get(regime) ?? 0;

    const moyenneGenerale =
      moyennes.length > 0
        ? moyennes.reduce((a, b) => a + b, 0) / moyennes.length
        : null;

    // Détail par niveau
    const parNiveauMap = moyennesParRegimeNiveau.get(regime) ?? new Map<string, number[]>();
    const parNiveau = Array.from(parNiveauMap.entries())
      .map(([niveau, vals]) => ({
        niveau,
        nbEleves: vals.length,
        moyenneGenerale: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      }))
      .sort((a, b) => a.niveau.localeCompare(b.niveau));

    return {
      regime,
      nbEleves,
      moyenneGenerale:
        moyenneGenerale != null ? Math.round(moyenneGenerale * 100) / 100 : null,
      ecartTypeMastery: Math.round(ecartType(mastery) * 1000) / 1000,
      parNiveau,
    };
  }).filter((r) => r.nbEleves > 0);

  // --- 5. Meilleur régime et écart maximal ---
  const regimesAvecMoyenne = regimes.filter((r) => r.moyenneGenerale != null);
  let meilleurRegime: string | null = null;
  let ecartMax = 0;

  if (regimesAvecMoyenne.length > 0) {
    const trie = [...regimesAvecMoyenne].sort(
      (a, b) => (b.moyenneGenerale ?? 0) - (a.moyenneGenerale ?? 0)
    );
    meilleurRegime = trie[0].regime;
    const meilleure = trie[0].moyenneGenerale ?? 0;
    const pire = trie[trie.length - 1].moyenneGenerale ?? 0;
    ecartMax = Math.round((meilleure - pire) * 100) / 100;
  }

  return { regimes, meilleurRegime, ecartMax, donneesInsuffisantes: false };
}
