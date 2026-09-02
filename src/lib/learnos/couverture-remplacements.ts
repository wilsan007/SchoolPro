/**
 * EcolPro / LEARNOS — Couverture des remplacements
 * =================================================
 *
 * ASSURER LA CONTINUITÉ PÉDAGOGIQUE MALGRÉ LES ABSENCES
 * ----------------------------------------------------
 * Quand un enseignant est absent, l'enjeu n'est pas seulement de trouver un
 * remplaçant : c'est de prioriser les cours où l'absence fait le plus de dégâts.
 * Ce module croise les absences du personnel, l'emploi du temps, les
 * remplacements validés et le graphe de prérequis pour répondre à quatre
 * questions opérationnelles :
 *
 *  A20 — Quel taux d'absences est effectivement couvert par un remplacement ?
 *  A21 — Quels créneaux restent orphelins (absence sans remplaçant) ?
 *  I15 — Quels remplacements sont critiques (chapitre aux prérequis bloquants) ?
 *  I17 — Quelles salles sont en goulot d'étranglement (> 80 % d'occupation) ?
 *
 * Aucune intuition, aucun modèle : des comptages, des ratios et des jointures
 * sur des tables qui existent déjà dans le schéma.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  resolveSiteScope,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import type { Jour, MasteryStatus, StatutRemplacement } from "@prisma/client";
import { getDemoNow } from "@/lib/demo-now";
import { anneeActiveLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Seuil d'occupation au-delà duquel une salle est considérée comme goulot. */
const SEUIL_OCCUPATION_GOULOT = 0.8;

/** Statuts de remplacement qui couvrent effectivement une absence. */
const STATUTS_REMPLACEMENT_VALIDES: StatutRemplacement[] = [
  "VALIDE",
  "EFFECTUE",
];

/** Statuts de maîtrise signalant un prérequis non maîtrisé (bloquant). */
const STATUTS_MASTERY_BLOQUANT: MasteryStatus[] = ["EMERGING", "DEVELOPING"];

/** Nombre de semaines pour le calcul de la tendance. */
const NB_SEMAINES_TENDANCE = 4;

/** Durée par défaut (en jours) de la fenêtre d'analyse des absences. */
const FENETRE_DEFAUT_JOURS = 28;

/** Mapping getDay() (0 = dimanche) → enum Jour du schéma. */
const JOUR_PAR_INDEX: Jour[] = [
  "DIMANCHE",
  "LUNDI",
  "MARDI",
  "MERCREDI",
  "JEUDI",
  "VENDREDI",
  "SAMEDI",
];

/** Ordre canonique des jours pour le tri (dimanche → samedi). */
const ORDRE_JOUR: Record<Jour, number> = {
  DIMANCHE: 0,
  LUNDI: 1,
  MARDI: 2,
  MERCREDI: 3,
  JEUDI: 4,
  VENDREDI: 5,
  SAMEDI: 6,
};

// ------------------------------------------------------------
// Types exportés
// ------------------------------------------------------------

/**
 * A20 — Taux de couverture des remplacements.
 *
 * Rapport entre le nombre de remplacements validés et le nombre d'absences
 * du personnel. Décliné par semaine, par site et par matière, avec une
 * tendance sur les 4 dernières semaines.
 */
export interface TauxCouverture {
  /** Taux global = remplacements validés / absences. 0 si aucune absence. */
  tauxGlobal: number;
  totalAbsences: number;
  totalRemplacements: number;
  /** Taux par semaine ISO, trié chronologiquement. */
  parSemaine: {
    semaine: string; // "2025-W03"
    absences: number;
    remplacements: number;
    taux: number;
  }[];
  /** Taux par site. Les absences sont attribuées via les sites de l'enseignant. */
  parSite: {
    siteId: string;
    siteNom: string;
    absences: number;
    remplacements: number;
    taux: number;
  }[];
  /** Taux par matière. Les absences sont attribuées via l'emploi du temps. */
  parMatiere: {
    matiereId: string;
    matiereNom: string;
    absences: number;
    remplacements: number;
    taux: number;
  }[];
  /**
   * Pente de la régression linéaire sur les NB_SEMAINES_TENDANCE dernières
   * semaines. Positive = la couverture s'améliore, négative = elle se dégrade.
   */
  tendance4Semaines: number;
  /** `true` si aucune absence du personnel dans la fenêtre. */
  donneesInsuffisantes: boolean;
}

