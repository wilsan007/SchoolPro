/**
 * EcolPro / LEARNOS — Intelligence financière : sept analyses déterministes
 * ========================================================================
 *
 * Ce module regroupe les analyses financières demandées par la direction pour
 * piloter le recouvrement, la masse salariale, le respect des budgets et
 * l'efficacité des relances. Aucune analyse n'en appelle à un modèle de
 * langage : tout est calculé à partir des données Prisma existantes.
 *
 *  A25 — Probabilité de non-paiement par famille
 *  A26 — Coût par élève (masse salariale + dépenses / effectif actif)
 *  A27 — Dépassements budgétaires par catégorie
 *  A28 — Efficacité des relances par canal (sms, whatsapp, email, courrier)
 *  A29 — Délai moyen de paiement après échéance
 *  A30 — Taux d'admission des candidatures par classe voulue
 *  I5  — Contre-factuel des remises (délai de paiement avec vs sans remise)
 *
 * RÈGLES
 *  - Chaque requête Prisma inclut `tenantId` et `siteFilterForModel()`.
 *  - Les scores vont de 0 (risque nul / excellent) à 100 (risque maximal).
 *  - Une donnée manquante ne produit pas un faux 0 : les fonctions renvoient
 *    un drapeau `donneesInsuffisantes` quand l'échantillon est vide.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Borner une valeur dans [0, max]. */
function clamp(v: number, max = 100): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(max, Math.max(0, v));
}

/** Médiane d'un tableau de nombres (tri sur une copie). */
function mediane(values: number[]): number | null {
  if (values.length === 0) return null;
  const tri = [...values].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 === 0
    ? (tri[milieu - 1] + tri[milieu]) / 2
    : tri[milieu];
}

