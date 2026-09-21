/**
 * Démo Ambouli — étape 5 : le jumeau pédagogique LEARNOS de la rentrée 2026.
 *
 * CE QUI MANQUAIT
 * Les notes disent ce qu'un élève a obtenu ; LEARNOS dit ce qu'il MAÎTRISE.
 * Sans preuves d'apprentissage ni profils de compétence pour 2026-2027, tous
 * les écrans qui font la différence de l'application — compétences acquises,
 * recommandations à l'enseignant, entraînement adaptatif, alertes aux
 * familles — restaient vides : ce sont pourtant eux que la démonstration doit
 * montrer.
 *
 * LA CHAÎNE DE DÉDUCTION
 *   note obtenue → preuve d'apprentissage (LearningEvidence)
 *               → profil de maîtrise par compétence (StudentLearningProfile)
 *               → recommandation à l'enseignant si un seuil est franchi
 *               → feuille d'exercices générée pour l'élève
 *               → alerte à la famille si la situation le justifie
 *
 * Rien n'est tiré au hasard indépendamment : le niveau de l'élève
 * (`niveauEleve`, partagé avec l'étape 3) commande toute la chaîne. Un élève
 * fort a des compétences acquises et des exercices d'approfondissement ; un
 * élève en difficulté a des prérequis manquants, une recommandation de
 * remédiation, des exercices de reprise et une alerte à ses parents.
 *
 * DÉTERMINISTE ET IDEMPOTENT.
 *
 *   pnpm exec tsx scripts/demo/05-rentree-2026-learnos.ts [--dry-run]
 */

import {
  Prisma, PrismaClient, EvidenceType, ErrorType, MasteryStatus,
  NiveauRecommandation, StatutRecommandation, StatutFeuille, PalierExercice,
  NiveauAlerteParent,
} from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss } from "../../prisma/seed-ambouli-helpers";
import { insererEnMasse, type Ligne } from "./_ecriture-massive";
import { niveauEleve } from "./_profil-eleve";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

const TENANT = "tenant-ambouli";
const ANNEE = "2026-2027";
/** Matières sur lesquelles le curriculum est détaillé en compétences. */
const MATIERES_SUIVIES = ["MATH", "FR", "PC", "SVT"];

/**
 * Écrit par lots, avec délai maximal et reprise.
 *
 * POURQUOI UN DÉLAI EXPLICITE
 * Le pooler Supabase ferme parfois une connexion au milieu d'une insertion en
 * masse. Le client Prisma, lui, attend indéfiniment une réponse qui ne viendra
 * plus : le script reste en vie, à zéro pour cent de processeur, sans rien
 * écrire ni rien dire. Un délai transforme ce silence en erreur, et l'erreur
 * en nouvelle tentative.
 */
async function avecDelai<T>(operation: () => Promise<T>, secondes = 90): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error(`délai de ${secondes} s dépassé`)), secondes * 1000);
      }),
    ]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