/**
 * A21 — Créneaux orphelins par jour / heure.
 *
 * Un créneau est orphelin quand l'enseignant titulaire est absent
 * (`AbsencePersonnel` ce jour-là) et qu'aucun `RemplacementCours` validé
 * n'existe pour ce `emploiTempsId` à cette date.
 */
export interface CreneauxOrphelins {
  totalOrphelins: number;
  /** Groupé par jour + heureDebut, trié par jour puis heure. */
  parJourHeure: {
    jour: Jour;
    heureDebut: string;
    count: number;
  }[];
  /** Groupé par jour uniquement, trié par ordre de la semaine. */
  parJour: {
    jour: Jour;
    count: number;
  }[];
  /** `true` si aucun créneau orphelin dans la fenêtre. */
  donneesInsuffisantes: boolean;
}

/**
 * I15 — Allocation optimale des remplaçants.
 *
 * Pour chaque remplacement nécessaire (créneau orphelin), on vérifie si le
 * chapitre en cours est critique : ses compétences ont-elles des prérequis
 * non maîtrisés (`masteryStatus` EMERGING / DEVELOPING) ? Si oui, le
 * remplacement est prioritaire.
 */
export interface PriorisationRemplacement {
  /** Remplacements nécessaires triés : critiques d'abord, puis par date. */
  remplacements: {
    emploiTempsId: string;
    classeId: string;
    classeNom: string;
    matiereId: string;
    matiereNom: string;
    enseignantAbsentId: string;
    dateAbsence: Date;
    jour: Jour;
    heureDebut: string;
    /** `true` si le chapitre en cours a des prérequis non maîtrisés. */
    critique: boolean;
    /** Description lisible de la raison de criticité, ou `null`. */
    raisonCritique: string | null;
    /** 1 = critique, 0 = normal. */
    priorite: number;
  }[];
  nbCritiques: number;
  nbTotal: number;
  /** `true` si aucun créneau orphelin à prioriser. */
  donneesInsuffisantes: boolean;
}

/**
 * I17 — Salles goulot.
 *
 * Pour chaque salle : nombre de créneaux l'utilisant / nombre total de
 * créneaux distincts (jour × heureDebut). Les salles au-delà de 80 %
 * d'occupation sont des goulots.
 */
export interface SallesGoulot {
  salles: {
    salleId: string;
    nom: string;
    siteId: string | null;
    nbCreneaux: number;
    totalCreneaux: number;
    tauxOccupation: number;
    goulot: boolean;
  }[];
  /** Nombre total de créneaux distincts (jour × heureDebut). */
  totalCreneaux: number;
  /** `true` si aucune salle ou aucun créneau d'emploi du temps. */
  donneesInsuffisantes: boolean;
}

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

/** Numéro de semaine ISO au format "2025-W03". */
function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Jour de la semaine (enum Jour) à partir d'une date. */
function jourFromDate(date: Date): Jour {
  return JOUR_PAR_INDEX[date.getDay()];
}

/** Clé de date au format "YYYY-MM-DD" pour comparer des dates sans l'heure. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Pente de la régression linéaire sur une série de valeurs.
 * Retourne 0 si moins de 2 points ou variance nulle.
 */
function tendanceLineaire(valeurs: number[]): number {
  const n = valeurs.length;
  if (n < 2) return 0;

  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = (n - 1) / 2;
  const my = valeurs.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (valeurs[i] - my);
    den += (xs[i] - mx) ** 2;
  }

  return den === 0 ? 0 : num / den;
}

/**
 * Vérifie si un créneau horaire [debut1, fin1[ chevauche une absence
 * [debut2, fin2[. Si l'absence couvre la journée entière (debut2 = null),
 * le chevauchement est total.
 */
function chevauchementTemps(
  debut1: string,
  fin1: string,
  debut2: string | null,
  fin2: string | null
): boolean {
  if (debut2 == null) return true; // absence sur la journée entière
  const fin2Effective = fin2 ?? "23:59";
  return debut1 < fin2Effective && debut2 < fin1;
}

// ------------------------------------------------------------
// Helper interne — identification des créneaux orphelins (bruts)
// ------------------------------------------------------------

interface CreneauOrphelinRaw {
  emploiTempsId: string;
  classeId: string;
  matiereId: string;
  enseignantId: string;
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  dateAbsence: Date;
  absenceId: string;
}