/** Moyenne d'un tableau de nombres, `null` si vide. */
function moyenne(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Différence en jours entre deux dates (b - a). */
function differenceEnJours(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ============================================================
// A25 — PROBABILITÉ DE NON-PAIEMENT PAR FAMILLE
// ============================================================

/**
 * Score de risque de non-paiement pour une famille (groupe de parents).
 *
 * Composition (total 100) :
 *  - 40 % : nombre de retards passés (échéances en retard ou factures EN_RETARD)
 *  - 25 % : nombre de relances reçues
 *  - 20 % : niveau de relance maximal atteint (1, 2, 3…)
 *  - 15 % : ratio impayés / total factures
 */
export interface RisqueFamille {
  /** Identifiant du parent (chef de famille). */
  parentId: string;
  /** Nom du parent. */
  nom: string;
  /** Prénom du parent. */
  prenom: string;
  /** Score de risque 0-100 (100 = risque maximal de non-paiement). */
  score: number;
  /** Nombre de retards passés (factures en retard + échéances en retard). */
  nbRetards: number;
  /** Nombre total de relances reçues. */
  nbRelances: number;
  /** Niveau de relance maximal (1, 2, 3…). */
  niveauRelanceMax: number;
  /** Ratio impayés / total factures (0-1). */
  ratioImpayes: number;
  /** Nombre d'élèves rattachés à cette famille. */
  nbEleves: number;
  /** `true` si aucune facture n'existe pour cette famille. */
  donneesInsuffisantes: boolean;
}

/**
 * Calcule le risque de non-paiement pour chaque famille du tenant (filtré
 * par site). Une « famille » est définie par un parent et l'ensemble des
 * élèves qui lui sont rattachés via `EleveParent`.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function calculerRisqueFamilles(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<RisqueFamille[]> {
  // 1. Charger tous les parents du périmètre.
  const parents = await prisma.parent.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("parent", claims),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      enfants: { select: { eleveId: true } },
    },
  });

  if (parents.length === 0) return [];

  // 2. Pour chaque parent, rassembler les élèves et calculer le score.
  const resultats: RisqueFamille[] = [];

  for (const parent of parents) {
    const eleveIds = parent.enfants.map((e) => e.eleveId);
    if (eleveIds.length === 0) continue;

    // Factures des élèves de cette famille.
    const factures = await prisma.facture.findMany({
      where: {
        tenantId,
        eleveId: { in: eleveIds },
        statut: { not: "ANNULEE" },
        ...siteFilterForModel("facture", claims),
      },
      select: {
        id: true,
        statut: true,
        montant: true,
        echeance: true,
        paiements: { select: { montant: true } },
        relances: { select: { niveau: true } },
      },
    });

    if (factures.length === 0) {
      resultats.push({
        parentId: parent.id,
        nom: parent.nom,
        prenom: parent.prenom,
        score: 0,
        nbRetards: 0,
        nbRelances: 0,
        niveauRelanceMax: 0,
        ratioImpayes: 0,
        nbEleves: eleveIds.length,
        donneesInsuffisantes: true,
      });
      continue;
    }

    // --- Composante 1 : retards passés (40 %) ---
    // Une facture EN_RETARD compte pour 1. Une échéance en retard (statut
    // EN_RETARD sur EcheancePaiement) compte aussi, mais on se contente
    // ici du statut de la facture pour rester sur une seule requête.
    const nbRetards = factures.filter((f) => f.statut === "EN_RETARD").length;
    // Normalisation : on plafonne à 10 retards → score 40.
    const scoreRetards = clamp((nbRetards / 10) * 40, 40);

    // --- Composante 2 : nombre de relances (25 %) ---
    const toutesRelances = factures.flatMap((f) => f.relances);
    const nbRelances = toutesRelances.length;
    // Plafond à 15 relances → score 25.
    const scoreRelances = clamp((nbRelances / 15) * 25, 25);

    // --- Composante 3 : niveau de relance maximal (20 %) ---
    const niveauRelanceMax = toutesRelances.reduce(
      (max, r) => Math.max(max, r.niveau),
      0,
    );
    // Niveau 3+ → score 20.
    const scoreNiveau = clamp((niveauRelanceMax / 3) * 20, 20);

    // --- Composante 4 : ratio impayés / total (15 %) ---
    const totalFacture = factures.reduce((acc, f) => acc + f.montant, 0);
    const totalPaye = factures.reduce(
      (acc, f) => acc + f.paiements.reduce((s, p) => s + p.montant, 0),
      0,
    );
    const ratioImpayes =
      totalFacture > 0 ? 1 - totalPaye / totalFacture : 0;
    const scoreRatio = clamp(ratioImpayes * 15, 15);

    const score = clamp(
      scoreRetards + scoreRelances + scoreNiveau + scoreRatio,
      100,
    );

    resultats.push({
      parentId: parent.id,
      nom: parent.nom,
      prenom: parent.prenom,
      score: Math.round(score * 10) / 10,
      nbRetards,
      nbRelances,
      niveauRelanceMax,
      ratioImpayes: Math.round(ratioImpayes * 100) / 100,
      nbEleves: eleveIds.length,
      donneesInsuffisantes: false,
    });
  }

  // 3. Trier par score décroissant (les plus à risque en premier).
  return resultats.sort((a, b) => b.score - a.score);
}

// ============================================================
// A26 — COÛT PAR ÉLÈVE
// ============================================================

/**
 * Coût total par élève actif pour une année scolaire.
 *
 * Formule : (SUM(FicheRH.salaireBase * 12) + SUM(Depense.montant)) / COUNT(Élève ACTIF)
 */
export interface CoutParEleve {
  /** Année scolaire analysée (ex. "2025-2026"). */
  annee: string;
  /** Coût total par élève actif. */
  coutParEleve: number;
  /** Masse salariale annuelle totale (salaireBase * 12). */
  masseSalariale: number;
  /** Total des dépenses de l'année. */
  totalDepenses: number;
  /** Nombre d'élèves actifs. */
  nbElevesActifs: number;
  /** Coût par élève de l'année précédente (pour la tendance), ou `null`. */
  coutAnneePrecedente: number | null;
  /** Variation en % par rapport à l'année précédente (positif = hausse). */
  tendancePourcent: number | null;
  /** Devise. */
  devise: string;
  /** `true` si aucun élève actif. */
  donneesInsuffisantes: boolean;
}

/**
 * Calcule le coût par élève pour une année donnée et la tendance vs l'année
 * précédente.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 * @param annee     Année scolaire (ex. "2025-2026"). Si omis, année en cours.
 */
export async function calculerCoutParEleve(
  tenantId: string,
  claims: SessionSiteClaims,
  annee?: string,
  maintenant: Date = new Date(),
): Promise<CoutParEleve> {
  // 1. Résoudre l'année à analyser.
  let anneeAnalysee = annee;
  if (!anneeAnalysee) {
    const anneeCourante = await prisma.anneesScolaires.findFirst({
      where: { tenantId, isCurrent: true },
      select: { libelle: true },
    });
    anneeAnalysee = anneeCourante?.libelle ?? undefined;
  }

  if (!anneeAnalysee) {
    return {
      annee: annee ?? "",
      coutParEleve: 0,
      masseSalariale: 0,
      totalDepenses: 0,
      nbElevesActifs: 0,
      coutAnneePrecedente: null,
      tendancePourcent: null,
      devise: "DJF",
      donneesInsuffisantes: true,
    };
  }

  // 2. Masse salariale : SUM(FicheRH.salaireBase * 12).
  //    On ne somme que les fiches RH dont l'enseignant est actif (pas de
  //    date de sortie ou date de sortie dans le futur).
  const fichesRH = await prisma.ficheRH.findMany({
    where: {
      tenantId,
      OR: [{ dateSortie: null }, { dateSortie: { gte: maintenant } }],
      ...siteFilterForModel("ficheRH", claims),
    },
    select: { salaireBase: true },
  });
  const masseSalariale = fichesRH.reduce(
    (acc, f) => acc + (f.salaireBase ?? 0) * 12,
    0,
  );

  // 3. Total des dépenses de l'année.
  //    Les dépenses portent un champ `date` ; on filtre sur l'année civile
  //    contenue dans le libellé (ex. "2025-2026" → 2025 et 2026).
  const annees = anneeAnalysee.split("-");
  const anneeDebut = parseInt(annees[0], 10);
  const anneeFin = anneeDebut + 1;
  const dateDebutAnnee = new Date(`${anneeDebut}-08-01T00:00:00Z`);
  const dateFinAnnee = new Date(`${anneeFin}-08-01T00:00:00Z`);

  const depenses = await prisma.depense.findMany({
    where: {
      tenantId,
      date: { gte: dateDebutAnnee, lt: dateFinAnnee },
      ...siteFilterForModel("depense", claims),
    },
    select: { montant: true, devise: true },
  });
  const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0);

  // 4. Nombre d'élèves actifs.
  const nbElevesActifs = await prisma.eleve.count({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
  });

  // 5. Coût par élève.
  const coutTotal = masseSalariale + totalDepenses;
  const coutParEleve = nbElevesActifs > 0 ? coutTotal / nbElevesActifs : 0;

  // 6. Tendance : année précédente.
  const anneePrecedenteLibelle = `${anneeDebut - 1}-${anneeDebut}`;
  const coutAnneePrecedente = await calculerCoutBrutAnnee(
    tenantId,
    claims,
    anneePrecedenteLibelle,
  );

  const tendancePourcent =
    coutAnneePrecedente !== null && coutAnneePrecedente > 0
      ? ((coutParEleve - coutAnneePrecedente) / coutAnneePrecedente) * 100
      : null;

  return {
    annee: anneeAnalysee,
    coutParEleve: Math.round(coutParEleve * 100) / 100,
    masseSalariale: Math.round(masseSalariale * 100) / 100,
    totalDepenses: Math.round(totalDepenses * 100) / 100,
    nbElevesActifs,
    coutAnneePrecedente:
      coutAnneePrecedente !== null
        ? Math.round(coutAnneePrecedente * 100) / 100
        : null,
    tendancePourcent:
      tendancePourcent !== null
        ? Math.round(tendancePourcent * 10) / 10
        : null,
    devise: depenses[0]?.devise ?? "DJF",
    donneesInsuffisantes: nbElevesActifs === 0,
  };
}

/**
 * Calcule uniquement le coût par élève brut pour une année donnée
 * (utilisé pour la tendance). Renvoie `null` si pas d'élèves.
 */
async function calculerCoutBrutAnnee(
  tenantId: string,
  claims: SessionSiteClaims,
  annee: string,
): Promise<number | null> {
  const annees = annee.split("-");
  const anneeDebut = parseInt(annees[0], 10);
  const anneeFin = anneeDebut + 1;
  const dateDebutAnnee = new Date(`${anneeDebut}-08-01T00:00:00Z`);
  const dateFinAnnee = new Date(`${anneeFin}-08-01T00:00:00Z`);

  const fichesRH = await prisma.ficheRH.findMany({
    where: {
      tenantId,
      OR: [
        { dateSortie: null },
        { dateSortie: { gte: dateFinAnnee } },
      ],
      ...siteFilterForModel("ficheRH", claims),
    },
    select: { salaireBase: true },
  });
  const masseSalariale = fichesRH.reduce(
    (acc, f) => acc + (f.salaireBase ?? 0) * 12,
    0,
  );

  const depenses = await prisma.depense.findMany({
    where: {
      tenantId,
      date: { gte: dateDebutAnnee, lt: dateFinAnnee },
      ...siteFilterForModel("depense", claims),
    },
    select: { montant: true },
  });
  const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0);

  const nbEleves = await prisma.eleve.count({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
  });

  if (nbEleves === 0) return null;
  return (masseSalariale + totalDepenses) / nbEleves;
}

