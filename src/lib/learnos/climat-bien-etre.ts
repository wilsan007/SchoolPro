/**
 * EcolPro / LEARNOS — Climat scolaire & bien-être (A31 → A34)
 * ============================================================
 *
 * Quatre analyses déterministes sur le climat scolaire, sans aucun appel à
 * un modèle de langage — statistiques pures sur les données du tenant.
 *
 *  1. CORRÉLATION PASSAGES INFIRMERIE ↔ PERFORMANCES (A31) — mesure si le
 *     nombre de passages à l'infirmerie corréle négativement avec la moyenne
 *     générale. Coefficient de Pearson + segmentation par fréquence
 *     (0, 1-3, 4-9, ≥10).
 *
 *  2. HOTSPOTS INCIDENTS PAR JOUR/HEURE (A32) — identifie les moments
 *     (jour de la semaine × heure) avec le plus d'incidents, pour cibler
 *     la surveillance. Top 5 des points chauds, par site si multi-site.
 *
 *  3. EFFICACITÉ DES ENTRETIENS CONSEILLER (A33) — taux de réalisation et
 *     taux de suivi des entretiens, par motif, avec délai moyen entre
 *     planification et réalisation.
 *
 *  4. TAUX DE NOTIFICATION DES PARENTS SUITE À INCIDENT (A34) — proportion
 *     d'incidents dont au moins une sanction associée a notifié les parents,
 *     par type d'incident, par gravité et par site.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  resolveSiteScope,
  type SessionSiteClaims,
} from "@/lib/site-scope";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Nombre minimum d'échantillons pour qu'une corrélation soit fiable. */
const ECHANTILLON_MIN = 10;

/** Jours de la semaine (0 = dimanche, 6 = samedi). */
const JOURS_SEMAINE = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/** Nombre de hotspots à retourner. */
const TOP_HOTSPOTS = 5;

// ------------------------------------------------------------
// Types — Analyse 1 : Corrélation passages infirmerie ↔ performances (A31)
// ------------------------------------------------------------

export type FrequenceInfirmerie = "AUCUN" | "FAIBLE" | "MODERE" | "FREQUENT";

export interface PointCorrelationInfirmerie {
  eleveId: string;
  nom: string;
  prenom: string;
  /** Nombre de passages à l'infirmerie sur l'année. */
  nbPassages: number;
  /** Moyenne générale la plus récente (Bulletin.moyenneGenerale), ou null. */
  moyenneGenerale: number | null;
  /** Catégorie de fréquence. */
  frequence: FrequenceInfirmerie;
}

export interface GroupeFrequenceInfirmerie {
  frequence: FrequenceInfirmerie;
  /** Bornes incluses du groupe (min, max). */
  min: number;
  max: number | null;
  effectif: number;
  /** Moyenne générale moyenne du groupe, ou null si aucune donnée. */
  moyenneGenerale: number | null;
}

export interface CorrelationInfirmerie {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  /** Coefficient de corrélation de Pearson entre nb passages et moyenne. */
  coefficientPearson: number | null;
  /** Nombre d'élèves avec à la fois passages ET moyenne connus. */
  echantillon: number;
  /** Nombre total d'élèves actifs analysés. */
  nbEleves: number;
  points: PointCorrelationInfirmerie[];
  groupes: GroupeFrequenceInfirmerie[];
}

// ------------------------------------------------------------
// Types — Analyse 2 : Hotspots incidents par jour/heure (A32)
// ------------------------------------------------------------

export interface HotspotIncident {
  /** Jour de la semaine (0 = dimanche, 6 = samedi). */
  jour: number;
  /** Libellé du jour (ex. "Lundi"). */
  jourLibelle: string;
  /** Heure (0-23). */
  heure: number;
  /** Nombre d'incidents à ce moment. */
  nbIncidents: number;
}

export interface HotspotsIncidents {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  /** Nombre total d'incidents sur l'année. */
  totalIncidents: number;
  /** Top 5 des moments (jour × heure) avec le plus d'incidents. */
  topHotspots: HotspotIncident[];
  /** Répartition complète jour × heure (toutes les cellules non nulles). */
  matrice: HotspotIncident[];
  /** Hotspots par site (vide si mono-site ou périmètre ALL sans site). */
  parSite: { siteId: string; siteNom: string; topHotspots: HotspotIncident[] }[];
}

