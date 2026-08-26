/**
 * EcolPro / LEARNOS — Engagement parental
 * =========================================
 *
 * Quatre analyses déterministes sur la relation école ↔ familles, sans aucun
 * appel de modèle de langage :
 *
 *  1. CORRÉLATION ENGAGEMENT → MASTERY (I22) — mesure si l'engagement
 *     parental (échanges + alertes reçues) corréle avec la maîtrise moyenne
 *     de l'élève. Coefficient de Pearson + segmentation par niveau
 *     d'engagement (FAIBLE / MOYEN / ÉLEVÉ).
 *
 *  2. QUESTIONS FRÉQUENTES DES PARENTS (I23) — répartition des intentions
 *     déclarées dans les échanges (`progression`, `difficultes`, `aider`,
 *     `assiduite`, `solde`, `inconnue`) avec compte et pourcentage.
 *
 *  3. IMPACT DES ALERTES URGENT SUR LE PAIEMENT (I24) — compare le délai de
 *     paiement après une alerte URGENT avec le délai observé chez les élèves
 *     n'ayant reçu aucune alerte URGENT.
 *
 *  4. TAUX DE VALIDATION DES DEMANDES DE LIEN PARENT (I25) — proportion de
 *     demandes validées / refusées et délai moyen de traitement.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Nombre minimum d'échantillons pour qu'une analyse soit jugée fiable. */
const ECHANTILLON_MIN = 10;

/** Seuil d'engagement : 0 à N échanges = FAIBLE. */
const SEUIL_ENGAGEMENT_FAIBLE = 2;

/** Seuil d'engagement : 3 à N échanges = MOYEN, au-delà = ÉLEVÉ. */
const SEUIL_ENGAGEMENT_ELEVE = 10;

/** Intentions valides attendues dans `EchangeParent.intention`. */
const INTENTIONS_VALIDES = [
  "progression",
  "difficultes",
  "aider",
  "assiduite",
  "solde",
  "inconnue",
] as const;

// ------------------------------------------------------------
// Types — I22 : Corrélation engagement → mastery
// ------------------------------------------------------------

export type NiveauEngagement = "FAIBLE" | "MOYEN" | "ELEVE";

export interface PointCorrelation {
  eleveId: string;
  nom: string;
  prenom: string;
  /** Nombre total d'échanges parents (questions + alertes reçues). */
  nbEchanges: number;
  /** Nombre d'alertes envoyées (statut ENVOYEE). */
  nbAlertesEnvoyees: number;
  /** Indicateur composite d'engagement (échanges + alertes). */
  scoreEngagement: number;
  /** Maîtrise moyenne (0..1) issue de StudentLearningProfile, ou null. */
  masteryMoyenne: number | null;
  niveau: NiveauEngagement;
}

export interface GroupeEngagement {
  niveau: NiveauEngagement;
  effectif: number;
  /** Maîtrise moyenne du groupe, ou null si aucune donnée. */
  masteryMoyenne: number | null;
  /** Engagement moyen du groupe. */
  engagementMoyen: number;
}

export interface CorrelationEngagement {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  /** Coefficient de corrélation de Pearson entre engagement et mastery. */
  coefficientPearson: number | null;
  /** Nombre d'élèves avec à la fois engagement ET mastery connus. */
  echantillon: number;
  points: PointCorrelation[];
  groupes: GroupeEngagement[];
}

// ------------------------------------------------------------
// Types — I23 : Questions fréquentes
// ------------------------------------------------------------

export interface IntentionFrequente {
  intention: string;
  count: number;
  pourcentage: number;
}

export interface QuestionsFrequentes {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  total: number;
  intentions: IntentionFrequente[];
}

// ------------------------------------------------------------
// Types — I24 : Impact des alertes URGENT sur le paiement
// ------------------------------------------------------------

export interface GroupePaiement {
  /** "URGENT" = élèves ayant reçu au moins une alerte URGENT. */
  groupe: "URGENT" | "TEMOIN";
  effectif: number;
  /** Délai moyen de paiement en jours. */
  delaiMoyenJours: number | null;
  /** Délai médian en jours. */
  delaiMedianJours: number | null;
}

export interface ImpactAlertePaiement {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  urgent: GroupePaiement;
  temoin: GroupePaiement;
  /** Différence de délai moyen (temoin - urgent) en jours. */
  differenceJours: number | null;
}