// ============================================================
// A27 — DÉPASSEMENTS BUDGÉTAIRES
// ============================================================

/**
 * Analyse des dépassements budgétaires par catégorie pour une année.
 */
export interface DepassementBudget {
  /** Catégorie budgétaire. */
  categorie: string;
  /** Année scolaire. */
  annee: string;
  /** Montant prévu. */
  montantPrevu: number;
  /** Montant dépensé. */
  montantDepense: number;
  /** Écart (dépassement si positif, économie si négatif). */
  ecart: number;
  /** Pourcentage de dépassement (positif = dépassement). */
  pourcentageDepassement: number;
  /** `true` si le budget est systématiquement dépassé (toutes années confondues). */
  systematiquementDepasse: boolean;
  /** SiteId si le budget est rattaché à un site, `null` si global. */
  siteId: string | null;
  /** Devise. */
  devise: string;
}

/**
 * Analyse les dépassements budgétaires pour une année donnée et identifie
 * les catégories systématiquement dépassées (sur toutes les années
 * disponibles).
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 * @param annee     Année scolaire (ex. "2025-2026"). Si omis, année en cours.
 */
export async function analyserDepassementsBudget(
  tenantId: string,
  claims: SessionSiteClaims,
  annee?: string,
): Promise<DepassementBudget[]> {
  // 1. Résoudre l'année.
  let anneeAnalysee = annee;
  if (!anneeAnalysee) {
    const anneeCourante = await prisma.anneesScolaires.findFirst({
      where: { tenantId, isCurrent: true },
      select: { libelle: true },
    });
    anneeAnalysee = anneeCourante?.libelle ?? undefined;
  }

  if (!anneeAnalysee) return [];

  // 2. Budgets de l'année analysée.
  const budgets = await prisma.budget.findMany({
    where: {
      tenantId,
      annee: anneeAnalysee,
      ...siteFilterForModel("budget", claims),
    },
    select: {
      id: true,
      categorie: true,
      montantPrevu: true,
      montantDepense: true,
      devise: true,
      siteId: true,
    },
  });

  if (budgets.length === 0) return [];

  // 3. Pour identifier les catégories systématiquement dépassées, on charge
  //    tous les budgets du tenant (toutes années) pour ces catégories.
  const categories = [...new Set(budgets.map((b) => b.categorie))];
  const tousBudgets = await prisma.budget.findMany({
    where: {
      tenantId,
      categorie: { in: categories },
      ...siteFilterForModel("budget", claims),
    },
    select: {
      categorie: true,
      montantPrevu: true,
      montantDepense: true,
    },
  });

  // Une catégorie est « systématiquement dépassée » si pour TOUTES les
  // occurrences de cette catégorie, montantDepense > montantPrevu.
  const categoriesSystematiques = new Set<string>();
  for (const cat of categories) {
    const occurrences = tousBudgets.filter((b) => b.categorie === cat);
    if (
      occurrences.length > 0 &&
      occurrences.every((b) => b.montantDepense > b.montantPrevu)
    ) {
      categoriesSystematiques.add(cat);
    }
  }

  // 4. Construire les résultats.
  return budgets
    .map((b) => {
      const ecart = b.montantDepense - b.montantPrevu;
      const pourcentage =
        b.montantPrevu > 0 ? (ecart / b.montantPrevu) * 100 : 0;
      return {
        categorie: b.categorie,
        annee: anneeAnalysee!,
        montantPrevu: Math.round(b.montantPrevu * 100) / 100,
        montantDepense: Math.round(b.montantDepense * 100) / 100,
        ecart: Math.round(ecart * 100) / 100,
        pourcentageDepassement: Math.round(pourcentage * 10) / 10,
        systematiquementDepasse: categoriesSystematiques.has(b.categorie),
        siteId: b.siteId,
        devise: b.devise,
      };
    })
    .sort((a, b) => b.pourcentageDepassement - a.pourcentageDepassement);
}