// ------------------------------------------------------------
// Types — Analyse 3 : Efficacité des entretiens conseiller (A33)
// ------------------------------------------------------------

export interface ResultatMotifEntretien {
  motif: string;
  total: number;
  /** Nombre d'entretiens planifiés (statut PLANIFIE). */
  planifies: number;
  /** Nombre d'entretiens réalisés (statut REALISE). */
  realises: number;
  /** Nombre d'entretiens réalisés avec un suivi non null. */
  avecSuivi: number;
  /** Taux de réalisation = realises / (realises + planifies). */
  tauxRealisation: number;
  /** Taux de suivi = avecSuivi / realises. */
  tauxSuivi: number;
  /** Délai moyen entre planification et réalisation en jours, ou null. */
  delaiMoyenJours: number | null;
}

export interface EfficaciteEntretiens {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  total: number;
  planifies: number;
  realises: number;
  avecSuivi: number;
  /** Taux de réalisation global. */
  tauxRealisation: number;
  /** Taux de suivi global. */
  tauxSuivi: number;
  /** Délai moyen global entre planification et réalisation en jours. */
  delaiMoyenJours: number | null;
  /** Détail par motif. */
  parMotif: ResultatMotifEntretien[];
}

// ------------------------------------------------------------
// Types — Analyse 4 : Taux de notification des parents (A34)
// ------------------------------------------------------------

export interface ResultatNotificationParType {
  type: string;
  total: number;
  /** Nombre d'incidents dont au moins une sanction a parentNotifie=true. */
  notifie: number;
  /** Taux de notification = notifie / total. */
  tauxNotification: number;
}

export interface ResultatNotificationParGravite {
  gravite: number;
  total: number;
  notifie: number;
  tauxNotification: number;
}

export interface ResultatNotificationParSite {
  siteId: string | null;
  siteNom: string | null;
  total: number;
  notifie: number;
  tauxNotification: number;
}

export interface NotificationParents {
  statut: "OK" | "DONNEES_INSUFFISANTES";
  total: number;
  notifie: number;
  /** Taux de notification global = notifie / total. */
  tauxNotification: number;
  parType: ResultatNotificationParType[];
  parGravite: ResultatNotificationParGravite[];
  parSite: ResultatNotificationParSite[];
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

/** Moyenne d'un tableau, `null` si vide. */
function moyenneOuNull(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
}

/** Arrondit à 2 décimales. */
function arrondi2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Arrondit à 1 décimale. */
function arrondi1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Classifie la fréquence des passages infirmerie.
 *  - AUCUN : 0 passage
 *  - FAIBLE : 1 à 3 passages
 *  - MODERE : 4 à 9 passages
 *  - FREQUENT : 10 passages ou plus
 */
function classifierFrequence(nb: number): FrequenceInfirmerie {
  if (nb === 0) return "AUCUN";
  if (nb <= 3) return "FAIBLE";
  if (nb <= 9) return "MODERE";
  return "FREQUENT";
}

/**
 * Filtre de site pour les modèles `Site` (non référencés dans SITE_PATHS en
 * tant que modèle filtrable, mais résolvables via `resolveSiteScope`).
 *
 * - `ALL` / `RELATION` → pas de filtre (tout le tenant).
 * - `SITES` → `id IN (...)`.
 * - `NONE` → prédicat toujours faux.
 */
function filtreSiteIdColumn(
  scope: ReturnType<typeof resolveSiteScope>
): Record<string, unknown> {
  if (scope.kind === "SITES") {
    return { id: { in: scope.siteIds } };
  }
  if (scope.kind === "NONE") {
    return { AND: [{ id: "__ecolpro_no_site_access__" }] };
  }
  return {};
}

/**
 * Résout l'année scolaire courante pour le tenant et renvoie les bornes
 * [dateDebut, dateFin] du filtrage temporel. Si aucune année courante n'est
 * trouvée, renvoie `null` (pas de filtrage par date).
 */
async function borneAnneeCourante(
  tenantId: string
): Promise<{ debut: Date; fin: Date } | null> {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { dateDebut: true, dateFin: true },
  });

  if (!annee) return null;
  return { debut: annee.dateDebut, fin: annee.dateFin };
}