// ------------------------------------------------------------
// Types — I25 : Taux de validation des demandes de lien
// ------------------------------------------------------------

export interface TauxValidationLien {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  total: number;
  validees: number;
  refusees: number;
  enAttente: number;
  tauxValidation: number;
  tauxRefus: number;
  /** Délai moyen de traitement en jours (traiteLe - createdAt). */
  delaiMoyenTraitementJours: number | null;
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/**
 * Calcule le coefficient de corrélation de Pearson entre deux séries de
 * valeurs. Retourne `null` si l'une des séries a une variance nulle ou si
 * les tableaux sont vides / de tailles différentes.
 */
function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2 || n !== y.length) return null;

  const moyX = x.reduce((a, b) => a + b, 0) / n;
  const moyY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - moyX;
    const dy = y[i] - moyY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;

  return num / den;
}

/** Médiane d'un tableau de nombres triables. */
function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const trie = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(trie.length / 2);
  return trie.length % 2 === 0
    ? (trie[milieu - 1] + trie[milieu]) / 2
    : trie[milieu];
}

/** Convertit un score d'engagement en niveau qualitatif. */
function niveauEngagement(score: number): NiveauEngagement {
  if (score <= SEUIL_ENGAGEMENT_FAIBLE) return "FAIBLE";
  if (score < SEUIL_ENGAGEMENT_ELEVE) return "MOYEN";
  return "ELEVE";
}

/** Moyenne d'un tableau, `null` si vide. */
function moyenneOuNull(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

// ------------------------------------------------------------
// I22 — Corrélation engagement parental → mastery
// ------------------------------------------------------------

/**
 * Analyse la corrélation entre l'engagement parental (échanges + alertes
 * reçues) et la maîtrise moyenne de l'élève.
 *
 * Pour chaque élève actif du tenant/site :
 *  - compte les `EchangeParent` rattachés (via `eleveId`),
 *  - compte les `AlerteParent` envoyées (statut `ENVOYEE`),
 *  - calcule la maîtrise moyenne depuis `StudentLearningProfile`.
 *
 * Le score d'engagement = nbEchanges + nbAlertesEnvoyees. Le coefficient de
 * Pearson est calculé sur les élèves ayant à la fois un engagement > 0 et
 * une maîtrise connue.
 */
export async function analyserCorrelationEngagement(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<CorrelationEngagement> {
  // --- 1. Élèves actifs du tenant/site ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true, nom: true, prenom: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  if (eleves.length === 0) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      coefficientPearson: null,
      echantillon: 0,
      points: [],
      groupes: [],
    };
  }

  const ids = eleves.map((e) => e.id);

  // --- 2. Comptes batch par élève ---
  const [echangesParEleve, alertesParEleve, masteryParEleve] =
    await Promise.all([
      // Échanges rattachés à un élève (eleveId non null).
      prisma.echangeParent.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          eleveId: { in: ids },
          ...siteFilterForModel("echangeParent", claims),
        },
        _count: { eleveId: true },
      }),
      // Alertes envoyées (statut ENVOYEE).
      prisma.alerteParent.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          eleveId: { in: ids },
          statut: "ENVOYEE",
          ...siteFilterForModel("alerteParent", claims),
        },
        _count: { eleveId: true },
      }),
      // Maîtrise moyenne par élève (AVG masteryScore).
      prisma.studentLearningProfile.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          eleveId: { in: ids },
          ...siteFilterForModel("studentLearningProfile", claims),
        },
        _avg: { masteryScore: true },
      }),
    ]);

  // Indexation par eleveId.
  const mapEchanges = new Map(
    echangesParEleve
      .filter((e) => e.eleveId !== null)
      .map((e) => [e.eleveId as string, e._count.eleveId])
  );
  const mapAlertes = new Map(
    alertesParEleve.map((a) => [a.eleveId, a._count.eleveId])
  );
  const mapMastery = new Map(
    masteryParEleve.map((m) => [m.eleveId, m._avg.masteryScore ?? null])
  );

  // --- 3. Construction des points de corrélation ---
  const points: PointCorrelation[] = eleves.map((e) => {
    const nbEchanges = mapEchanges.get(e.id) ?? 0;
    const nbAlertesEnvoyees = mapAlertes.get(e.id) ?? 0;
    const scoreEngagement = nbEchanges + nbAlertesEnvoyees;
    const masteryMoyenne = mapMastery.get(e.id) ?? null;

    return {
      eleveId: e.id,
      nom: e.nom,
      prenom: e.prenom,
      nbEchanges,
      nbAlertesEnvoyees,
      scoreEngagement,
      masteryMoyenne,
      niveau: niveauEngagement(scoreEngagement),
    };
  });

  // --- 4. Pearson sur les élèves ayant engagement ET mastery ---
  const pointsCorrelables = points.filter(
    (p) => p.masteryMoyenne !== null
  );
  const x = pointsCorrelables.map((p) => p.scoreEngagement);
  const y = pointsCorrelables.map((p) => p.masteryMoyenne as number);
  const coefficientPearson = pearson(x, y);

  // --- 5. Segmentation par niveau d'engagement ---
  const niveaux: NiveauEngagement[] = ["FAIBLE", "MOYEN", "ELEVE"];
  const groupes: GroupeEngagement[] = niveaux.map((niveau) => {
    const membres = points.filter((p) => p.niveau === niveau);
    const masteryVals = membres
      .map((m) => m.masteryMoyenne)
      .filter((v): v is number => v !== null);
    return {
      niveau,
      effectif: membres.length,
      masteryMoyenne: moyenneOuNull(masteryVals),
      engagementMoyen:
        membres.length > 0
          ? membres.reduce((a, b) => a + b.scoreEngagement, 0) / membres.length
          : 0,
    };
  });

  // --- 6. Statut : données suffisantes ? ---
  const echantillon = pointsCorrelables.length;
  const statut = echantillon >= ECHANTILLON_MIN ? "OK" : "DONNEES_INSUFFISANTES";

  return {
    statut,
    coefficientPearson,
    echantillon,
    points,
    groupes,
  };
}