// ============================================================
// A28 — EFFICACITÉ DES RELANCES PAR CANAL
// ============================================================

/**
 * Efficacité d'un canal de relance : taux de paiement dans les 30 jours
 * suivant la relance.
 */
export interface EfficaciteRelance {
  /** Canal de relance : "sms", "whatsapp", "email", "courrier". */
  canal: string;
  /** Nombre total de relances envoyées via ce canal. */
  nbRelances: number;
  /** Nombre de relances suivies d'un paiement dans les 30 jours. */
  nbRelancesSuiviesPaiement: number;
  /** Taux de conversion (0-1). */
  tauxConversion: number;
  /** Délai moyen (en jours) entre la relance et le paiement, pour les relances efficaces. */
  delaiMoyenPaiementJours: number | null;
  /** `true` si aucune relance pour ce canal. */
  donneesInsuffisantes: boolean;
}

/**
 * Analyse l'efficacité des relances par canal. Pour chaque relance, on
 * vérifie si un paiement existe sur la même facture dans les 30 jours
 * suivant la relance.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function analyserEfficaciteRelances(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<EfficaciteRelance[]> {
  // 1. Charger toutes les relances du périmètre avec la facture associée.
  const relances = await prisma.relance.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("relance", claims),
    },
    select: {
      id: true,
      canal: true,
      envoyeeLe: true,
      factureId: true,
    },
  });

  if (relances.length === 0) {
    // Retourner les quatre canals avec données insuffisantes.
    return ["sms", "whatsapp", "email", "courrier"].map((canal) => ({
      canal,
      nbRelances: 0,
      nbRelancesSuiviesPaiement: 0,
      tauxConversion: 0,
      delaiMoyenPaiementJours: null,
      donneesInsuffisantes: true,
    }));
  }

  // 2. Regrouper les factures concernées pour charger les paiements en lot.
  const factureIds = [...new Set(relances.map((r) => r.factureId))];
  const paiements = await prisma.paiement.findMany({
    where: { factureId: { in: factureIds }, ...siteFilterForModel("paiement", claims) },
    select: { factureId: true, date: true },
  });

  // Indexer les paiements par facture.
  const paiementsParFacture = new Map<string, Date[]>();
  for (const p of paiements) {
    const liste = paiementsParFacture.get(p.factureId) ?? [];
    liste.push(p.date);
    paiementsParFacture.set(p.factureId, liste);
  }

  // 3. Pour chaque canal, calculer le taux de conversion.
  const canaux = ["sms", "whatsapp", "email", "courrier"];
  const resultats: EfficaciteRelance[] = [];

  for (const canal of canaux) {
    const relancesCanal = relances.filter((r) => r.canal === canal);
    const nbRelances = relancesCanal.length;

    if (nbRelances === 0) {
      resultats.push({
        canal,
        nbRelances: 0,
        nbRelancesSuiviesPaiement: 0,
        tauxConversion: 0,
        delaiMoyenPaiementJours: null,
        donneesInsuffisantes: true,
      });
      continue;
    }

    let nbEfficaces = 0;
    const delais: number[] = [];

    for (const relance of relancesCanal) {
      const datesPaiement = paiementsParFacture.get(relance.factureId) ?? [];
      // Premier paiement dans les 30 jours suivant la relance.
      const paiementEfficace = datesPaiement
        .filter((d) => {
          const delta = differenceEnJours(relance.envoyeeLe, d);
          return delta >= 0 && delta <= 30;
        })
        .sort((a, b) => a.getTime() - b.getTime())[0];

      if (paiementEfficace) {
        nbEfficaces++;
        delais.push(differenceEnJours(relance.envoyeeLe, paiementEfficace));
      }
    }

    resultats.push({
      canal,
      nbRelances,
      nbRelancesSuiviesPaiement: nbEfficaces,
      tauxConversion: Math.round((nbEfficaces / nbRelances) * 100) / 100,
      delaiMoyenPaiementJours:
        delais.length > 0
          ? Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) /
            10
          : null,
      donneesInsuffisantes: false,
    });
  }

  return resultats;
}

// ============================================================
// A29 — DÉLAI MOYEN DE PAIEMENT APRÈS ÉCHEANCE
// ============================================================

/**
 * Délai de paiement après échéance, ventilé par niveau et par site.
 */