/**
 * Identifie les créneaux orphelins : emplois du temps dont l'enseignant est
 * absent à une date donnée, sans remplacement validé pour ce créneau.
 *
 * Un `EmploiTemps` est orphelin si :
 *  1. L'enseignant a une `AbsencePersonnel` ce jour-là (jour de la semaine
 *     correspondant + chevauchement horaire).
 *  2. Aucun `RemplacementCours` avec statut VALIDE/EFFECTUE n'existe pour
 *     ce `emploiTempsId` à cette date.
 */
async function findCreneauxOrphelins(
  tenantId: string,
  claims: SessionSiteClaims,
  dateDebut?: Date,
  dateFin?: Date
): Promise<CreneauOrphelinRaw[]> {
  // — Bornes de la fenêtre d'analyse (28 derniers jours par défaut) —
  const fin = dateFin ?? await getDemoNow();
  const debut = dateDebut ?? new Date(fin.getTime() - FENETRE_DEFAUT_JOURS * 86400000);
  const anneeCourante = await anneeActiveLibelle(tenantId);

  // 1. Récupérer les absences du personnel dans la fenêtre
  const absences = await prisma.absencePersonnel.findMany({
    where: {
      tenantId,
      date: { gte: debut, lte: fin },
      ...siteFilterForModel("absencePersonnel", claims),
    },
    select: {
      id: true,
      enseignantId: true,
      date: true,
      heureDebut: true,
      heureFin: true,
    },
  });

  if (absences.length === 0) return [];

  // 2. Récupérer les emplois du temps des enseignants absents
  const enseignantIds = [...new Set(absences.map((a) => a.enseignantId))];
  const emplois = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      enseignantId: { in: enseignantIds },
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("emploiTemps", claims),
    },
    select: {
      id: true,
      classeId: true,
      matiereId: true,
      enseignantId: true,
      jour: true,
      heureDebut: true,
      heureFin: true,
    },
  });

  if (emplois.length === 0) return [];

  // 3. Récupérer les remplacements validés pour ces emplois du temps
  const emploiIds = emplois.map((e) => e.id);
  const remplacements = await prisma.remplacementCours.findMany({
    where: {
      tenantId,
      emploiTempsId: { in: emploiIds },
      statut: { in: STATUTS_REMPLACEMENT_VALIDES },
      date: { gte: debut, lte: fin },
      ...siteFilterForModel("remplacementCours", claims),
    },
    select: {
      emploiTempsId: true,
      date: true,
    },
  });

  // Index : (emploiTempsId|date) → remplacement validé
  const remplacementsParEmploiDate = new Set<string>();
  for (const r of remplacements) {
    if (r.emploiTempsId) {
      remplacementsParEmploiDate.add(`${r.emploiTempsId}|${dateKey(r.date)}`);
    }
  }

  // 4. Indexer les emplois par enseignant
  const emploisParEnseignant = new Map<string, typeof emplois>();
  for (const e of emplois) {
    const key = e.enseignantId!;
    const arr = emploisParEnseignant.get(key) ?? [];
    arr.push(e);
    emploisParEnseignant.set(key, arr);
  }

  // 5. Pour chaque absence, trouver les créneaux orphelins
  const orphelins: CreneauOrphelinRaw[] = [];
  for (const absence of absences) {
    const jourAbsence = jourFromDate(absence.date);
    const dKey = dateKey(absence.date);
    const emploisEnseignant =
      emploisParEnseignant.get(absence.enseignantId) ?? [];

    for (const emploi of emploisEnseignant) {
      // Le jour de la semaine doit correspondre
      if (emploi.jour !== jourAbsence) continue;

      // Vérifier le chevauchement horaire
      if (
        !chevauchementTemps(
          emploi.heureDebut,
          emploi.heureFin,
          absence.heureDebut,
          absence.heureFin
        )
      ) {
        continue;
      }

      // Vérifier s'il existe un remplacement validé pour ce créneau à cette date
      const key = `${emploi.id}|${dKey}`;
      if (remplacementsParEmploiDate.has(key)) continue;

      orphelins.push({
        emploiTempsId: emploi.id,
        classeId: emploi.classeId,
        matiereId: emploi.matiereId,
        enseignantId: absence.enseignantId,
        jour: emploi.jour,
        heureDebut: emploi.heureDebut,
        heureFin: emploi.heureFin,
        dateAbsence: absence.date,
        absenceId: absence.id,
      });
    }
  }

  return orphelins;
}

// ------------------------------------------------------------
// A20 — Taux de couverture des remplacements
// ------------------------------------------------------------