// ------------------------------------------------------------
// Analyse 1 — Corrélation passages infirmerie ↔ performances (A31)
// ------------------------------------------------------------

/**
 * Analyse la corrélation entre le nombre de passages à l'infirmerie et la
 * moyenne générale des élèves sur l'année scolaire courante.
 *
 * Pour chaque élève actif du tenant/site :
 *  - compte les `PassageInfirmerie` sur l'année,
 *  - récupère la moyenne générale la plus récente depuis `Bulletin`,
 *  - calcule le coefficient de Pearson entre les deux séries.
 *
 * Les élèves sont regroupés par fréquence (0, 1-3, 4-9, ≥10) pour comparer
 * les moyennes. Si moins de 10 élèves ont à la fois des passages et une
 * moyenne connue, le statut est `DONNEES_INSUFFISANTES`.
 *
 * Hypothèse : les élèves qui vont souvent à l'infirmerie ont-ils de moins
 * bons résultats ?
 */
export async function analyserCorrelationInfirmerie(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<CorrelationInfirmerie> {
  // --- 1. Résolution de l'année scolaire courante ---
  const bornes = await borneAnneeCourante(tenantId);

  // --- 2. Élèves actifs du tenant/site ---
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
      nbEleves: 0,
      points: [],
      groupes: [],
    };
  }

  const ids = eleves.map((e) => e.id);

  // --- 3. Comptage des passages infirmerie par élève (batch) ---
  const passagesParEleve = await prisma.passageInfirmerie.groupBy({
    by: ["eleveId"],
    where: {
      tenantId,
      eleveId: { in: ids },
      ...(bornes
        ? { date: { gte: bornes.debut, lte: bornes.fin } }
        : {}),
      ...siteFilterForModel("passageInfirmerie", claims),
    },
    _count: { eleveId: true },
  });

  const mapPassages = new Map<string, number>();
  for (const p of passagesParEleve) {
    mapPassages.set(p.eleveId, p._count.eleveId);
  }

  // --- 4. Bulletins : moyenne générale la plus récente par élève ---
  // On récupère tous les bulletins des élèves concernés, joints à la période
  // pour pouvoir trier par date de fin de période décroissante.
  const bulletins = await prisma.bulletin.findMany({
    where: {
      tenantId,
      eleveId: { in: ids },
      ...siteFilterForModel("bulletin", claims),
    },
    select: {
      eleveId: true,
      moyenneGenerale: true,
      periode: { select: { dateFin: true } },
    },
  });

  // Indexation : moyenne la plus récente (période avec dateFin la plus
  // tardive) par élève.
  const mapMoyenne = new Map<string, number>();
  const mapDateFin = new Map<string, Date>();
  for (const b of bulletins) {
    if (b.moyenneGenerale == null) continue;
    const dateFinExistante = mapDateFin.get(b.eleveId);
    const dateFinCourante = b.periode.dateFin;
    if (!dateFinExistante || dateFinCourante >= dateFinExistante) {
      mapMoyenne.set(b.eleveId, b.moyenneGenerale);
      mapDateFin.set(b.eleveId, dateFinCourante);
    }
  }

  // --- 5. Construction des points de corrélation ---
  const points: PointCorrelationInfirmerie[] = eleves.map((e) => {
    const nbPassages = mapPassages.get(e.id) ?? 0;
    const moyenneGenerale = mapMoyenne.get(e.id) ?? null;
    return {
      eleveId: e.id,
      nom: e.nom,
      prenom: e.prenom,
      nbPassages,
      moyenneGenerale,
      frequence: classifierFrequence(nbPassages),
    };
  });

  // --- 6. Pearson sur les élèves ayant une moyenne connue ---
  const pointsCorrelables = points.filter((p) => p.moyenneGenerale !== null);
  const x = pointsCorrelables.map((p) => p.nbPassages);
  const y = pointsCorrelables.map((p) => p.moyenneGenerale as number);
  const coefficientPearson = pearson(x, y);

  const echantillon = pointsCorrelables.length;
  const statut = echantillon >= ECHANTILLON_MIN ? "OK" : "DONNEES_INSUFFISANTES";

  // --- 7. Segmentation par fréquence ---
  const frequences: { frequence: FrequenceInfirmerie; min: number; max: number | null }[] = [
    { frequence: "AUCUN", min: 0, max: 0 },
    { frequence: "FAIBLE", min: 1, max: 3 },
    { frequence: "MODERE", min: 4, max: 9 },
    { frequence: "FREQUENT", min: 10, max: null },
  ];

  const groupes: GroupeFrequenceInfirmerie[] = frequences.map((f) => {
    const membres = points.filter((p) => p.frequence === f.frequence);
    const moyennes = membres
      .map((m) => m.moyenneGenerale)
      .filter((v): v is number => v !== null);
    return {
      frequence: f.frequence,
      min: f.min,
      max: f.max,
      effectif: membres.length,
      moyenneGenerale: moyenneOuNull(moyennes),
    };
  });

  return {
    statut,
    coefficientPearson,
    echantillon,
    nbEleves: eleves.length,
    points,
    groupes,
  };
}

