/**
 * LEARNOS — Tableau de suivi du programme (direction / CPE)
 * ==========================================================
 *
 * Vue d'ensemble destinée au chef d'établissement et au CPE : où en est
 * réellement le programme à la semaine S ?
 *
 * Quatre indicateurs croisés :
 *
 *  1. COUVERTURE — par classe × matière, combien de chapitres auraient dû
 *     être traités (semaineFin ≤ S) et combien le sont réellement (statut
 *     TRAITE). C'est le « baromètre programme » que tout directeur cherche.
 *
 *  2. DÉCALAGES — réutilise `detecterDecalageSemaine` : chapitres prévus
 *     cette semaine sans aucune trace (ni déclaration, ni preuve élève).
 *
 *  3. TENUE DU CAHIER — par enseignant, séances attendues (emploi du temps)
 *     vs séances réellement documentées. Un taux < 50 % signale un
 *     enseignant qui ne tient pas son cahier journal.
 *
 *  4. ÉCART PLANNING — pour chaque chapitre dont le plan initial a été
 *     ajusté, la dérive en semaines. Un drift > 2 semaines mérite une
 *     question, pas un verdict.
 *
 * Aucune IA : ce sont des comptages Prisma purs, agrégés pour l'affichage.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { semaineScolaire, datesDeLaSemaine } from "@/lib/learnos/planification-pure";
import { detecterDecalageSemaine } from "@/lib/learnos/alerte-decalage";
import { getDemoNow } from "@/lib/demo-now";

// ──────────────────────────────────────────────────────────────
// Types publics
// ──────────────────────────────────────────────────────────────

export interface LigneCouverture {
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  prevu: number;
  traite: number;
  ecart: number;
  taux: number;
}

export interface LigneDecalage {
  chapitreNom: string;
  matiereNom: string;
  classeNom: string | null;
  niveauDecalage: string;
  explication: string;
}

export interface LigneTenueCahier {
  enseignantId: string;
  enseignantNom: string;
  attendu: number;
  realise: number;
  taux: number;
  alerte: boolean;
}

export interface LigneEcartPlanning {
  chapitreNom: string;
  classeNom: string | null;
  matiereNom: string;
  drift: number;
}

export interface ResultatSuivi {
  semaine: number;
  couverture: LigneCouverture[];
  decalages: LigneDecalage[];
  tenueCahier: LigneTenueCahier[];
  ecartsPlanning: LigneEcartPlanning[];
  resume: {
    tauxCouvertureMoyen: number;
    nbDecalages: number;
    nbEnseignantsAlerte: number;
    nbEcartsPlanning: number;
  };
}

// ──────────────────────────────────────────────────────────────
// Calcul principal
// ──────────────────────────────────────────────────────────────

/**
 * Calcule le tableau de suivi du programme pour une semaine donnée.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param claims    Périmètre de l'appelant (isolation par site).
 * @param anneeId   L'année scolaire courante.
 * @param semaine   Numéro de semaine scolaire à analyser.
 */