/**
 * Calcule le taux de couverture des remplacements : rapport entre le nombre
 * de remplacements validés (VALIDE / EFFECTUE) et le nombre d'absences du
 * personnel.
 *
 * @param dateDebut  Optionnel — début de la fenêtre (28 jours avant `dateFin` par défaut).
 * @param dateFin    Optionnel — fin de la fenêtre (maintenant par défaut).
 */
export async function calculerTauxCouverture(
  tenantId: string,
  claims: SessionSiteClaims,
  dateDebut?: Date,
  dateFin?: Date
): Promise<TauxCouverture> {
  const fin = dateFin ?? await getDemoNow();
  const debut =
    dateDebut ?? new Date(fin.getTime() - FENETRE_DEFAUT_JOURS * 86400000);
  const anneeCourante = await anneeActiveLibelle(tenantId);

  // — Absences du personnel dans la fenêtre —
  const absences = await prisma.absencePersonnel.findMany({
    where: {
      tenantId,
      date: { gte: debut, lte: fin },
      ...siteFilterForModel("absencePersonnel", claims),
    },
    select: {
      id: true,
      enseignantId: true,
      date: true,
    },
  });

  // — Remplacements validés dans la fenêtre —
  const remplacements = await prisma.remplacementCours.findMany({
    where: {
      tenantId,
      statut: { in: STATUTS_REMPLACEMENT_VALIDES },
      date: { gte: debut, lte: fin },
      ...siteFilterForModel("remplacementCours", claims),
    },
    select: {
      id: true,
      siteId: true,
      matiereId: true,
      date: true,
    },
  });

  const totalAbsences = absences.length;
  const totalRemplacements = remplacements.length;
  const tauxGlobal =
    totalAbsences > 0 ? totalRemplacements / totalAbsences : 0;

  // — Par semaine ISO —
  const absencesParSemaine = new Map<string, number>();
  for (const a of absences) {
    const s = isoWeek(a.date);
    absencesParSemaine.set(s, (absencesParSemaine.get(s) ?? 0) + 1);
  }
  const remplacementsParSemaine = new Map<string, number>();
  for (const r of remplacements) {
    const s = isoWeek(r.date);
    remplacementsParSemaine.set(s, (remplacementsParSemaine.get(s) ?? 0) + 1);
  }

  const toutesSemaines = [
    ...new Set([...absencesParSemaine.keys(), ...remplacementsParSemaine.keys()]),
  ].sort();

  const parSemaine = toutesSemaines.map((s) => {
    const nbAbs = absencesParSemaine.get(s) ?? 0;
    const nbRem = remplacementsParSemaine.get(s) ?? 0;
    return {
      semaine: s,
      absences: nbAbs,
      remplacements: nbRem,
      taux: nbAbs > 0 ? nbRem / nbAbs : 0,
    };
  });

  // Tendance sur les 4 dernières semaines
  const dernieresSemaines = parSemaine.slice(-NB_SEMAINES_TENDANCE);
  const tendance4Semaines = tendanceLineaire(
    dernieresSemaines.map((s) => s.taux)
  );

  // — Par site —
  // Les absences sont attribuées aux sites via EnseignantSite.
  // Les remplacements ont un siteId direct.
  const scope = resolveSiteScope(claims);
  const authorizedSiteIds =
    scope.kind === "SITES" ? scope.siteIds : null;

  const enseignantIds = [...new Set(absences.map((a) => a.enseignantId))];
  const enseignantSites = enseignantIds.length
    ? await prisma.enseignantSite.findMany({
        where: {
          enseignantId: { in: enseignantIds },
          ...(authorizedSiteIds
            ? { siteId: { in: authorizedSiteIds } }
            : {}),
          ...siteFilterForModel("enseignantSite", claims),
        },
        select: { enseignantId: true, siteId: true },
      })
    : [];

  // Map enseignantId → siteIds
  const sitesParEnseignant = new Map<string, string[]>();
  for (const es of enseignantSites) {
    const arr = sitesParEnseignant.get(es.enseignantId) ?? [];
    arr.push(es.siteId);
    sitesParEnseignant.set(es.enseignantId, arr);
  }

  // Compter les absences par site
  const absencesParSite = new Map<string, number>();
  for (const a of absences) {
    const siteIds = sitesParEnseignant.get(a.enseignantId) ?? [];
    for (const sid of siteIds) {
      absencesParSite.set(sid, (absencesParSite.get(sid) ?? 0) + 1);
    }
  }

  // Compter les remplacements par site
  const remplacementsParSite = new Map<string, number>();
  for (const r of remplacements) {
    if (r.siteId) {
      remplacementsParSite.set(
        r.siteId,
        (remplacementsParSite.get(r.siteId) ?? 0) + 1
      );
    }
  }

  // Récupérer les noms des sites
  const siteIdsPourNoms = [
    ...new Set([
      ...absencesParSite.keys(),
      ...remplacementsParSite.keys(),
    ]),
  ];
  const sites = siteIdsPourNoms.length
    ? await prisma.site.findMany({
        where: {
          id: { in: siteIdsPourNoms },
          tenantId,
        },
        select: { id: true, nom: true },
      })
    : [];
  const siteNom = new Map(sites.map((s) => [s.id, s.nom]));

  const parSite = siteIdsPourNoms.map((sid) => {
    const nbAbs = absencesParSite.get(sid) ?? 0;
    const nbRem = remplacementsParSite.get(sid) ?? 0;
    return {
      siteId: sid,
      siteNom: siteNom.get(sid) ?? "—",
      absences: nbAbs,
      remplacements: nbRem,
      taux: nbAbs > 0 ? nbRem / nbAbs : 0,
    };
  });
  parSite.sort((a, b) => a.taux - b.taux); // taux le plus bas d'abord (couverture la plus faible)

  // — Par matière —
  // Les absences sont attribuées aux matières via l'emploi du temps :
  // pour chaque absence, on cherche les EmploiTemps de l'enseignant ce
  // jour-là et on récupère les matiereId.
  const emplois = enseignantIds.length
    ? await prisma.emploiTemps.findMany({
        where: {
          tenantId,
          enseignantId: { in: enseignantIds },
          ...(anneeCourante ? { annee: anneeCourante } : {}),
          ...siteFilterForModel("emploiTemps", claims),
        },
        select: {
          enseignantId: true,
          jour: true,
          matiereId: true,
        },
      })
    : [];

  // Map (enseignantId, jour) → matiereIds
  const matieresParEnseignantJour = new Map<string, string[]>();
  for (const e of emplois) {
    if (!e.enseignantId) continue;
    const key = `${e.enseignantId}|${e.jour}`;
    const arr = matieresParEnseignantJour.get(key) ?? [];
    arr.push(e.matiereId);
    matieresParEnseignantJour.set(key, arr);
  }

  // Compter les absences par matière
  const absencesParMatiere = new Map<string, number>();
  for (const a of absences) {
    const jour = jourFromDate(a.date);
    const matiereIds =
      matieresParEnseignantJour.get(`${a.enseignantId}|${jour}`) ?? [];
    for (const mid of new Set(matiereIds)) {
      absencesParMatiere.set(mid, (absencesParMatiere.get(mid) ?? 0) + 1);
    }
  }

  // Compter les remplacements par matière
  const remplacementsParMatiere = new Map<string, number>();
  for (const r of remplacements) {
    remplacementsParMatiere.set(
      r.matiereId,
      (remplacementsParMatiere.get(r.matiereId) ?? 0) + 1
    );
  }

  // Récupérer les noms des matières
  const matiereIdsPourNoms = [
    ...new Set([
      ...absencesParMatiere.keys(),
      ...remplacementsParMatiere.keys(),
    ]),
  ];
  const matieres = matiereIdsPourNoms.length
    ? await prisma.matiere.findMany({
        where: { id: { in: matiereIdsPourNoms }, tenantId, ...siteFilterForModel("matiere", claims) },
        select: { id: true, nom: true },
      })
    : [];
  const matiereNom = new Map(matieres.map((m) => [m.id, m.nom]));

  const parMatiere = matiereIdsPourNoms.map((mid) => {
    const nbAbs = absencesParMatiere.get(mid) ?? 0;
    const nbRem = remplacementsParMatiere.get(mid) ?? 0;
    return {
      matiereId: mid,
      matiereNom: matiereNom.get(mid) ?? "—",
      absences: nbAbs,
      remplacements: nbRem,
      taux: nbAbs > 0 ? nbRem / nbAbs : 0,
    };
  });
  parMatiere.sort((a, b) => a.taux - b.taux); // taux le plus bas d'abord

  return {
    tauxGlobal,
    totalAbsences,
    totalRemplacements,
    parSemaine,
    parSite,
    parMatiere,
    tendance4Semaines,
    donneesInsuffisantes: totalAbsences === 0,
  };
}