// ------------------------------------------------------------
// Analyse 2 — Hotspots incidents par jour/heure (A32)
// ------------------------------------------------------------

/**
 * Identifie les "points chauds" d'incidents : les moments (jour de la
 * semaine × heure) avec le plus d'incidents sur l'année scolaire courante.
 *
 * Pour chaque `Incident`, on extrait le jour de la semaine (`getDay()`,
 * 0 = dimanche) et l'heure (`getHours()`) depuis `Incident.date`. On
 * groupe par couple jour×heure pour identifier les top 5 moments.
 *
 * Si le tenant possède plusieurs sites, les hotspots sont également
 * calculés par site.
 */
export async function identifierHotspotsIncidents(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<HotspotsIncidents> {
  const scope = resolveSiteScope(claims);
  const bornes = await borneAnneeCourante(tenantId);

  // --- 1. Récupération de tous les incidents sur l'année ---
  const incidents = await prisma.incident.findMany({
    where: {
      tenantId,
      ...(bornes
        ? { date: { gte: bornes.debut, lte: bornes.fin } }
        : {}),
      ...siteFilterForModel("incident", claims),
    },
    select: {
      date: true,
      eleve: { select: { siteId: true } },
    },
  });

  if (incidents.length === 0) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      totalIncidents: 0,
      topHotspots: [],
      matrice: [],
      parSite: [],
    };
  }

  // --- 2. Extraction jour × heure et comptage global ---
  // Clé : `${jour}|${heure}`
  const compteurGlobal = new Map<string, number>();

  // Comptage par site : Map<siteId, Map<cle, number>>
  const compteurParSite = new Map<string, Map<string, number>>();

  for (const inc of incidents) {
    const jour = inc.date.getDay();
    const heure = inc.date.getHours();
    const cle = `${jour}|${heure}`;

    compteurGlobal.set(cle, (compteurGlobal.get(cle) ?? 0) + 1);

    const siteId = inc.eleve.siteId ?? "__sans_site__";
    if (!compteurParSite.has(siteId)) {
      compteurParSite.set(siteId, new Map());
    }
    const mapSite = compteurParSite.get(siteId)!;
    mapSite.set(cle, (mapSite.get(cle) ?? 0) + 1);
  }

  // --- 3. Construction de la matrice et des top hotspots globaux ---
  const matrice: HotspotIncident[] = [];
  for (const [cle, nb] of compteurGlobal) {
    const [jourStr, heureStr] = cle.split("|");
    const jour = parseInt(jourStr, 10);
    const heure = parseInt(heureStr, 10);
    matrice.push({
      jour,
      jourLibelle: JOURS_SEMAINE[jour],
      heure,
      nbIncidents: nb,
    });
  }

  // Tri par nombre d'incidents décroissant, puis par jour puis par heure.
  matrice.sort(
    (a, b) =>
      b.nbIncidents - a.nbIncidents || a.jour - b.jour || a.heure - b.heure
  );

  const topHotspots = matrice.slice(0, TOP_HOTSPOTS);

  // --- 4. Hotspots par site (si multi-site) ---
  const parSite: { siteId: string; siteNom: string; topHotspots: HotspotIncident[] }[] = [];

  // On ne calcule par site que si le périmètre inclut plusieurs sites
  // ou si on est en ALL (tout le tenant potentiellement multi-site).
  const sites = await prisma.site.findMany({
    where: {
      tenantId,
      actif: true,
      ...filtreSiteIdColumn(scope),
    },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  for (const site of sites) {
    const mapSite = compteurParSite.get(site.id);
    if (!mapSite) continue;

    const hotspotsSite: HotspotIncident[] = [];
    for (const [cle, nb] of mapSite) {
      const [jourStr, heureStr] = cle.split("|");
      const jour = parseInt(jourStr, 10);
      const heure = parseInt(heureStr, 10);
      hotspotsSite.push({
        jour,
        jourLibelle: JOURS_SEMAINE[jour],
        heure,
        nbIncidents: nb,
      });
    }
    hotspotsSite.sort(
      (a, b) =>
        b.nbIncidents - a.nbIncidents || a.jour - b.jour || a.heure - b.heure
    );

    parSite.push({
      siteId: site.id,
      siteNom: site.nom,
      topHotspots: hotspotsSite.slice(0, TOP_HOTSPOTS),
    });
  }

  return {
    statut: "OK",
    totalIncidents: incidents.length,
    topHotspots,
    matrice,
    parSite,
  };
}

// ------------------------------------------------------------
// Analyse 3 — Efficacité des entretiens conseiller (A33)
// ------------------------------------------------------------

/**
 * Analyse l'efficacité des entretiens conseiller/CPE sur l'année scolaire
 * courante :
 *
 *  - Taux de réalisation = COUNT(statut=REALISE) / COUNT(total non annulé).
 *  - Taux de suivi = COUNT(statut=REALISE avec suivi non null) / COUNT(REALISE).
 *  - Délai moyen entre la planification (createdAt) et la réalisation (date).
 *
 * Les résultats sont détaillés par motif (absences répétées, difficultés
 * familiales, orientation…).
 */
export async function analyserEfficaciteEntretiens(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<EfficaciteEntretiens> {
  const bornes = await borneAnneeCourante(tenantId);

  // --- 1. Récupération de tous les entretiens sur l'année ---
  const entretiens = await prisma.entretienConseiller.findMany({
    where: {
      tenantId,
      ...(bornes
        ? { date: { gte: bornes.debut, lte: bornes.fin } }
        : {}),
      ...siteFilterForModel("entretienConseiller", claims),
    },
    select: {
      id: true,
      motif: true,
      statut: true,
      suivi: true,
      date: true,
      createdAt: true,
    },
  });

  if (entretiens.length === 0) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      total: 0,
      planifies: 0,
      realises: 0,
      avecSuivi: 0,
      tauxRealisation: 0,
      tauxSuivi: 0,
      delaiMoyenJours: null,
      parMotif: [],
    };
  }

  const JOUR_MS = 86_400_000;

  // --- 2. Agrégats globaux ---
  const total = entretiens.length;
  const planifies = entretiens.filter((e) => e.statut === "PLANIFIE").length;
  const realises = entretiens.filter((e) => e.statut === "REALISE").length;
  const avecSuivi = entretiens.filter(
    (e) => e.statut === "REALISE" && e.suivi != null && e.suivi.trim() !== ""
  ).length;

  // Taux de réalisation = realises / (realises + planifies)
  const denomRealisation = realises + planifies;
  const tauxRealisation =
    denomRealisation > 0 ? arrondi2(realises / denomRealisation) : 0;

  // Taux de suivi = avecSuivi / realises
  const tauxSuivi = realises > 0 ? arrondi2(avecSuivi / realises) : 0;

  // Délai moyen entre createdAt (planification) et date (réalisation) pour
  // les entretiens réalisés.
  const delais: number[] = [];
  for (const e of entretiens) {
    if (e.statut !== "REALISE") continue;
    const delaiMs = e.date.getTime() - e.createdAt.getTime();
    if (delaiMs >= 0) {
      delais.push(delaiMs / JOUR_MS);
    }
  }
  const delaiMoyenJours = moyenneOuNull(delais);

  // --- 3. Détail par motif ---
  const motifsMap = new Map<string, typeof entretiens>();
  for (const e of entretiens) {
    if (!motifsMap.has(e.motif)) {
      motifsMap.set(e.motif, []);
    }
    motifsMap.get(e.motif)!.push(e);
  }

  const parMotif: ResultatMotifEntretien[] = [];
  for (const [motif, liste] of motifsMap) {
    const mTotal = liste.length;
    const mPlanifies = liste.filter((e) => e.statut === "PLANIFIE").length;
    const mRealises = liste.filter((e) => e.statut === "REALISE").length;
    const mAvecSuivi = liste.filter(
      (e) => e.statut === "REALISE" && e.suivi != null && e.suivi.trim() !== ""
    ).length;

    const mDenomRealisation = mRealises + mPlanifies;
    const mTauxRealisation =
      mDenomRealisation > 0 ? arrondi2(mRealises / mDenomRealisation) : 0;
    const mTauxSuivi = mRealises > 0 ? arrondi2(mAvecSuivi / mRealises) : 0;

    const mDelais: number[] = [];
    for (const e of liste) {
      if (e.statut !== "REALISE") continue;
      const delaiMs = e.date.getTime() - e.createdAt.getTime();
      if (delaiMs >= 0) {
        mDelais.push(delaiMs / JOUR_MS);
      }
    }

    parMotif.push({
      motif,
      total: mTotal,
      planifies: mPlanifies,
      realises: mRealises,
      avecSuivi: mAvecSuivi,
      tauxRealisation: mTauxRealisation,
      tauxSuivi: mTauxSuivi,
      delaiMoyenJours: moyenneOuNull(mDelais),
    });
  }

  // Tri par total décroissant.
  parMotif.sort((a, b) => b.total - a.total);

  return {
    statut: "OK",
    total,
    planifies,
    realises,
    avecSuivi,
    tauxRealisation,
    tauxSuivi,
    delaiMoyenJours: delaiMoyenJours != null ? arrondi1(delaiMoyenJours) : null,
    parMotif,
  };
}

