/**
 * LEARNOS — Alerte précoce de décalage pédagogique
 * ================================================
 *
 * Détecte l'écart entre ce qui était prévu d'être enseigné une semaine
 * donnée et ce qui a réellement été fait — tel que documenté par
 * l'enseignant (statut TRAITE, devoirs donnés) et par les élèves
 * (preuves d'apprentissage, notes, exercices réalisés).
 *
 * Trois signaux sont croisés :
 *
 *  1. PRÉVU   — PlanificationChapitre (semaineDebut ≤ semaine ≤ semaineFin)
 *  2. DÉCLARÉ — statut "TRAITE" + Devoir.dateDonne dans la semaine
 *  3. RÉALISÉ — LearningEvidence.occurredAt, Note.date, FeuilleExercices.assigneeLe
 *
 * Règles de classification :
 *
 *  - ALIGNE      : prévu + déclaré + preuves élèves présentes
 *  - DECLARE_SEUL: prévu + déclaré TRAITE, mais AUCUNE preuve élève
 *                  → l'enseignant dit avoir fait, mais rien ne le confirme
 *  - REALISE_NON_DECLARE : prévu + preuves élèves présentes, mais statut encore PREVU
 *                  → les élèves ont travaillé, mais l'enseignant n'a pas marqué le chapitre
 *  - DECALAGE    : prévu + RIEN (ni declaration, ni preuve)
 *                  → ALERTE : rien n'a été fait, et ce n'est pas documenté
 *
 * Aucune IA dans ce module — ce sont des comptages Prisma purs.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { semaineScolaire, datesDeLaSemaine } from "@/lib/learnos/planification-pure";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import type { SessionSiteClaims } from "@/lib/site-scope";

// ──────────────────────────────────────────────────────────────
// Types publics
// ──────────────────────────────────────────────────────────────

export type NiveauDecalage = "ALIGNE" | "DECLARE_SEUL" | "REALISE_NON_DECLARE" | "DECALAGE";

export interface ChapitrePrevu {
  planificationId: string;
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  matiereId: string;
  classeNom: string | null;
  classeId: string | null;
  niveau: string;
  semaineDebut: number;
  semaineFin: number;
  statutPlan: string; // "PREVU" | "EN_COURS" | "TRAITE"
  // Signaux
  declareTraite: boolean;
  devoirsDonnes: number;
  preuvesEleves: number;
  notesSaisies: number;
  exercicesAssignes: number;
  // Classification
  niveauDecalage: NiveauDecalage;
  explication: string;
}

export interface ResultatAlerteDecalage {
  semaine: number;
  dateDebut: string;
  dateFin: string;
  chapitres: ChapitrePrevu[];
  resume: {
    alignes: number;
    declaresSeuls: number;
    realisesNonDeclares: number;
    decalages: number;
    total: number;
  };
  /** true si au moins un chapitre est en DECALAGE — pour le badge global */
  aDesAlertes: boolean;
}

// ──────────────────────────────────────────────────────────────
// Calcul principal
// ──────────────────────────────────────────────────────────────

/**
 * Détecte les décalages pour une semaine donnée.
 *
 * @param tenantId  Le tenant de l'appelant.
 * @param anneeId   L'année scolaire courante.
 * @param claims    Périmètre de l'appelant (pour l'isolation par site).
 * @param semaine   Numéro de semaine scolaire à analyser.
 *                  Par défaut : la semaine précédente.
 */