// ------------------------------------------------------------
// A21 — Créneaux orphelins par jour / heure
// ------------------------------------------------------------

/**
 * Identifie les créneaux orphelins : emplois du temps dont l'enseignant est
 * absent et sans remplacement validé. Les résultats sont groupés par jour de
 * la semaine (DIMANCHE → SAMEDI) et heure de début.
 *
 * @param dateDebut  Optionnel — début de la fenêtre (28 jours avant `dateFin` par défaut).
 * @param dateFin    Optionnel — fin de la fenêtre (maintenant par défaut).
 */
export async function identifierCreneauxOrphelins(
  tenantId: string,
  claims: SessionSiteClaims,
  dateDebut?: Date,
  dateFin?: Date
): Promise<CreneauxOrphelins> {
  const orphelins = await findCreneauxOrphelins(
    tenantId,
    claims,
    dateDebut,
    dateFin
  );

  // — Grouper par (jour, heureDebut) —
  const parJourHeureMap = new Map<string, { jour: Jour; heureDebut: string; count: number }>();
  for (const o of orphelins) {
    const key = `${o.jour}|${o.heureDebut}`;
    const entry = parJourHeureMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      parJourHeureMap.set(key, {
        jour: o.jour,
        heureDebut: o.heureDebut,
        count: 1,
      });
    }
  }

  const parJourHeure = Array.from(parJourHeureMap.values()).sort((a, b) => {
    const ordreJour = ORDRE_JOUR[a.jour] - ORDRE_JOUR[b.jour];
    if (ordreJour !== 0) return ordreJour;
    return a.heureDebut.localeCompare(b.heureDebut);
  });

  // — Grouper par jour uniquement —
  const parJourMap = new Map<Jour, number>();
  for (const o of orphelins) {
    parJourMap.set(o.jour, (parJourMap.get(o.jour) ?? 0) + 1);
  }

  const parJour = Array.from(parJourMap.entries())
    .map(([jour, count]) => ({ jour, count }))
    .sort((a, b) => ORDRE_JOUR[a.jour] - ORDRE_JOUR[b.jour]);

  return {
    totalOrphelins: orphelins.length,
    parJourHeure,
    parJour,
    donneesInsuffisantes: orphelins.length === 0,
  };
}