export interface DelaiPaiement {
  /** Délai moyen global en jours (positif = en retard, négatif = en avance). */
  moyenneGlobaleJours: number | null;
  /** Médiane globale en jours. */
  medianeGlobaleJours: number | null;
  /** Nombre d'échéances payées analysées. */
  nbEcheances: number;
  /** Délai moyen par niveau de classe (classe.niveau → jours). */
  parNiveau: { niveau: string; delaiMoyenJours: number; nbEcheances: number }[];
  /** Délai moyen par site (siteId → jours). `null` = site global. */
  parSite: { siteId: string | null; delaiMoyenJours: number; nbEcheances: number }[];
  /** `true` si aucune échéance payée. */
  donneesInsuffisantes: boolean;
}

/**
 * Calcule le délai moyen de paiement après échéance pour toutes les
 * échéances PAYEE, ventilé par niveau de classe et par site.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function calculerDelaiPaiement(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<DelaiPaiement> {
  // 1. Charger les échéances payées avec la facture et l'élève associés.
  const echeances = await prisma.echeancePaiement.findMany({
    where: {
      statut: "PAYEE",
      payeeLe: { not: null },
      echeancier: {
        facture: {
          tenantId,
          ...siteFilterForModel("facture", claims),
        },
      },
    },
    select: {
      id: true,
      dateEcheance: true,
      payeeLe: true,
      echeancier: {
        select: {
          facture: {
            select: {
              id: true,
              siteId: true,
              eleve: {
                select: {
                  classe: { select: { niveau: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (echeances.length === 0) {
    return {
      moyenneGlobaleJours: null,
      medianeGlobaleJours: null,
      nbEcheances: 0,
      parNiveau: [],
      parSite: [],
      donneesInsuffisantes: true,
    };
  }

  // 2. Calculer les délais individuels.
  const delais = echeances.map((e) => ({
    delai: differenceEnJours(e.dateEcheance, e.payeeLe!),
    niveau: e.echeancier.facture.eleve.classe?.niveau ?? "INCONNU",
    siteId: e.echeancier.facture.siteId ?? null,
  }));

  // 3. Statistiques globales.
  const tousDelais = delais.map((d) => d.delai);
  const moyenneGlobale = moyenne(tousDelais);
  const medianeGlobale = mediane(tousDelais);

  // 4. Ventilation par niveau.
  const parNiveauMap = new Map<string, number[]>();
  for (const d of delais) {
    const liste = parNiveauMap.get(d.niveau) ?? [];
    liste.push(d.delai);
    parNiveauMap.set(d.niveau, liste);
  }
  const parNiveau = [...parNiveauMap.entries()]
    .map(([niveau, liste]) => ({
      niveau,
      delaiMoyenJours:
        Math.round((liste.reduce((a, b) => a + b, 0) / liste.length) * 10) / 10,
      nbEcheances: liste.length,
    }))
    .sort((a, b) => b.delaiMoyenJours - a.delaiMoyenJours);

  // 5. Ventilation par site.
  const parSiteMap = new Map<string | null, number[]>();
  for (const d of delais) {
    const liste = parSiteMap.get(d.siteId) ?? [];
    liste.push(d.delai);
    parSiteMap.set(d.siteId, liste);
  }
  const parSite = [...parSiteMap.entries()]
    .map(([siteId, liste]) => ({
      siteId,
      delaiMoyenJours:
        Math.round((liste.reduce((a, b) => a + b, 0) / liste.length) * 10) / 10,
      nbEcheances: liste.length,
    }))
    .sort((a, b) => b.delaiMoyenJours - a.delaiMoyenJours);

  return {
    moyenneGlobaleJours:
      moyenneGlobale !== null ? Math.round(moyenneGlobale * 10) / 10 : null,
    medianeGlobaleJours:
      medianeGlobale !== null ? Math.round(medianeGlobale * 10) / 10 : null,
    nbEcheances: delais.length,
    parNiveau,
    parSite,
    donneesInsuffisantes: false,
  };
}

// ============================================================
// A30 — TAUX D'ADMISSION DES CANDIDATURES
// ============================================================

/**
 * Taux d'admission des candidatures par classe voulue.
 */