export async function tableauSuiviProgramme(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId: string,
  semaine: number,
): Promise<ResultatSuivi> {
  // ── 1. Couverture du programme par classe × matière ──────────
  const couverture = await calculerCouverture(tenantId, claims, anneeId, semaine);

  // ── 2. Décalages détectés (réutilise l'alerte précoce) ────────
  const alerte = await detecterDecalageSemaine(tenantId, anneeId, claims, semaine);
  const decalages: LigneDecalage[] = alerte.chapitres
    .filter((c) => c.niveauDecalage === "DECALAGE" || c.niveauDecalage === "DECLARE_SEUL")
    .map((c) => ({
      chapitreNom: c.chapitreNom,
      matiereNom: c.matiereNom,
      classeNom: c.classeNom,
      niveauDecalage: c.niveauDecalage,
      explication: c.explication,
    }));

  // ── 3. Tenue du cahier journal par enseignant ────────────────
  const tenueCahier = await calculerTenueCahier(tenantId, claims, anneeId, semaine);

  // ── 4. Écart planning initial vs courant ─────────────────────
  const ecartsPlanning = await calculerEcartsPlanning(tenantId, claims, anneeId);

  // ── 5. Résumé agrégé ─────────────────────────────────────────
  const tauxCouvertureMoyen =
    couverture.length > 0
      ? couverture.reduce((sum, c) => sum + c.taux, 0) / couverture.length
      : 0;
  const nbDecalages = decalages.length;
  const nbEnseignantsAlerte = tenueCahier.filter((t) => t.alerte).length;
  const nbEcartsPlanning = ecartsPlanning.length;

  return {
    semaine,
    couverture,
    decalages,
    tenueCahier,
    ecartsPlanning,
    resume: {
      tauxCouvertureMoyen,
      nbDecalages,
      nbEnseignantsAlerte,
      nbEcartsPlanning,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// 1. Couverture du programme
// ──────────────────────────────────────────────────────────────

/**
 * Pour chaque combinaison classe × matière, compte les chapitres qui
 * auraient dû être terminés (semaineFin ≤ semaine) et ceux qui le sont
 * réellement (statut TRAITE).
 */
async function calculerCouverture(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId: string,
  semaine: number,
): Promise<LigneCouverture[]> {
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      semaineFin: { lte: semaine },
      ...siteFilterForModel("planificationChapitre", claims),
    },
    select: {
      statut: true,
      classeId: true,
      classe: { select: { id: true, nom: true } },
      chapitre: {
        select: {
          matiere: { select: { id: true, nom: true } },
        },
      },
    },
  });

  // Agréger par (classeId, matiereId).
  const map = new Map<
    string,
    {
      classeId: string;
      classeNom: string;
      matiereId: string;
      matiereNom: string;
      prevu: number;
      traite: number;
    }
  >();

  for (const plan of planifications) {
    const classeId = plan.classeId ?? "__sans_classe__";
    const classeNom = plan.classe?.nom ?? "—";
    const matiereId = plan.chapitre.matiere.id;
    const matiereNom = plan.chapitre.matiere.nom;
    const key = `${classeId}|${matiereId}`;

    const ligne = map.get(key) ?? {
      classeId,
      classeNom,
      matiereId,
      matiereNom,
      prevu: 0,
      traite: 0,
    };

    ligne.prevu += 1;
    if (plan.statut === "TRAITE") ligne.traite += 1;

    map.set(key, ligne);
  }

  return Array.from(map.values())
    .map((l) => ({
      classeId: l.classeId,
      classeNom: l.classeNom,
      matiereId: l.matiereId,
      matiereNom: l.matiereNom,
      prevu: l.prevu,
      traite: l.traite,
      ecart: l.prevu - l.traite,
      taux: l.prevu > 0 ? l.traite / l.prevu : 0,
    }))
    .sort((a, b) => a.classeNom.localeCompare(b.classeNom) || a.matiereNom.localeCompare(b.matiereNom));
}

// ──────────────────────────────────────────────────────────────
// 3. Tenue du cahier journal
// ──────────────────────────────────────────────────────────────

/**
 * Pour chaque enseignant, compare le nombre de séances attendues
 * (créneaux de l'emploi du temps qui tombent dans la semaine, hors
 * vacances / jours fériés) au nombre de séances réellement documentées
 * (SeancePedagogique avec statut EFFECTUEE ou contenu non-null).
 */