// ------------------------------------------------------------
// I15 — Allocation optimale des remplaçants
// ------------------------------------------------------------

/**
 * Priorise les remplacements nécessaires en vérifiant la criticité du
 * chapitre en cours.
 *
 * Un remplacement est critique lorsque le `PlanificationChapitre` en cours
 * (statut = "EN_COURS") pour la classe et la matière concernées a des
 * compétences dont les prérequis ne sont pas maîtrisés par les élèves
 * (`StudentLearningProfile.masteryStatus` = EMERGING / DEVELOPING).
 *
 * @param dateDebut  Optionnel — début de la fenêtre (28 jours avant `dateFin` par défaut).
 * @param dateFin    Optionnel — fin de la fenêtre (maintenant par défaut).
 */
export async function prioriserRemplacements(
  tenantId: string,
  claims: SessionSiteClaims,
  dateDebut?: Date,
  dateFin?: Date
): Promise<PriorisationRemplacement> {
  const anneeCourante = await anneeActiveLibelle(tenantId);

  // 1. Identifier les créneaux orphelins (remplacements nécessaires)
  const orphelins = await findCreneauxOrphelins(
    tenantId,
    claims,
    dateDebut,
    dateFin
  );

  if (orphelins.length === 0) {
    return { remplacements: [], nbCritiques: 0, nbTotal: 0, donneesInsuffisantes: true };
  }

  // 2. Récupérer les noms des classes et matières
  const classeIds = [...new Set(orphelins.map((o) => o.classeId))];
  const matiereIds = [...new Set(orphelins.map((o) => o.matiereId))];

  const [classes, matieres] = await Promise.all([
    prisma.classe.findMany({
      where: { id: { in: classeIds }, tenantId, ...(anneeCourante ? { annee: anneeCourante } : {}), ...siteFilterForModel("classe", claims) },
      select: { id: true, nom: true },
    }),
    prisma.matiere.findMany({
      where: { id: { in: matiereIds }, tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true },
    }),
  ]);

  const classeNom = new Map(classes.map((c) => [c.id, c.nom]));
  const matiereNom = new Map(matieres.map((m) => [m.id, m.nom]));

  // 3. Récupérer les PlanificationChapitre en cours pour ces classes/matieres
  //    avec le chapitre → compétences → prérequis
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      statut: "EN_COURS",
      ...siteFilterForModel("planificationChapitre", claims),
      OR: [
        { classeId: { in: classeIds } },
        { classeId: null },
      ],
      chapitre: {
        matiereId: { in: matiereIds },
      },
    },
    select: {
      classeId: true,
      chapitre: {
        select: {
          id: true,
          nom: true,
          matiereId: true,
          competences: {
            select: {
              id: true,
              prerequis: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  // Map (classeId, matiereId) → { chapitreNom, prerequisIds }
  // Une planification avec classeId = null s'applique à toutes les classes.
  const planParClasseMatiere = new Map<
    string,
    { chapitreNom: string; prerequisIds: string[] }
  >();

  for (const p of planifications) {
    const matiereId = p.chapitre.matiereId;
    const prerequisIds: string[] = [];
    for (const comp of p.chapitre.competences) {
      for (const prereq of comp.prerequis) {
        prerequisIds.push(prereq.id);
      }
    }
    // Enregistrer sous la classe spécifique si renseignée
    if (p.classeId) {
      planParClasseMatiere.set(`${p.classeId}|${matiereId}`, {
        chapitreNom: p.chapitre.nom,
        prerequisIds,
      });
    }
    // Enregistrer sous null (s'applique à toutes les classes du niveau)
    planParClasseMatiere.set(`null|${matiereId}`, {
      chapitreNom: p.chapitre.nom,
      prerequisIds,
    });
  }

  // 4. Collecter tous les IDs de compétences prérequis et vérifier
  //    lesquels ont des StudentLearningProfile avec masteryStatus bloquant
  const tousPrerequisIds = [
    ...new Set(
      Array.from(planParClasseMatiere.values()).flatMap((v) => v.prerequisIds)
    ),
  ];

  // Map competenceId → { nbProfilsBloquants, nbElevesDistincts }
  const profilsBloquantsParCompetence = new Map<
    string,
    { nbProfils: number; nbEleves: number }
  >();

  if (tousPrerequisIds.length > 0) {
    const profils = await prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        competenceId: { in: tousPrerequisIds },
        masteryStatus: { in: STATUTS_MASTERY_BLOQUANT },
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      select: {
        competenceId: true,
        eleveId: true,
      },
    });

    const elevesParCompetence = new Map<
      string,
      { nbProfils: number; eleves: Set<string> }
    >();
    for (const p of profils) {
      const entry = elevesParCompetence.get(p.competenceId) ?? {
        nbProfils: 0,
        eleves: new Set<string>(),
      };
      entry.nbProfils++;
      entry.eleves.add(p.eleveId);
      elevesParCompetence.set(p.competenceId, entry);
    }

    for (const [compId, entry] of elevesParCompetence) {
      profilsBloquantsParCompetence.set(compId, {
        nbProfils: entry.nbProfils,
        nbEleves: entry.eleves.size,
      });
    }
  }

  // 5. Pour chaque créneau orphelin, déterminer la criticité
  const remplacements = orphelins.map((o) => {
    // Chercher d'abord la planification spécifique à la classe, puis la générique (null)
    const plan =
      planParClasseMatiere.get(`${o.classeId}|${o.matiereId}`) ??
      planParClasseMatiere.get(`null|${o.matiereId}`);

    if (!plan || plan.prerequisIds.length === 0) {
      return {
        emploiTempsId: o.emploiTempsId,
        classeId: o.classeId,
        classeNom: classeNom.get(o.classeId) ?? "—",
        matiereId: o.matiereId,
        matiereNom: matiereNom.get(o.matiereId) ?? "—",
        enseignantAbsentId: o.enseignantId,
        dateAbsence: o.dateAbsence,
        jour: o.jour,
        heureDebut: o.heureDebut,
        critique: false,
        raisonCritique: null,
        priorite: 0,
      };
    }

    // Compter les prérequis bloquants pour ce chapitre
    let nbPrerequisBloquants = 0;
    let nbElevesAffectes = 0;
    for (const prereqId of plan.prerequisIds) {
      const stats = profilsBloquantsParCompetence.get(prereqId);
      if (stats) {
        nbPrerequisBloquants++;
        nbElevesAffectes = Math.max(nbElevesAffectes, stats.nbEleves);
      }
    }

    const critique = nbPrerequisBloquants > 0;
    const raisonCritique = critique
      ? `Chapitre « ${plan.chapitreNom} » : ${nbPrerequisBloquants} prérequis non maîtrisés par jusqu'à ${nbElevesAffectes} élève(s)`
      : null;

    return {
      emploiTempsId: o.emploiTempsId,
      classeId: o.classeId,
      classeNom: classeNom.get(o.classeId) ?? "—",
      matiereId: o.matiereId,
      matiereNom: matiereNom.get(o.matiereId) ?? "—",
      enseignantAbsentId: o.enseignantId,
      dateAbsence: o.dateAbsence,
      jour: o.jour,
      heureDebut: o.heureDebut,
      critique,
      raisonCritique,
      priorite: critique ? 1 : 0,
    };
  });

  // 6. Trier : critiques d'abord, puis par date
  remplacements.sort((a, b) => {
    if (a.priorite !== b.priorite) return b.priorite - a.priorite;
    return a.dateAbsence.getTime() - b.dateAbsence.getTime();
  });

  const nbCritiques = remplacements.filter((r) => r.critique).length;

  return {
    remplacements,
    nbCritiques,
    nbTotal: remplacements.length,
    donneesInsuffisantes: false,
  };
}

// ------------------------------------------------------------
// I17 — Salles goulot
// ------------------------------------------------------------

/**
 * Identifie les salles en goulot d'étranglement : celles dont le taux
 * d'occupation (créneaux utilisant la salle / total des créneaux distincts)
 * dépasse 80 %.
 *
 * @param annee  Optionnel — année scolaire (ex. "2025-2026") pour filtrer
 *   les emplois du temps. Si omis, utilise l'année scolaire courante.
 */
export async function identifierSallesGoulot(
  tenantId: string,
  claims: SessionSiteClaims,
  annee?: string
): Promise<SallesGoulot> {
  // Résoudre l'année scolaire si non fournie
  let anneeEffective = annee;
  if (!anneeEffective) {
    anneeEffective = (await anneeActiveLibelle(tenantId)) ?? undefined;
  }

  // — Récupérer toutes les salles (site-filtered) —
  const salles = await prisma.salle.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("salle", claims),
    },
    select: {
      id: true,
      nom: true,
      siteId: true,
    },
  });

  if (salles.length === 0) {
    return { salles: [], totalCreneaux: 0, donneesInsuffisantes: true };
  }

  // — Récupérer les emplois du temps (site-filtered) —
  const emplois = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      ...(anneeEffective ? { annee: anneeEffective } : {}),
      ...siteFilterForModel("emploiTemps", claims),
    },
    select: {
      salle: true,
      jour: true,
      heureDebut: true,
    },
  });

  // — Total des créneaux distincts (jour × heureDebut) —
  const creneauxDistincts = new Set<string>();
  for (const e of emplois) {
    creneauxDistincts.add(`${e.jour}|${e.heureDebut}`);
  }
  const totalCreneaux = creneauxDistincts.size;

  if (totalCreneaux === 0) {
    return {
      salles: salles.map((s) => ({
        salleId: s.id,
        nom: s.nom,
        siteId: s.siteId,
        nbCreneaux: 0,
        totalCreneaux: 0,
        tauxOccupation: 0,
        goulot: false,
      })),
      totalCreneaux: 0,
      donneesInsuffisantes: true,
    };
  }

  // — Compter les emplois du temps par nom de salle —
  const emploisParNomSalle = new Map<string, number>();
  for (const e of emplois) {
    if (e.salle) {
      emploisParNomSalle.set(
        e.salle,
        (emploisParNomSalle.get(e.salle) ?? 0) + 1
      );
    }
  }

  // — Calculer le taux d'occupation pour chaque salle —
  const resultSalles = salles.map((s) => {
    const nbCreneaux = emploisParNomSalle.get(s.nom) ?? 0;
    const tauxOccupation = nbCreneaux / totalCreneaux;
    return {
      salleId: s.id,
      nom: s.nom,
      siteId: s.siteId,
      nbCreneaux,
      totalCreneaux,
      tauxOccupation,
      goulot: tauxOccupation > SEUIL_OCCUPATION_GOULOT,
    };
  });

  // Trier par taux d'occupation décroissant
  resultSalles.sort((a, b) => b.tauxOccupation - a.tauxOccupation);

  return {
    salles: resultSalles,
    totalCreneaux,
    donneesInsuffisantes: false,
  };
}