// ------------------------------------------------------------
// Analyse 4 — Taux de notification des parents suite à incident (A34)
// ------------------------------------------------------------

/**
 * Calcule le taux de notification des parents suite à un incident.
 *
 * Pour chaque `Incident`, on vérifie si au moins une `Sanction` associée a
 * `parentNotifie = true`. Le taux de notification =
 * COUNT(incidents avec au moins une sanction notifiée) / COUNT(total incidents).
 *
 * Les résultats sont détaillés par type d'incident, par gravité et par site.
 */
export async function analyserNotificationParents(
  tenantId: string,
  claims: SessionSiteClaims
): Promise<NotificationParents> {
  const scope = resolveSiteScope(claims);
  const bornes = await borneAnneeCourante(tenantId);

  // --- 1. Récupération de tous les incidents avec leurs sanctions ---
  const incidents = await prisma.incident.findMany({
    where: {
      tenantId,
      ...(bornes
        ? { date: { gte: bornes.debut, lte: bornes.fin } }
        : {}),
      ...siteFilterForModel("incident", claims),
    },
    select: {
      id: true,
      type: true,
      gravite: true,
      eleve: { select: { siteId: true } },
      sanctions: { select: { parentNotifie: true } },
    },
  });

  if (incidents.length === 0) {
    return {
      statut: "DONNEES_INSUFFISANTES",
      total: 0,
      notifie: 0,
      tauxNotification: 0,
      parType: [],
      parGravite: [],
      parSite: [],
    };
  }

  // --- 2. Calcul du statut de notification par incident ---
  // Un incident est "notifié" si au moins une sanction a parentNotifie=true.
  const incidentsNotifies = incidents.map((inc) => {
    const notifie = inc.sanctions.some((s) => s.parentNotifie);
    return {
      id: inc.id,
      type: inc.type,
      gravite: inc.gravite,
      siteId: inc.eleve.siteId,
      notifie,
    };
  });

  const total = incidents.length;
  const notifie = incidentsNotifies.filter((i) => i.notifie).length;
  const tauxNotification = total > 0 ? arrondi2(notifie / total) : 0;

  // --- 3. Agrégation par type d'incident ---
  const parTypeMap = new Map<string, { total: number; notifie: number }>();
  for (const inc of incidentsNotifies) {
    const typeKey = inc.type;
    if (!parTypeMap.has(typeKey)) {
      parTypeMap.set(typeKey, { total: 0, notifie: 0 });
    }
    const entry = parTypeMap.get(typeKey)!;
    entry.total += 1;
    if (inc.notifie) entry.notifie += 1;
  }

  const parType: ResultatNotificationParType[] = [];
  for (const [type, { total: t, notifie: n }] of parTypeMap) {
    parType.push({
      type,
      total: t,
      notifie: n,
      tauxNotification: t > 0 ? arrondi2(n / t) : 0,
    });
  }
  parType.sort((a, b) => b.total - a.total);

  // --- 4. Agrégation par gravité ---
  const parGraviteMap = new Map<number, { total: number; notifie: number }>();
  for (const inc of incidentsNotifies) {
    if (!parGraviteMap.has(inc.gravite)) {
      parGraviteMap.set(inc.gravite, { total: 0, notifie: 0 });
    }
    const entry = parGraviteMap.get(inc.gravite)!;
    entry.total += 1;
    if (inc.notifie) entry.notifie += 1;
  }

  const parGravite: ResultatNotificationParGravite[] = [];
  for (const [gravite, { total: t, notifie: n }] of parGraviteMap) {
    parGravite.push({
      gravite,
      total: t,
      notifie: n,
      tauxNotification: t > 0 ? arrondi2(n / t) : 0,
    });
  }
  parGravite.sort((a, b) => a.gravite - b.gravite);

  // --- 5. Agrégation par site ---
  const parSiteMap = new Map<string, { total: number; notifie: number }>();
  for (const inc of incidentsNotifies) {
    const siteKey = inc.siteId ?? "__sans_site__";
    if (!parSiteMap.has(siteKey)) {
      parSiteMap.set(siteKey, { total: 0, notifie: 0 });
    }
    const entry = parSiteMap.get(siteKey)!;
    entry.total += 1;
    if (inc.notifie) entry.notifie += 1;
  }

  // Résolution des noms de sites pour les clés connues.
  const siteIdsConnus = [...parSiteMap.keys()].filter(
    (k) => k !== "__sans_site__"
  );
  const sites = siteIdsConnus.length > 0
    ? await prisma.site.findMany({
        where: {
          tenantId,
          ...filtreSiteIdColumn(scope),
          id: { in: siteIdsConnus },
        },
        select: { id: true, nom: true },
      })
    : [];

  const siteNomMap = new Map<string, string>();
  for (const s of sites) {
    siteNomMap.set(s.id, s.nom);
  }

  const parSite: ResultatNotificationParSite[] = [];
  for (const [siteKey, { total: t, notifie: n }] of parSiteMap) {
    const isSansSite = siteKey === "__sans_site__";
    parSite.push({
      siteId: isSansSite ? null : siteKey,
      siteNom: isSansSite ? null : (siteNomMap.get(siteKey) ?? "Site inconnu"),
      total: t,
      notifie: n,
      tauxNotification: t > 0 ? arrondi2(n / t) : 0,
    });
  }
  parSite.sort((a, b) => b.total - a.total);

  return {
    statut: "OK",
    total,
    notifie,
    tauxNotification,
    parType,
    parGravite,
    parSite,
  };
}