// ------------------------------------------------------------
// I23 — Questions fréquentes des parents
// ------------------------------------------------------------

/**
 * Répartit les échanges parents par intention déclarée et calcule le
 * pourcentage de chaque catégorie.
 *
 * Les intentions attendues : `progression`, `difficultes`, `aider`,
 * `assiduite`, `solde`, `inconnue`. Toute intention non listée est
 * regroupée sous `inconnue` pour garantir un dénominateur stable.
 */
export async function analyserQuestionsFrequentes(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<QuestionsFrequentes> {
  const total = await prisma.echangeParent.count({
    where: {
      tenantId,
      ...siteFilterForModel("echangeParent", claims),
    },
  });

  if (total < ECHANTILLON_MIN) {
    return { statut: "DONNEES_INSUFFISANTES", total, intentions: [] };
  }

  // Compte par intention.
  const comptes = await prisma.echangeParent.groupBy({
    by: ["intention"],
    where: {
      tenantId,
      ...siteFilterForModel("echangeParent", claims),
    },
    _count: { intention: true },
    orderBy: { _count: { intention: "desc" } },
  });

  // Indexation des comptes bruts.
  const mapComptes = new Map<string, number>();
  for (const c of comptes) {
    // Les intentions non reconnues sont rabattues sur "inconnue".
    const cle = INTENTIONS_VALIDES.includes(
      c.intention as (typeof INTENTIONS_VALIDES)[number]
    )
      ? c.intention
      : "inconnue";
    mapComptes.set(cle, (mapComptes.get(cle) ?? 0) + c._count.intention);
  }

  // Construction de la liste ordonnée par count décroissant, en garantissant
  // que toutes les intentions valides apparaissent (même à 0).
  const intentions: IntentionFrequente[] = INTENTIONS_VALIDES.map((intention) => ({
    intention,
    count: mapComptes.get(intention) ?? 0,
    pourcentage: total > 0 ? Math.round(((mapComptes.get(intention) ?? 0) / total) * 1000) / 10 : 0,
  })).sort((a, b) => b.count - a.count);

  return { statut: "OK", total, intentions };
}

// ------------------------------------------------------------
// I24 — Impact des alertes URGENT sur le paiement
// ------------------------------------------------------------

/**
 * Compare le délai de paiement après une alerte URGENT avec le délai observé
 * chez les élèves n'ayant reçu aucune alerte URGENT.
 *
 *  - Groupe URGENT : pour chaque élève ayant reçu ≥ 1 alerte URGENT, on
 *    mesure le délai entre la date d'envoi de l'alerte la plus ancienne et
 *    la date du premier paiement postérieur.
 *  - Groupe TÉMOIN : pour chaque élève sans alerte URGENT, on mesure le
 *    délai entre la création de la facture et la date du premier paiement.
 *
 * Le rapprochement parent→élève se fait via `EleveParent` pour garantir que
 * l'on ne considère que les élèves du périmètre.
 */
export async function analyserImpactAlertePaiement(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<ImpactAlertePaiement> {
  // --- 1. Élèves actifs du tenant/site ---
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true },
  });

  if (eleves.length === 0) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      urgent: { groupe: "URGENT", effectif: 0, delaiMoyenJours: null, delaiMedianJours: null },
      temoin: { groupe: "TEMOIN", effectif: 0, delaiMoyenJours: null, delaiMedianJours: null },
      differenceJours: null,
    };
  }

  const ids = eleves.map((e) => e.id);

  // --- 2. Alertes URGENT par élève (date d'envoi la plus ancienne) ---
  const alertesUrgent = await prisma.alerteParent.findMany({
    where: {
      tenantId,
      eleveId: { in: ids },
      niveau: "URGENT",
      // On ne considère que les alertes effectivement envoyées.
      statut: "ENVOYEE",
      ...siteFilterForModel("alerteParent", claims),
    },
    select: {
      eleveId: true,
      envoyeeLe: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Date de la première alerte URGENT par élève (préfère envoyeeLe, sinon createdAt).
  const mapPremiereAlerte = new Map<string, Date>();
  for (const a of alertesUrgent) {
    const date = a.envoyeeLe ?? a.createdAt;
    const existante = mapPremiereAlerte.get(a.eleveId);
    if (!existante || date < existante) {
      mapPremiereAlerte.set(a.eleveId, date);
    }
  }

  const elevesUrgentIds = [...mapPremiereAlerte.keys()];
  const elevesTemoinIds = ids.filter((id) => !mapPremiereAlerte.has(id));

  // --- 3. Paiements pour calculer les délais ---
  // On récupère toutes les factures des élèves concernés avec leurs paiements.
  const anneeId = await anneeActiveId(tenantId);
  const factures = await prisma.facture.findMany({
    where: {
      tenantId,
      eleveId: { in: ids },
      ...(anneeId ? { anneeId } : {}),
      ...siteFilterForModel("facture", claims),
    },
    select: {
      eleveId: true,
      createdAt: true,
      paiements: { select: { date: true }, orderBy: { date: "asc" } },
    },
  });

  // Indexation : premier paiement par élève (toutes factures confondues, trié par date).
  const mapPremierPaiement = new Map<string, Date>();
  for (const f of factures) {
    for (const p of f.paiements) {
      const existant = mapPremierPaiement.get(f.eleveId);
      if (!existant || p.date < existant) {
        mapPremierPaiement.set(f.eleveId, p.date);
      }
    }
  }

  // Date de création de la première facture par élève (pour le groupe témoin).
  const mapPremiereFacture = new Map<string, Date>();
  for (const f of factures) {
    const existante = mapPremiereFacture.get(f.eleveId);
    if (!existante || f.createdAt < existante) {
      mapPremiereFacture.set(f.eleveId, f.createdAt);
    }
  }

  // --- 4. Calcul des délais (en jours) ---
  const JOUR_MS = 86_400_000;

  // Groupe URGENT : délai entre la première alerte et le premier paiement
  // postérieur à l'alerte.
  const delaisUrgent: number[] = [];
  for (const eleveId of elevesUrgentIds) {
    const dateAlerte = mapPremiereAlerte.get(eleveId);
    const datePaiement = mapPremierPaiement.get(eleveId);
    if (!dateAlerte || !datePaiement) continue;
    // Le paiement doit être postérieur à l'alerte pour être significatif.
    if (datePaiement < dateAlerte) continue;
    delaisUrgent.push((datePaiement.getTime() - dateAlerte.getTime()) / JOUR_MS);
  }

  // Groupe TÉMOIN : délai entre la création de la facture et le premier
  // paiement (les élèves sans alerte URGENT).
  const delaisTemoin: number[] = [];
  for (const eleveId of elevesTemoinIds) {
    const dateFacture = mapPremiereFacture.get(eleveId);
    const datePaiement = mapPremierPaiement.get(eleveId);
    if (!dateFacture || !datePaiement) continue;
    if (datePaiement < dateFacture) continue;
    delaisTemoin.push((datePaiement.getTime() - dateFacture.getTime()) / JOUR_MS);
  }

  const urgent: GroupePaiement = {
    groupe: "URGENT",
    effectif: delaisUrgent.length,
    delaiMoyenJours: moyenneOuNull(delaisUrgent),
    delaiMedianJours: mediane(delaisUrgent),
  };

  const temoin: GroupePaiement = {
    groupe: "TEMOIN",
    effectif: delaisTemoin.length,
    delaiMoyenJours: moyenneOuNull(delaisTemoin),
    delaiMedianJours: mediane(delaisTemoin),
  };

  // Différence : temoin - urgent (positif = l'alerte accélère le paiement).
  const differenceJours =
    urgent.delaiMoyenJours !== null && temoin.delaiMoyenJours !== null
      ? temoin.delaiMoyenJours - urgent.delaiMoyenJours
      : null;

  // --- 5. Statut : au moins ECHANTILLON_MIN dans un des deux groupes ---
  const echantillonTotal = delaisUrgent.length + delaisTemoin.length;
  const statut =
    echantillonTotal >= ECHANTILLON_MIN ? "OK" : "DONNEES_INSUFFISANTES";

  return { statut, urgent, temoin, differenceJours };
}

// ------------------------------------------------------------
// I25 — Taux de validation des demandes de lien parent
// ------------------------------------------------------------

/**
 * Calcule le taux de validation et de refus des demandes de lien
 * parent ↔ élève, ainsi que le délai moyen de traitement
 * (`traiteLe - createdAt`).
 *
 * `DemandeLienParent` est au niveau tenant (pas de `siteId`) : le filtrage
 * se fait uniquement par `tenantId`.
 */
export async function analyserTauxValidationLien(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<TauxValidationLien> {
  const total = await prisma.demandeLienParent.count({
    where: {
      tenantId,
      ...siteFilterForModel("demandeLienParent", claims),
    },
  });

  if (total < ECHANTILLON_MIN) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      total,
      validees: 0,
      refusees: 0,
      enAttente: 0,
      tauxValidation: 0,
      tauxRefus: 0,
      delaiMoyenTraitementJours: null,
    };
  }

  // Comptes par statut.
  const [validees, refusees, enAttente] = await Promise.all([
    prisma.demandeLienParent.count({
      where: { tenantId, statut: "VALIDE", ...siteFilterForModel("demandeLienParent", claims) },
    }),
    prisma.demandeLienParent.count({
      where: { tenantId, statut: "REFUSE", ...siteFilterForModel("demandeLienParent", claims) },
    }),
    prisma.demandeLienParent.count({
      where: { tenantId, statut: "EN_ATTENTE", ...siteFilterForModel("demandeLienParent", claims) },
    }),
  ]);

  // Délai moyen de traitement : demandes traitées (traiteLe non null).
  const JOUR_MS = 86_400_000;
  const demandesTraitees = await prisma.demandeLienParent.findMany({
    where: {
      tenantId,
      traiteLe: { not: null },
      ...siteFilterForModel("demandeLienParent", claims),
    },
    select: { createdAt: true, traiteLe: true },
  });

  const delaisJours = demandesTraitees
    .map((d) => {
      if (!d.traiteLe) return null;
      return (d.traiteLe.getTime() - d.createdAt.getTime()) / JOUR_MS;
    })
    .filter((v): v is number => v !== null && v >= 0);

  const delaiMoyenTraitementJours = moyenneOuNull(delaisJours);

  return {
    statut: "OK",
    total,
    validees,
    refusees,
    enAttente,
    tauxValidation: total > 0 ? Math.round((validees / total) * 1000) / 10 : 0,
    tauxRefus: total > 0 ? Math.round((refusees / total) * 1000) / 10 : 0,
    delaiMoyenTraitementJours,
  };
}