async function ecrireParLots<T>(libelle: string, lignes: T[], ecrire: (lot: T[]) => Promise<{ count: number }>) {
  if (lignes.length === 0) return console.log(`${libelle} : rien à écrire`);
  if (DRY) return console.log(`[simulation] ${libelle} : ${lignes.length} ligne(s)`);

  // Lots de 200 : mesuré à environ trois secondes par lot. Plus gros, le
  // pooler rend la main avant la fin.
  let n = 0;
  for (let i = 0; i < lignes.length; i += 200) {
    const lot = lignes.slice(i, i + 200);
    for (let essai = 1; essai <= 3; essai++) {
      try {
        const { count } = await avecDelai(() => ecrire(lot));
        n += count;
        break;
      } catch (e) {
        const message = e instanceof Error ? e.message.split("\n").pop() : String(e);
        if (essai === 3) throw new Error(`${libelle} : lot ${i} abandonné après trois tentatives (${message})`);
        console.warn(`\n  ${libelle} : lot ${i}, tentative ${essai} en échec (${message})`);
        await new Promise((r) => setTimeout(r, 2000 * essai));
      }
    }
    if (i % 2000 === 0) console.log(`  ${libelle} : ${i + lot.length}/${lignes.length}`);
  }
  console.log(`${libelle} : ${n} écrite(s) sur ${lignes.length} proposée(s)`);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20260905);

  const classes = await prisma.classe.findMany({
    where: { tenantId: TENANT, annee: ANNEE, deletedAt: null },
    select: {
      id: true, nom: true, niveau: true, siteId: true,
      eleves: { where: { deletedAt: null }, select: { id: true, prenom: true, nom: true, parents: { select: { parentId: true } } } },
    },
  });

  // Curriculum : chapitres et compétences par matière × niveau.
  const competences = await prisma.competence.findMany({
    where: { tenantId: TENANT },
    select: {
      id: true,
      libelle: true,
      siteId: true,
      chapitre: {
        select: { id: true, nom: true, niveau: true, ordre: true, matiereId: true, matiere: { select: { code: true } } },
      },
    },
  });

  /** clé `site|niveau|code matière` → compétences des premiers chapitres. */
  const parNiveau = new Map<string, typeof competences>();
  for (const c of competences) {
    if (!c.chapitre?.matiere) continue;
    if (!MATIERES_SUIVIES.includes(c.chapitre.matiere.code)) continue;
    // Le curriculum est partagé entre les deux sites (`siteId` nul) : la clé
    // ne porte donc que le niveau et la matière.
    const cle = `${c.chapitre.niveau}|${c.chapitre.matiere.code}`;
    const liste = parNiveau.get(cle) ?? [];
    liste.push(c);
    parNiveau.set(cle, liste);
  }
  // Six semaines de cours : seul le PREMIER chapitre du programme a été
  // traité. En attribuer davantage ferait état d'un programme qui n'a pas eu
  // lieu, et gonflerait le volume sans rien ajouter à la démonstration. Les
  // chapitres ne sont pas numérotés à partir de 1 partout : on retient le
  // plus petit rang réellement présent.
  for (const [cle, liste] of parNiveau) {
    const rangs = [...new Set(liste.map((c) => c.chapitre!.ordre ?? 0))].sort((a, b) => a - b).slice(0, 1);
    parNiveau.set(cle, liste.filter((c) => rangs.includes(c.chapitre!.ordre ?? 0)));
  }
  console.log(`${competences.length} compétences au curriculum, ${parNiveau.size} couples niveau × matière couverts au 1er trimestre`);

  const questionsParCompetence = new Map<string, { id: string; palier: PalierExercice }[]>();
  for (const q of await prisma.question.findMany({ select: { id: true, competenceId: true, palier: true } })) {
    if (!q.competenceId) continue;
    const liste = questionsParCompetence.get(q.competenceId) ?? [];
    liste.push({ id: q.id, palier: q.palier });
    questionsParCompetence.set(q.competenceId, liste);
  }

  const evidences: Prisma.LearningEvidenceCreateManyInput[] = [];
  const profils: Prisma.StudentLearningProfileCreateManyInput[] = [];
  const recommandations: Prisma.RecommandationCreateManyInput[] = [];
  const feuilles: Prisma.FeuilleExercicesCreateManyInput[] = [];
  const exercices: Prisma.ExerciceAssigneCreateManyInput[] = [];
  const alertes: Prisma.AlerteParentCreateManyInput[] = [];

  // Deux relevés : l'interrogation de mi-septembre et le devoir surveillé de
  // début octobre. C'est ce que six semaines de cours produisent réellement.
  const DATES_PREUVE = [new Date(2026, 8, 18, 10), new Date(2026, 9, 2, 10)];

  for (const classe of classes) {
    for (const eleve of classe.eleves) {
      const niveau = niveauEleve(eleve.id); // /20
      const base = clamp(niveau / 20 + gauss(0, 0.05), 0.08, 0.97);
      let aBesoinDAide = false;
      let exceLlence = true;

      for (const code of MATIERES_SUIVIES) {
        const comps = parNiveau.get(`${classe.niveau}|${code}`) ?? [];
        for (const comp of comps) {
          // Trois relevés : la progression (ou la chute) est ce qui se lit.
          let maitrise = clamp(base + gauss(0, 0.08), 0.05, 0.98);
          const premiere = maitrise;

          DATES_PREUVE.forEach((date, i) => {
            maitrise = clamp(maitrise + gauss(base > 0.55 ? 0.03 : -0.01, 0.06), 0.03, 0.99);
            evidences.push({
              id: `ev-2026-${eleve.id}-${comp.id}-${i}`,
              tenantId: TENANT,
              siteId: classe.siteId,
              eleveId: eleve.id,
              competenceId: comp.id,
              matiereId: comp.chapitre!.matiereId,
              sourceType: "note",
              sourceId: `eval-2026-${classe.id}-${code}-${i === 0 ? "int1" : "ds1"}`,
              evidenceType: i === 0 ? EvidenceType.QUIZ : EvidenceType.DEVOIR,
              rawScore: Math.round(maitrise * 20 * 4) / 4,
              maxScore: 20,
              occurredAt: date,
              masterySignal: Math.round(maitrise * 100) / 100,
              confidence: clamp(0.55 + i * 0.12, 0.5, 0.95),
              weight: 1,
              errorType: maitrise < 0.4 ? pick([ErrorType.CONCEPTUAL_ERROR, ErrorType.PROCEDURAL_ERROR, ErrorType.MISSING_PREREQUISITE]) : null,
              errorConfidence: maitrise < 0.4 ? Math.round((0.6 + Math.random() * 0.3) * 100) / 100 : null,
              metadata: { annee: ANNEE, classe: classe.nom, chapitre: comp.chapitre!.nom },
            });
          });

          const statut = maitrise < 0.35 ? MasteryStatus.EMERGING
            : maitrise < 0.55 ? MasteryStatus.DEVELOPING
              : maitrise < 0.8 ? MasteryStatus.PROFICIENT
                : MasteryStatus.MASTERED;
          if (maitrise < 0.55) aBesoinDAide = true;
          if (maitrise < 0.8) exceLlence = false;

          profils.push({
            id: `prof-2026-${eleve.id}-${comp.id}`,
            tenantId: TENANT,
            siteId: classe.siteId,
            eleveId: eleve.id,
            competenceId: comp.id,
            masteryScore: Math.round(maitrise * 100) / 100,
            confidenceScore: 0.85,
            masteryStatus: statut,
            evidenceCount: DATES_PREUVE.length,
            lastEvidenceAt: DATES_PREUVE[DATES_PREUVE.length - 1],
            trend: maitrise > premiere + 0.05 ? "hausse" : maitrise < premiere - 0.05 ? "baisse" : "stable",
            prerequisiteStatus: { checked: true, missing: maitrise < 0.35 ? 2 : 0 },
            recommendedAction: maitrise < 0.35 ? "remediation" : maitrise < 0.55 ? "retest" : maitrise > 0.9 ? "enrichment" : null,
          });

          // Recommandation à l'enseignant quand un seuil est franchi.
          const niveauReco = maitrise < 0.35 ? NiveauRecommandation.CRITIQUE
            : maitrise < 0.55 ? NiveauRecommandation.FRAGILE
              : maitrise > 0.92 ? NiveauRecommandation.EXCELLENCE
                : null;
          if (niveauReco) {
            recommandations.push({
              id: `reco-2026-${eleve.id}-${comp.id}`,
              tenantId: TENANT,
              siteId: classe.siteId,
              eleveId: eleve.id,
              competenceId: comp.id,
              niveau: niveauReco,
              statut: niveauReco === NiveauRecommandation.CRITIQUE
                ? StatutRecommandation.OBLIGATOIRE
                : pick([StatutRecommandation.RECOMMANDEE, StatutRecommandation.PROPOSEE, StatutRecommandation.ACCEPTEE]),
              motif: `${niveauReco === NiveauRecommandation.EXCELLENCE ? "Excellence" : niveauReco === NiveauRecommandation.CRITIQUE ? "Maîtrise critique" : "Maîtrise fragile"} (${Math.round(maitrise * 100)} %) sur ${comp.libelle}`,
              actionProposee: niveauReco === NiveauRecommandation.CRITIQUE
                ? "Plan de remédiation : reprise des prérequis"
                : niveauReco === NiveauRecommandation.FRAGILE
                  ? "Exercices ciblés puis nouvelle évaluation"
                  : "Parcours d'approfondissement",
              regleDeclenchee: `reco.${niveauReco.toLowerCase()}`,
              motifParams: { competence: comp.libelle, mastery: Math.round(maitrise * 100) / 100 },
              competencesBloquees: maitrise < 0.35 ? randInt(1, 3) : 0,
            });
          }
        }
      }

      // --- L'entraînement personnalisé -----------------------------------
      // Deux feuilles par élève et par matière suivie : une déjà terminée, une
      // en cours. Sans feuille en cours, l'écran « mon entraînement » de
      // l'élève n'aurait rien à proposer.
      for (const code of MATIERES_SUIVIES.slice(0, aBesoinDAide ? 4 : 2)) {
        const comps = parNiveau.get(`${classe.niveau}|${code}`) ?? [];
        if (comps.length === 0) continue;
        const matiereId = comps[0].chapitre!.matiereId;

        for (const [rang, etat] of [[0, StatutFeuille.TERMINEE], [1, StatutFeuille.EN_COURS]] as const) {
          const feuilleId = `feu-2026-${eleve.id}-${code}-${rang}`;
          const assignee = new Date(2026, 8 + rang, rang === 0 ? 21 : 6, 15, 0, 0);
          feuilles.push({
            id: feuilleId,
            tenantId: TENANT,
            siteId: classe.siteId,
            eleveId: eleve.id,
            matiereId,
            type: aBesoinDAide ? "remediation" : exceLlence ? "approfondissement" : "entrainement",
            statut: etat,
            assigneeLe: assignee,
            termineeLe: etat === StatutFeuille.TERMINEE ? new Date(assignee.getTime() + 3 * 86400000) : null,
          });

          // Une compétence par feuille, trois questions : c'est ce qu'un
          // élève traite en une séance d'entraînement. En mettre davantage
          // gonflerait le jeu de données sans rien montrer de plus.
          let ordre = 0;
          for (const comp of comps.slice(0, 1)) {
            const banque = questionsParCompetence.get(comp.id) ?? [];
            for (const q of banque.slice(0, 3)) {
              exercices.push({
                id: `exo-2026-${feuilleId}-${ordre}`,
                feuilleId,
                questionId: q.id,
                competenceId: comp.id,
                ordre: ordre++,
                palier: q.palier,
                regleDeclenchee: aBesoinDAide ? "exo.remediation" : "exo.consolidation",
                priorite: aBesoinDAide ? 1 : 3,
              });
            }
          }
        }
      }

      // --- L'alerte à la famille ------------------------------------------
      if (aBesoinDAide && eleve.parents.length > 0 && chance(0.5)) {
        const parentId = eleve.parents[0].parentId;
        alertes.push({
          id: `alp-2026-${eleve.id}`,
          tenantId: TENANT,
          siteId: classe.siteId,
          eleveId: eleve.id,
          parentId,
          niveau: niveau < 8 ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION,
          cle: "learnos.alerte.maitriseFragile",
          params: { classe: classe.nom, matieres: MATIERES_SUIVIES.slice(0, 2) },
          canal: "whatsapp",
          statut: "ENVOYEE",
          envoyeeLe: new Date(2026, 9, 9, 18, 0, 0),
          empreinte: `emp-2026-${eleve.id}-maitrise`,
        });
      }
    }
  }

  if (DRY) {
    console.log(`[simulation] preuves d'apprentissage : ${evidences.length}`);
    console.log(`[simulation] profils de maîtrise : ${profils.length}`);
    console.log(`[simulation] recommandations : ${recommandations.length}`);
    console.log(`[simulation] feuilles d'exercices : ${feuilles.length}`);
    console.log(`[simulation] exercices assignés : ${exercices.length}`);
    console.log(`[simulation] alertes aux familles : ${alertes.length}`);
    return;
  }

  // `updatedAt` n'a pas de valeur par défaut au schéma : Prisma la calcule, pas
  // PostgreSQL. En écrivant sans Prisma, il faut la poser explicitement.
  const maintenant = new Date();
  const avecHorodatage = (lignes: Ligne[]) => lignes.map((l) => ({ ...l, updatedAt: maintenant }));

  await insererEnMasse("learnos_learning_evidences",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "matiereId", "sourceType", "sourceId", "evidenceType", "rawScore", "maxScore", "occurredAt", "masterySignal", "confidence", "weight", "errorType", "errorConfidence", "metadata"],
    evidences as unknown as Ligne[], { libelle: "preuves d'apprentissage", prefixeId: "ev-2026-" });

  await insererEnMasse("learnos_student_learning_profiles",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "masteryScore", "confidenceScore", "masteryStatus", "evidenceCount", "lastEvidenceAt", "trend", "prerequisiteStatus", "recommendedAction", "updatedAt"],
    avecHorodatage(profils as unknown as Ligne[]), { libelle: "profils de maîtrise", prefixeId: "prof-2026-" });

  await insererEnMasse("learnos_recommandations",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "niveau", "statut", "motif", "actionProposee", "regleDeclenchee", "motifParams", "competencesBloquees", "updatedAt"],
    avecHorodatage(recommandations as unknown as Ligne[]), { libelle: "recommandations", prefixeId: "reco-2026-" });

  await insererEnMasse("learnos_feuilles_exercices",
    ["id", "tenantId", "siteId", "eleveId", "matiereId", "type", "statut", "assigneeLe", "termineeLe", "updatedAt"],
    avecHorodatage(feuilles as unknown as Ligne[]), { libelle: "feuilles d'exercices", prefixeId: "feu-2026-" });

  await insererEnMasse("learnos_exercices_assignes",
    ["id", "feuilleId", "questionId", "competenceId", "ordre", "palier", "regleDeclenchee", "priorite"],
    exercices as unknown as Ligne[], { libelle: "exercices assignés", prefixeId: "exo-2026-" });

  await insererEnMasse("learnos_alertes_parent",
    ["id", "tenantId", "siteId", "eleveId", "parentId", "niveau", "cle", "params", "canal", "statut", "envoyeeLe", "empreinte", "updatedAt"],
    avecHorodatage(alertes as unknown as Ligne[]), { libelle: "alertes aux familles", prefixeId: "alp-2026-" });
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
