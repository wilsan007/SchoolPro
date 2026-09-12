/**
 * EcolPro — Calcul Automatique de l'Indice d'Assiduité du Personnel
 * ============================================================
 *
 * Intègre les absences enregistrées aux heures de cours programmées dans l'EDT
 * pour calculer le taux d'assiduité et identifier les enseignants en déficit.
 *
 * Note : Le schéma n'a pas de modèles `PointageEnseignant` ou `RetardEnseignant`.
 * L'assiduité est calculée à partir des séances d'EDT prévues et des
 * `AbsencePersonnel` enregistrées. Les heures prestées sont déduites :
 * heures prévues − heures d'absence.
 *
 * Indicateurs :
 * - Heures prévues (EDT)
 * - Heures d'absence (AbsencePersonnel)
 * - Heures prestées (prévues − absences)
 * - Taux d'assiduité (prestées / prévues)
 */

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ============================================================
// TYPES
// ============================================================

export interface AssiduitePersonnel {
  enseignantId: string;
  enseignantNom: string;
  heuresPrevues: number;
  heuresAbsence: number;
  heuresPrestees: number;
  tauxAssiduite: number; // 0-1
  absencesJustifiees: number;
  absencesNonJustifiees: number;
}

export interface ResumeAssiduite {
  totalEnseignants: number;
  totalHeuresPrevues: number;
  totalHeuresPrestees: number;
  tauxAssiduiteGlobal: number;
  enseignantsParfaits: number; // taux = 1.0
  enseignantsEnDeficit: number; // taux < 0.8
}

// ============================================================
// CALCUL DE L'ASSIDUITÉ
// ============================================================

/**
 * Calcule l'assiduité d'un enseignant sur une période donnée.
 *
 * Note : EmploiTemps n'a pas de champ `date` — les créneaux sont récurrents
 * par jour de la semaine. On compte donc les séances hebdomadaires et
 * on multiplie par le nombre de semaines dans la période.
 */
export async function calculerAssiduiteEnseignant(
  tenantId: string,
  enseignantId: string,
  dateDebut: Date,
  dateFin: Date
): Promise<AssiduitePersonnel | null> {
  const annee = await getAnneeCouranteLibelle(tenantId);

  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const enseignant = await prisma.enseignant.findFirst({
    where: { id: enseignantId, tenantId },
    include: { user: { select: { name: true } } },
  });

  if (!enseignant) return null;

  // Heures prévues : compter les séances de l'EDT
  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const seances = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      enseignantId,
      ...(annee ? { annee } : {}),
    },
    select: { heureDebut: true, heureFin: true },
  });

  // Calculer les heures par semaine
  const heuresParSemaine = seances.reduce((total, s) => {
    const debut = new Date(`2000-01-01T${s.heureDebut}`).getTime();
    const fin = new Date(`2000-01-01T${s.heureFin}`).getTime();
    return total + (fin - debut) / (1000 * 60 * 60);
  }, 0);

  // Nombre de semaines dans la période
  const nbJours = Math.ceil((dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24));
  const nbSemaines = Math.max(1, Math.floor(nbJours / 7));

  const heuresPrevues = heuresParSemaine * nbSemaines;

  // Absences dans la période
  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const absences = await prisma.absencePersonnel.findMany({
    where: {
      tenantId,
      enseignantId,
      date: { gte: dateDebut, lte: dateFin },
    },
    select: { statut: true, date: true, heureDebut: true, heureFin: true },
  });

  // Calculer les heures d'absence
  let heuresAbsence = 0;
  let absencesJustifiees = 0;
  let absencesNonJustifiees = 0;

  for (const a of absences) {
    // Statut JUSTIFIEE = absence justifiée, autre = non justifiée
    const estJustifiee = a.statut === "JUSTIFIEE";
    if (estJustifiee) {
      absencesJustifiees++;
    } else {
      absencesNonJustifiees++;
    }

    // Calculer la durée de l'absence
    if (a.heureDebut && a.heureFin) {
      const debut = new Date(`2000-01-01T${a.heureDebut}`).getTime();
      const fin = new Date(`2000-01-01T${a.heureFin}`).getTime();
      heuresAbsence += (fin - debut) / (1000 * 60 * 60);
    } else {
      // Absence d'une journée entière = moyenne des heures par jour
      const heuresParJour = heuresParSemaine / 6; // 6 jours d'école
      heuresAbsence += heuresParJour;
    }
  }

  const heuresPrestees = Math.max(0, heuresPrevues - heuresAbsence);
  const tauxAssiduite = heuresPrevues > 0 ? Math.min(1, heuresPrestees / heuresPrevues) : 0;

  return {
    enseignantId,
    enseignantNom: enseignant.user?.name ?? "N/A",
    heuresPrevues: Math.round(heuresPrevues * 100) / 100,
    heuresAbsence: Math.round(heuresAbsence * 100) / 100,
    heuresPrestees: Math.round(heuresPrestees * 100) / 100,
    tauxAssiduite,
    absencesJustifiees,
    absencesNonJustifiees,
  };
}

/**
 * Calcule l'assiduité de tout le personnel d'un tenant sur une période.
 */
export async function calculerAssiduiteTenant(
  tenantId: string,
  dateDebut: Date,
  dateFin: Date
): Promise<{ individus: AssiduitePersonnel[]; resume: ResumeAssiduite }> {
  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const enseignants = await prisma.enseignant.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const individus: AssiduitePersonnel[] = [];

  for (const ens of enseignants) {
    const assiduite = await calculerAssiduiteEnseignant(tenantId, ens.id, dateDebut, dateFin);
    if (assiduite) individus.push(assiduite);
  }

  const totalHeuresPrevues = individus.reduce((sum, a) => sum + a.heuresPrevues, 0);
  const totalHeuresPrestees = individus.reduce((sum, a) => sum + a.heuresPrestees, 0);
  const tauxAssiduiteGlobal = totalHeuresPrevues > 0
    ? totalHeuresPrestees / totalHeuresPrevues
    : 0;

  const resume: ResumeAssiduite = {
    totalEnseignants: individus.length,
    totalHeuresPrevues: Math.round(totalHeuresPrevues * 100) / 100,
    totalHeuresPrestees: Math.round(totalHeuresPrestees * 100) / 100,
    tauxAssiduiteGlobal,
    enseignantsParfaits: individus.filter((a) => a.tauxAssiduite >= 1.0).length,
    enseignantsEnDeficit: individus.filter((a) => a.tauxAssiduite < 0.8).length,
  };

  return { individus, resume };
}
