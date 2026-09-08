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
import { publishEvent } from "@/lib/learnos/events";

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
  // OPTIMISATION : au lieu de 4 requêtes par planification (N+1), on fait
  // 4 requêtes groupées qui récupèrent tous les signaux d'un coup, puis on
  // distribue les résultats en mémoire. Pour 70 planifications, on passe
  // de 280 requêtes séquentielles à 4 requêtes parallèles.
  const matiereIds = [...new Set(planifications.map((p) => p.chapitre.matiere.id))];
  const classeIds = [...new Set(planifications.map((p) => p.classeId).filter(Boolean))] as string[];

  // Si aucune planification n'a de classe (planifications template par niveau),
  // tous les signaux B/C/D/E sont à 0 — on saute les requêtes.
  const aDesClasses = classeIds.length > 0;

  const [devoirsGroupes, preuvesGroupes, notesGroupes, exercicesGroupes] = aDesClasses
    ? await Promise.all([
        // Signal B : devoirs donnés cette semaine, groupés par (classeId, matiereId)
        prisma.devoir.groupBy({
          by: ["classeId", "matiereId"],
          where: {
            tenantId,
            classeId: { in: classeIds },
            matiereId: { in: matiereIds },
            dateDonne: { gte: debut, lte: fin },
            ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
            ...siteFilterForModel("devoir", claims),
          },
          _count: true,
        }),
        // Signal C : preuves d'apprentissage cette semaine, groupés par (classeId, matiereId)
        prisma.learningEvidence.groupBy({
          by: ["matiereId"],
          where: {
            tenantId,
            matiereId: { in: matiereIds },
            occurredAt: { gte: debut, lte: fin },
            eleve: { classeId: { in: classeIds } },
            ...siteFilterForModel("learningEvidence", claims),
          },
          _count: true,
        }),
        // Signal D : notes saisies cette semaine, groupés par (classeId, matiereId)
        prisma.note.groupBy({
          by: ["classeId", "matiereId"],
          where: {
            tenantId,
            matiereId: { in: matiereIds },
            classeId: { in: classeIds },
            date: { gte: debut, lte: fin },
            ...(anneeLibelle ? { classe: { annee: anneeLibelle } } : {}),
            ...siteFilterForModel("note", claims),
          },
          _count: true,
        }),
        // Signal E : feuilles d'exercices assignées cette semaine
        prisma.feuilleExercices.groupBy({
          by: ["matiereId"],
          where: {
            tenantId,
            matiereId: { in: matiereIds },
            assigneeLe: { gte: debut, lte: fin },
            eleve: { classeId: { in: classeIds } },
            ...siteFilterForModel("feuilleExercices", claims),
          },
          _count: true,
        }),
      ])
    : [[], [], [], []];

  // Indexer les résultats pour lookup O(1) par (classeId, matiereId).
  const devoirsMap = new Map<string, number>();
  for (const d of devoirsGroupes) {
    devoirsMap.set(`${d.classeId}|${d.matiereId}`, d._count);
  }
  const preuvesMap = new Map<string, number>();
  for (const p of preuvesGroupes) {
    if (p.matiereId) preuvesMap.set(p.matiereId, p._count);
  }
  const notesMap = new Map<string, number>();
  for (const n of notesGroupes) {
    notesMap.set(`${n.classeId}|${n.matiereId}`, n._count);
  }
  const exercicesMap = new Map<string, number>();
  for (const e of exercicesGroupes) {
    if (e.matiereId) exercicesMap.set(e.matiereId, e._count);
  }

  const chapitres: ChapitrePrevu[] = [];

  for (const plan of planifications) {
    const matiereId = plan.chapitre.matiere.id;
    const classeId = plan.classeId;

    // Signal A : l'enseignant a-t-il déclaré ce chapitre comme TRAITE ?
    const declareTraite = plan.statut === "TRAITE";

    // Signaux B/C/D/E : récupérés depuis les maps pré-chargées.
    const devoirsDonnes = classeId
      ? devoirsMap.get(`${classeId}|${matiereId}`) ?? 0
      : 0;
    const preuvesEleves = classeId
      ? preuvesMap.get(matiereId) ?? 0
      : 0;
    const notesSaisies = classeId
      ? notesMap.get(`${classeId}|${matiereId}`) ?? 0
      : 0;
    const exercicesAssignes = classeId
      ? exercicesMap.get(matiereId) ?? 0
      : 0;

    // 4. Classifier le décalage.
    const aDeclaration = declareTraite || devoirsDonnes > 0;
    const aPreuves = preuvesEleves > 0 || notesSaisies > 0 || exercicesAssignes > 0;

    // Un chapitre ne peut être en DECALAGE que si sa semaine de fin est
    // dépassée (ou imminente : dans les 2 dernières semaines prévues). Avant
    // cela, l'absence de signal est normale — le chapitre vient de commencer
    // ou est dans son déroulement prévu. Sinon, en semaine 1, un chapitre
    // prévu sur 22 semaines serait flaggé "décalage" dès le 2e jour de l'année.
    const dureeChapitre = plan.semaineFin - plan.semaineDebut + 1;
    const semainesRestantes = plan.semaineFin - semaineAAnalyser;
    const enFinDeChapitre = semainesRestantes <= Math.max(2, Math.floor(dureeChapitre * 0.2));
    const semaineFinDepassee = plan.semaineFin < semaineAAnalyser;

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
    } else if (semaineFinDepassee || enFinDeChapitre) {
      // Aucun signal ET le chapitre est en fin de période prévue (ou la a
      // dépassée) : c'est un vrai décalage.
      niveauDecalage = "DECALAGE";
      explication = semaineFinDepassee
        ? "Aucun signal : ni déclaration de l'enseignant, ni preuve élève. La semaine de fin prévue est dépassée et le chapitre n'est pas marqué comme traité."
        : "Aucun signal : ni déclaration de l'enseignant, ni preuve élève. Le chapitre approche sa semaine de fin prévue sans trace d'enseignement.";
    } else {
      // Aucun signal mais le chapitre est dans son début/milieu de période
      // prévue : pas un décalage, juste un chapitre qui n'a pas encore
      // produit de traces. On l'aligne pour éviter les faux positifs.
      niveauDecalage = "ALIGNE";
      explication = "Chapitre dans sa période prévue, sans signal encore — l'enseignement n'a pas nécessairement commencé cette semaine.";
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

  // 6. Publier un événement `decalage.detecte` pour chaque chapitre en
  //    décalage. L'événement est un instantané autosuffisant (spec §49-1) :
  //    il ne relit pas la planification, qui peut changer entre-temps.
  //    Idempotence : l'aggregateId combine tenantId + planificationId +
  //    semaine, donc un rejeu ne crée pas de doublon dans l'outbox.
  for (const c of chapitres.filter((c) => c.niveauDecalage === "DECALAGE")) {
    await publishEvent({
      tenantId,
      siteId: claims.siteId ?? null,
      eventType: "decalage.detecte",
      aggregateType: "planification",
      aggregateId: `${c.planificationId}-s${semaineAAnalyser}`,
      payload: {
        classeId: c.classeId,
        matiereId: c.matiereId,
        chapitreId: c.chapitreId,
        semainePrevue: c.semaineFin,
        semaineActuelle: semaineAAnalyser,
        niveauDecalage: c.niveauDecalage,
      } as unknown as Record<string, unknown>,
    });
  }

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