export interface TauxAdmission {
  /** Classe voulue (ex. "6ème", "Terminale S"). */
  classeVoulue: string;
  /** Année scolaire visée. */
  annee: string;
  /** Nombre total de candidatures non annulées. */
  nbTotal: number;
  /** Nombre de candidatures admises (ADmis ou INSCRIT). */
  nbAdmis: number;
  /** Taux d'admission (0-1). */
  tauxAdmission: number;
  /** Nombre de candidatures refusées. */
  nbRefuses: number;
  /** Nombre de candidatures en cours (SOUMISE ou EN_EXAMEN). */
  nbEnCours: number;
  /** `true` si aucune candidature pour cette classe. */
  donneesInsuffisantes: boolean;
}

/**
 * Calcule le taux d'admission des candidatures par classe voulue.
 *
 * ADMIS et INSCRIT comptent comme des admissions. Les candidatures ANNULE
 * sont exclues du total.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 * @param annee     Année scolaire visée (ex. "2026-2027"). Si omis, toutes années.
 */
export async function calculerTauxAdmission(
  tenantId: string,
  claims: SessionSiteClaims,
  annee?: string,
): Promise<TauxAdmission[]> {
  // 1. Charger les candidatures non annulées.
  const candidatures = await prisma.candidature.findMany({
    where: {
      tenantId,
      statut: { not: "ANNULE" },
      ...(annee ? { annee } : {}),
      ...siteFilterForModel("candidature", claims),
    },
    select: {
      classeVoulue: true,
      annee: true,
      statut: true,
    },
  });

  if (candidatures.length === 0) return [];

  // 2. Grouper par classeVoulue + annee.
  const groupes = new Map<string, TauxAdmission>();

  for (const c of candidatures) {
    const cle = `${c.annee}__${c.classeVoulue}`;
    let entree = groupes.get(cle);
    if (!entree) {
      entree = {
        classeVoulue: c.classeVoulue,
        annee: c.annee,
        nbTotal: 0,
        nbAdmis: 0,
        tauxAdmission: 0,
        nbRefuses: 0,
        nbEnCours: 0,
        donneesInsuffisantes: false,
      };
      groupes.set(cle, entree);
    }

    entree.nbTotal++;
    if (c.statut === "ADMIS" || c.statut === "INSCRIT") {
      entree.nbAdmis++;
    } else if (c.statut === "REFUSE") {
      entree.nbRefuses++;
    } else {
      // SOUMISE ou EN_EXAMEN
      entree.nbEnCours++;
    }
  }

  // 3. Calculer les taux.
  const resultats = [...groupes.values()].map((g) => ({
    ...g,
    tauxAdmission:
      g.nbTotal > 0 ? Math.round((g.nbAdmis / g.nbTotal) * 100) / 100 : 0,
  }));

  // 4. Trier par taux d'admission croissant (les plus sélectives en premier).
  return resultats.sort((a, b) => a.tauxAdmission - b.tauxAdmission);
}