export async function detecterDecalageSemaine(
  tenantId: string,
  anneeId: string,
  claims: SessionSiteClaims,
  semaine?: number,
  maintenant: Date = new Date(),
  anneeCourante?: string | null,
): Promise<ResultatAlerteDecalage> {
  // Libellé de l'année courante (ex. « 2025-2026 »), pour filtrer les classes.
  const anneeLibelle = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  // 1. Résoudre l'année et la semaine à analyser.
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) {
    return resultatVide(0, maintenant, maintenant);
  }

  const semaineCourante = semaineScolaire(maintenant, annee.dateDebut);
  const semaineAAnalyser = semaine ?? Math.max(1, semaineCourante - 1);

  const { debut, fin } = datesDeLaSemaine(semaineAAnalyser, annee.dateDebut);

  // 2. Charger les chapitres prévus pour cette semaine.
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      semaineDebut: { lte: semaineAAnalyser },
      semaineFin: { gte: semaineAAnalyser },
      ...siteFilterForModel("planificationChapitre", claims),
    },
    select: {
      id: true,
      chapitreId: true,
      classeId: true,
      semaineDebut: true,
      semaineFin: true,
      statut: true,
      classe: { select: { id: true, nom: true, niveau: true } },
      chapitre: {
        select: {
          id: true,
          nom: true,
          niveau: true,
          matiere: { select: { id: true, nom: true } },
        },
      },
    },
    orderBy: { chapitre: { matiere: { nom: "asc" } } },
  });

  if (planifications.length === 0) {
    return resultatVide(semaineAAnalyser, debut, fin);
  }

  // 3. Pour chaque planification, croiser les signaux.
  const chapitres: ChapitrePrevu[] = [];

  for (const plan of planifications) {
    const matiereId = plan.chapitre.matiere.id;
    const classeId = plan.classeId;

    // Signal A : l'enseignant a-t-il déclaré ce chapitre comme TRAITE ?
    const declareTraite = plan.statut === "TRAITE";

    // Signal B : y a-t-il des devoirs donnés cette semaine pour cette classe + matière ?
    const devoirsDonnes = classeId
      ? await prisma.devoir.count({
          where: {
            tenantId,
            classeId,
            matiereId,
            dateDonne: { gte: debut, lte: fin },
            ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
            ...siteFilterForModel("devoir", claims),
          },
        })
      : 0;

    // Signal C : y a-t-il des preuves d'apprentissage pour les élèves de cette
    // classe dans cette matière cette semaine ?
    const preuvesEleves = classeId
      ? await prisma.learningEvidence.count({
          where: {
            tenantId,
            matiereId,
            occurredAt: { gte: debut, lte: fin },
            eleve: { classeId },
            ...siteFilterForModel("learningEvidence", claims),
          },
        })
      : 0;

    // Signal D : y a-t-il des notes saisies cette semaine pour cette classe + matière ?
    const notesSaisies = classeId
      ? await prisma.note.count({
          where: {
            tenantId,
            matiereId,
            classeId,
            date: { gte: debut, lte: fin },
            ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
            ...siteFilterForModel("note", claims),
          },
        })
      : 0;

    // Signal E : y a-t-il des feuilles d'exercices assignées cette semaine
    // pour les élèves de cette classe dans cette matière ?
    const exercicesAssignes = classeId
      ? await prisma.feuilleExercices.count({
          where: {
            tenantId,
            matiereId,
            assigneeLe: { gte: debut, lte: fin },
            eleve: { classeId },
            ...siteFilterForModel("feuilleExercices", claims),
          },
        })
      : 0;

    // 4. Classifier le décalage.
    const aDeclaration = declareTraite || devoirsDonnes > 0;
    const aPreuves = preuvesEleves > 0 || notesSaisies > 0 || exercicesAssignes > 0;

    let niveauDecalage: NiveauDecalage;
    let explication: string;

    if (aDeclaration && aPreuves) {
      niveauDecalage = "ALIGNE";
      explication = "Chapitre traité, devoirs donnés et preuves élèves présentes.";
    } else if (aDeclaration && !aPreuves) {
      niveauDecalage = "DECLARE_SEUL";
      explication = "L'enseignant déclare avoir traité le chapitre, mais aucune preuve élève (note, exercice, évaluation) n'est enregistrée pour cette semaine.";
    } else if (!aDeclaration && aPreuves) {
      niveauDecalage = "REALISE_NON_DECLARE";
      explication = "Des preuves élèves existent (notes, exercices), mais le chapitre n'est pas marqué comme traité par l'enseignant.";
    } else {
      niveauDecalage = "DECALAGE";
      explication = "Aucun signal : ni déclaration de l'enseignant, ni preuve élève. Le chapitre prévu cette semaine n'a apparemment pas été enseigné.";
    }

    chapitres.push({
      planificationId: plan.id,
      chapitreId: plan.chapitreId,
      chapitreNom: plan.chapitre.nom,
      matiereNom: plan.chapitre.matiere.nom,
      matiereId,
      classeNom: plan.classe?.nom ?? null,
      classeId,
      niveau: plan.chapitre.niveau,
      semaineDebut: plan.semaineDebut,
      semaineFin: plan.semaineFin,
      statutPlan: plan.statut,
      declareTraite,
      devoirsDonnes,
      preuvesEleves,
      notesSaisies,
      exercicesAssignes,
      niveauDecalage,
      explication,
    });
  }

  // 5. Résultat agrégé.
  const resume = {
    alignes: chapitres.filter((c) => c.niveauDecalage === "ALIGNE").length,
    declaresSeuls: chapitres.filter((c) => c.niveauDecalage === "DECLARE_SEUL").length,
    realisesNonDeclares: chapitres.filter((c) => c.niveauDecalage === "REALISE_NON_DECLARE").length,
    decalages: chapitres.filter((c) => c.niveauDecalage === "DECALAGE").length,
    total: chapitres.length,
  };

  return {
    semaine: semaineAAnalyser,
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    chapitres,
    resume,
    aDesAlertes: resume.decalages > 0 || resume.declaresSeuls > 0,
  };
}

function resultatVide(semaine: number, debut: Date, fin: Date): ResultatAlerteDecalage {
  return {
    semaine,
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    chapitres: [],
    resume: { alignes: 0, declaresSeuls: 0, realisesNonDeclares: 0, decalages: 0, total: 0 },
    aDesAlertes: false,
  };
}