async function calculerTenueCahier(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId: string,
  semaine: number,
): Promise<LigneTenueCahier[]> {
  // Résoudre l'année pour calculer les dates de la semaine.
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) return [];

  const { debut, fin } = datesDeLaSemaine(semaine, annee.dateDebut);

  // Déterminer si la semaine tombe sur des vacances / jours fériés.
  // eslint-disable-next-line ecolpro/require-site-filter -- evenementCalendaire: niveau tenant, pas de siteId, filtré par anneeId
  const evenements = await prisma.evenementCalendaire.findMany({
    where: {
      anneeId,
      type: { in: ["VACANCE_SCOLAIRE", "JOUR_FERIE"] },
      dateDebut: { lte: fin },
      dateFin: { gte: debut },
    },
    select: { dateDebut: true, dateFin: true },
  });

  // Si toute la semaine est couverte par des vacances, aucun attendu.
  const semaineEnVacances = evenements.some(
    (ev) => ev.dateDebut <= debut && ev.dateFin >= fin,
  );

  // Charger tous les enseignants du tenant (pour le périmètre).
  const enseignants = await prisma.enseignant.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
    select: {
      id: true,
      user: { select: { name: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  if (enseignants.length === 0) return [];

  // Charger l'emploi du temps de la semaine pour ces enseignants.
  // EmploiTemps n'a pas de champ date : il décrit un créneau récurrent
  // (jour + heureDebut/heureFin) rattaché à une classe et une année
  // (champ `annee` string). On compte donc les créneaux dont l'enseignant
  // est l'appelant et dont l'année correspond au libellé de l'année.
  const anneeLibelle = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { libelle: true },
  });

  const emplois = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      enseignantId: { in: enseignants.map((e) => e.id) },
      ...(anneeLibelle?.libelle ? { annee: anneeLibelle.libelle } : {}),
      ...siteFilterForModel("emploiTemps", claims),
    },
    select: {
      id: true,
      enseignantId: true,
      jour: true,
    },
  });

  // Compter les créneaux attendus par enseignant.
  // Si la semaine est en vacances, attendu = 0 pour tout le monde.
  const attenduParEnseignant = new Map<string, number>();
  if (!semaineEnVacances) {
    for (const emp of emplois) {
      if (!emp.enseignantId) continue;
      attenduParEnseignant.set(
        emp.enseignantId,
        (attenduParEnseignant.get(emp.enseignantId) ?? 0) + 1,
      );
    }
  }

  // Charger les séances pédagogiques documentées pour cette semaine.
  const seances = await prisma.seancePedagogique.findMany({
    where: {
      tenantId,
      semaine,
      enseignantId: { in: enseignants.map((e) => e.id) },
      ...siteFilterForModel("seancePedagogique", claims),
    },
    select: {
      enseignantId: true,
      statut: true,
      contenu: true,
    },
  });

  // Compter les séances réalisées (EFFECTUEE ou contenu non-null).
  const realiseParEnseignant = new Map<string, number>();
  for (const s of seances) {
    if (!s.enseignantId) continue;
    const realise = s.statut === "EFFECTUEE" || s.contenu !== null;
    if (realise) {
      realiseParEnseignant.set(
        s.enseignantId,
        (realiseParEnseignant.get(s.enseignantId) ?? 0) + 1,
      );
    }
  }

  return enseignants.map((ens) => {
    const attendu = attenduParEnseignant.get(ens.id) ?? 0;
    const realise = realiseParEnseignant.get(ens.id) ?? 0;
    const taux = attendu > 0 ? realise / attendu : 0;
    const alerte = attendu > 0 && taux < 0.5;
    return {
      enseignantId: ens.id,
      enseignantNom: ens.user?.name ?? "—",
      attendu,
      realise,
      taux,
      alerte,
    };
  });
}

// ──────────────────────────────────────────────────────────────
// 4. Écart planning initial vs courant
// ──────────────────────────────────────────────────────────────

/**
 * Pour chaque PlanificationChapitre dont le plan initial a été enregistré
 * (semaineDebutInitiale non-null), calcule la dérive = semaineDebut -
 * semaineDebutInitiale. Signale ceux dont la dérive dépasse 2 semaines.
 */
async function calculerEcartsPlanning(
  tenantId: string,
  claims: SessionSiteClaims,
  anneeId: string,
): Promise<LigneEcartPlanning[]> {
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      semaineDebutInitiale: { not: null },
      ...siteFilterForModel("planificationChapitre", claims),
    },
    select: {
      semaineDebut: true,
      semaineDebutInitiale: true,
      classe: { select: { nom: true } },
      chapitre: {
        select: {
          nom: true,
          matiere: { select: { nom: true } },
        },
      },
    },
  });

  return planifications
    .map((p) => ({
      chapitreNom: p.chapitre.nom,
      classeNom: p.classe?.nom ?? null,
      matiereNom: p.chapitre.matiere.nom,
      drift: p.semaineDebut - (p.semaineDebutInitiale ?? p.semaineDebut),
    }))
    .filter((e) => e.drift > 2)
    .sort((a, b) => b.drift - a.drift);
}

// ──────────────────────────────────────────────────────────────
// Utilitaire : semaine courante
// ──────────────────────────────────────────────────────────────

/**
 * Numéro de la semaine scolaire courante pour une année donnée.
 * Utilise `getDemoNow()` pour respecter la Time Machine.
 */
export async function semaineCourantePourAnnee(
  tenantId: string,
  anneeId: string,
): Promise<number> {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) return 1;
  return semaineScolaire(await getDemoNow(), annee.dateDebut);
}