// ============================================================
// I5 — CONTRE-FACTUEL REMISES
// ============================================================

/**
 * Comparaison du délai de paiement entre les familles bénéficiant d'une
 * remise et celles qui n'en bénéficient pas.
 *
 * Une famille est considérée « avec remise » si la somme des paiements
 * sur ses factures est inférieure à 90 % du montant total des factures
 * (i.e. une remise d'au moins 10 % a été accordée, de fait ou de convention).
 */
export interface ContreFactuelRemise {
  /** Délai moyen de paiement (en jours après échéance) pour les familles AVEC remise. */
  delaiMoyenAvecRemise: number | null;
  /** Délai moyen de paiement pour les familles SANS remise. */
  delaiMoyenSansRemise: number | null;
  /** Différence en jours (avecRemise - sansRemise). Négatif = les remises accélèrent le paiement. */
  differenceJours: number | null;
  /** Nombre de familles avec remise. */
  nbFamillesAvecRemise: number;
  /** Nombre de familles sans remise. */
  nbFamillesSansRemise: number;
  /** Nombre d'échéances analysées (avec remise). */
  nbEcheancesAvecRemise: number;
  /** Nombre d'échéances analysées (sans remise). */
  nbEcheancesSansRemise: number;
  /** `true` si l'un des deux groupes est vide. */
  donneesInsuffisantes: boolean;
}

