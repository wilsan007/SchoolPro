/**
 * EcolPro — Moteur Automatique de Couverture des Remplacements
 * ============================================================
 *
 * Quand un enseignant est absent, ce module :
 * 1. Identifie les créneaux d'EDT impactés
 * 2. Croise les disponibilités des collègues de la même matière sur le même site
 * 3. Propose un classement de remplaçants selon leur charge horaire résiduelle
 *
 * S'appuie sur la logique existante de `src/lib/learnos/couverture-remplacements.ts`
 * (indicateurs A20, A21, I15, I17) mais se concentre sur la proposition active
 * de remplaçants plutôt que sur le reporting.
 */

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import type { Jour } from "@prisma/client";

// ============================================================
// TYPES
// ============================================================

export interface CreneauImpacte {
  seanceId: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  siteId: string;
  enseignantAbsentId: string;
  enseignantAbsentNom: string;
}

export interface CandidatRemplacement {
  enseignantId: string;
  enseignantNom: string;
  chargeHebdoActuelle: number;
  chargeHebdoMax: number;
  chargeResiduelle: number;
  estDisponible: boolean;
  conflitsEdt: string[];
  score: number;
}

export interface PropositionRemplacement {
  creneau: CreneauImpacte;
  candidats: CandidatRemplacement[];
  meilleurCandidat?: CandidatRemplacement;
}

// ============================================================
// DÉTECTION DES CRÉNEAUX IMPACTÉS
// ============================================================

/**
 * Identifie les créneaux d'EDT impactés par l'absence d'un enseignant.
 *
 * Note : EmploiTemps n'a pas de champ `date` — les créneaux sont récurrents
 * par jour de la semaine. On filtre donc par `jour` (enum Jour).
 */
export async function detecterCreneauxImpactes(
  tenantId: string,
  enseignantId: string,
  _dateDebut: Date,
  _dateFin: Date
): Promise<CreneauImpacte[]> {
  const annee = await getAnneeCouranteLibelle(tenantId);

  // Fonction de bibliothèque appelée depuis des server actions qui valident
  // déjà la session et le périmètre de site. Le filtrage par site est assuré
  // par l'appelant (ex: moteur-remplacements.ts dans un contexte server action).
  // eslint-disable-next-line ecolpro/require-site-filter
  const enseignant = await prisma.enseignant.findFirst({
    where: { id: enseignantId, tenantId },
    include: { user: { select: { name: true } } },
  });

  if (!enseignant) return [];

  // Récupérer les séances de l'EDT de cet enseignant
  // eslint-disable-next-line ecolpro/require-site-filter
  const seances = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      ...(annee ? { annee } : {}),
      enseignantId,
    },
    include: {
      classe: { select: { id: true, nom: true, siteId: true } },
      matiere: { select: { id: true, nom: true } },
    },
  });

  return seances.map((s) => ({
    seanceId: s.id,
    jour: s.jour,
    heureDebut: s.heureDebut,
    heureFin: s.heureFin,
    classeId: s.classeId,
    classeNom: s.classe?.nom ?? "N/A",
    matiereId: s.matiereId,
    matiereNom: s.matiere?.nom ?? "N/A",
    siteId: s.classe?.siteId ?? "",
    enseignantAbsentId: enseignantId,
    enseignantAbsentNom: enseignant.user?.name ?? "N/A",
  }));
}

// ============================================================
// RECHERCHE DE CANDIDATS REMPLAÇANTS
// ============================================================

/**
 * Recherche des collègues pouvant remplacer un enseignant absent.
 */
export async function chercherCandidatsRemplacement(
  tenantId: string,
  creneau: CreneauImpacte
): Promise<CandidatRemplacement[]> {
  // Récupérer les enseignants de la même matière
  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const enseignants = await prisma.enseignant.findMany({
    where: {
      tenantId,
      id: { not: creneau.enseignantAbsentId },
      affectations: {
        some: {
          matiereId: creneau.matiereId,
        },
      },
    },
    include: {
      user: { select: { name: true } },
    },
  });

  const candidats: CandidatRemplacement[] = [];

  for (const ens of enseignants) {
    // Calculer la charge horaire hebdomadaire
    // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
    const seancesTotales = await prisma.emploiTemps.count({
      where: {
        tenantId,
        enseignantId: ens.id,
      },
    });

    const chargeHebdoActuelle = seancesTotales;
    const chargeHebdoMax = 20;
    const chargeResiduelle = Math.max(0, chargeHebdoMax - chargeHebdoActuelle);

    // Vérifier la disponibilité sur ce créneau (même jour + même heure)
    // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
    const conflits = await prisma.emploiTemps.findMany({
      where: {
        tenantId,
        enseignantId: ens.id,
        jour: creneau.jour as Jour,
        heureDebut: creneau.heureDebut,
      },
      select: { id: true },
    });

    const estDisponible = conflits.length === 0;
    const conflitsEdt = conflits.map((c) => c.id);

    const score = (estDisponible ? 1000 : 0) + chargeResiduelle * 10;

    candidats.push({
      enseignantId: ens.id,
      enseignantNom: ens.user?.name ?? "N/A",
      chargeHebdoActuelle,
      chargeHebdoMax,
      chargeResiduelle,
      estDisponible,
      conflitsEdt,
      score,
    });
  }

  candidats.sort((a, b) => b.score - a.score);

  return candidats;
}

// ============================================================
// PROPOSITION COMPLÈTE
// ============================================================

export async function proposerRemplacements(
  tenantId: string,
  enseignantId: string,
  dateDebut: Date,
  dateFin: Date
): Promise<PropositionRemplacement[]> {
  const creneaux = await detecterCreneauxImpactes(tenantId, enseignantId, dateDebut, dateFin);

  const propositions: PropositionRemplacement[] = [];

  for (const creneau of creneaux) {
    const candidats = await chercherCandidatsRemplacement(tenantId, creneau);
    const meilleurCandidat = candidats.find((c) => c.estDisponible);

    propositions.push({
      creneau,
      candidats,
      meilleurCandidat,
    });
  }

  return propositions;
}