/**
 * Simule le contre-factuel des remises : compare le délai de paiement
 * après échéance des familles ayant reçu une remise (total paiements <
 * 90 % du montant facturé) vs celles n'en ayant pas reçu.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 */
export async function simulerContreFactuelRemises(
  tenantId: string,
  claims: SessionSiteClaims,
): Promise<ContreFactuelRemise> {
  // 1. Charger les parents et leurs élèves.
  const parents = await prisma.parent.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("parent", claims),
    },
    select: {
      id: true,
      enfants: { select: { eleveId: true } },
    },
  });

  if (parents.length === 0) {
    return {
      delaiMoyenAvecRemise: null,
      delaiMoyenSansRemise: null,
      differenceJours: null,
      nbFamillesAvecRemise: 0,
      nbFamillesSansRemise: 0,
      nbEcheancesAvecRemise: 0,
      nbEcheancesSansRemise: 0,
      donneesInsuffisantes: true,
    };
  }

  // 2. Pour chaque famille, déterminer si elle bénéficie d'une remise et
  //    collecter les délais de paiement de ses échéances payées.
  const delaisAvecRemise: number[] = [];
  const delaisSansRemise: number[] = [];
  let nbFamillesAvecRemise = 0;
  let nbFamillesSansRemise = 0;

  for (const parent of parents) {
    const eleveIds = parent.enfants.map((e) => e.eleveId);
    if (eleveIds.length === 0) continue;

    // Factures de la famille.
    const factures = await prisma.facture.findMany({
      where: {
        tenantId,
        eleveId: { in: eleveIds },
        statut: { not: "ANNULEE" },
        ...siteFilterForModel("facture", claims),
      },
      select: {
        id: true,
        montant: true,
        paiements: { select: { montant: true } },
      },
    });

    if (factures.length === 0) continue;

    // Déterminer si la famille bénéficie d'une remise globale.
    const totalFacture = factures.reduce((acc, f) => acc + f.montant, 0);
    const totalPaye = factures.reduce(
      (acc, f) =>
        acc + f.paiements.reduce((s, p) => s + p.montant, 0),
      0,
    );
    const aRemise = totalFacture > 0 && totalPaye < totalFacture * 0.9;

    if (aRemise) {
      nbFamillesAvecRemise++;
    } else {
      nbFamillesSansRemise++;
    }

    // Échéances payées de ces factures.
    const factureIds = factures.map((f) => f.id);
    const echeances = await prisma.echeancePaiement.findMany({
      where: {
        factureId: { in: factureIds },
        statut: "PAYEE",
        payeeLe: { not: null },
      },
      select: {
        dateEcheance: true,
        payeeLe: true,
      },
    });

    const delais = echeances.map((e) =>
      differenceEnJours(e.dateEcheance, e.payeeLe!),
    );

    if (aRemise) {
      delaisAvecRemise.push(...delais);
    } else {
      delaisSansRemise.push(...delais);
    }
  }

  // 3. Calculer les moyennes.
  const moyAvecRemise = moyenne(delaisAvecRemise);
  const moySansRemise = moyenne(delaisSansRemise);

  const differenceJours =
    moyAvecRemise !== null && moySansRemise !== null
      ? Math.round((moyAvecRemise - moySansRemise) * 10) / 10
      : null;

  return {
    delaiMoyenAvecRemise:
      moyAvecRemise !== null ? Math.round(moyAvecRemise * 10) / 10 : null,
    delaiMoyenSansRemise:
      moySansRemise !== null ? Math.round(moySansRemise * 10) / 10 : null,
    differenceJours,
    nbFamillesAvecRemise,
    nbFamillesSansRemise,
    nbEcheancesAvecRemise: delaisAvecRemise.length,
    nbEcheancesSansRemise: delaisSansRemise.length,
    donneesInsuffisantes:
      nbFamillesAvecRemise === 0 || nbFamillesSansRemise === 0,
  };
}
