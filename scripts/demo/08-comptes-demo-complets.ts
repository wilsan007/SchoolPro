/**
 * Démo Ambouli — étape 8 : les comptes pivot de la démonstration, complets.
 *
 * CIBLE
 * Les quatre fiches élèves de la famille de démonstration (celles que voit le
 * compte parent `admin@cite-ambouli.dj`, toutes années confondues : deux en
 * 2025-2026 pour les presets Time Machine, deux en 2026-2027 pour le présent),
 * parmi lesquelles la fiche liée au compte admin (rôle STUDENT). Le
 * rapprochement d'identité de `eleveDeLUtilisateur` / `enfantsDuParent` fait
 * le reste : même nom, même prénom, même date de naissance d'une année à
 * l'autre.
 *
 * CE QUI MANQUAIT
 * L'étape 5 ne déroulait LEARNOS que sur le PREMIER chapitre de quatre
 * matières : les onglets « compétences », « entraînement » et « suivi » de ces
 * comptes ouvraient sur trois compétences et deux feuilles, quand la
 * démonstration promet un programme complet.
 *
 * CE QUE CE SCRIPT ÉCRIT, pour chaque compétence du niveau de chaque cible
 * (TOUTES matières, TOUS chapitres) :
 *   • trois preuves d'apprentissage datées dans la fenêtre du chapitre — le
 *     calendrier suit l'ordre des chapitres, étalé sur toute l'année scolaire ;
 *   • le profil de maîtrise correspondant (créé s'il manque, rafraîchi s'il
 *     existe déjà) ;
 *   • une recommandation quand un seuil est franchi ;
 *   • deux feuilles d'exercices de trois questions : une terminée, une en
 *     cours pour les premiers chapitres, à venir pour les suivants ;
 *   • une alerte à la famille pour les maîtrises fragiles des premiers
 *     chapitres — celles que la date courante peut révéler ;
 *   • un plan de progression avec trois étapes — faite, en cours, à faire —
 *     et l'intervention correspondante, approuvée par l'enseignant affecté.
 *
 * Les évaluations, notes, devoirs et absences de ces comptes existent déjà
 * (étapes 3 et 4) : ce script ne les duplique pas, il complète le volet
 * LEARNOS que ces étapes n'avaient déroulé que sur le premier chapitre.
 *
 * DÉTERMINISTE ET IDEMPOTENT : identifiants calculés, doublons ignorés.
 *
 *   pnpm exec tsx scripts/demo/08-comptes-demo-complets.ts [--dry-run]
 */

import {
  Prisma, PrismaClient, EvidenceType, ErrorType, MasteryStatus,
  NiveauRecommandation, StatutRecommandation, StatutFeuille, PalierExercice,
  NiveauAlerteParent, StatutPlan, StatutEtape, InterventionStatus,
} from "@prisma/client";
import { setSeed, pick, clamp, gauss } from "../../prisma/seed-ambouli-helpers";
import { niveauEleve } from "./_profil-eleve";
import { insererEnMasse, type Ligne } from "./_ecriture-massive";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

const TENANT = "tenant-ambouli";
const ADMIN_EMAIL = "admin@cite-ambouli.dj";

/** Rentrée par libellé d'année — la fenêtre de chaque chapitre en dépend. */
const RENTREES: Record<string, Date> = {
  "2024-2025": new Date(2024, 8, 15, 8, 0, 0),
  "2025-2026": new Date(2025, 8, 15, 8, 0, 0),
  "2026-2027": new Date(2026, 8, 2, 8, 0, 0),
};

/** Date de référence par année : là où la démonstration se place. */
const REFERENCES: Record<string, Date> = {
  "2024-2025": new Date(2025, 2, 15, 10, 0, 0),
  "2025-2026": new Date(2026, 2, 15, 10, 0, 0),
  "2026-2027": new Date(2026, 9, 10, 10, 0, 0),
};

/** Une année scolaire, en semaines de cours. */
const SEMAINES_ANNEE = 36;

const ACTIONS_ETAPE = [
  "Reprendre les prérequis avec l'élève en demi-groupe",
  "Série d'exercices ciblés à faire à la maison",
  "Point individuel de dix minutes en fin de cours",
  "Nouvelle évaluation de la compétence",
  "Information et point avec la famille",
];

/** Date au milieu de la semaine `semaine` de l'année démarrant à `rentree`. */
function dateSemaine(rentree: Date, semaine: number): Date {
  return new Date(rentree.getTime() + (semaine * 7 - 3) * 86400000);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20260920);

  // ── Les cibles : la famille de démonstration, toutes années ──────────
  const parent = await prisma.parent.findFirst({
    where: { tenantId: TENANT, user: { email: ADMIN_EMAIL } },
    select: { id: true },
  });
  if (!parent) throw new Error("Parent de démonstration introuvable");

  const cibles = await prisma.eleve.findMany({
    where: {
      tenantId: TENANT,
      deletedAt: null,
      parents: { some: { parentId: parent.id } },
      classe: { annee: { in: Object.keys(RENTREES) } },
    },
    select: {
      id: true, prenom: true, nom: true, siteId: true,
      classe: { select: { id: true, nom: true, niveau: true, annee: true } },
    },
  });
  if (cibles.length === 0) throw new Error("Aucun enfant de démonstration trouvé");
  console.log(`${cibles.length} fiches cibles :`);
  for (const c of cibles) console.log(`  ${c.prenom} ${c.nom} — ${c.classe?.nom} (${c.classe?.annee})`);

  // La banque de questions, partagée : compétence → questions disponibles.
  const banque = new Map<string, { id: string; palier: PalierExercice }[]>();
  for (const q of await prisma.question.findMany({
    where: { actif: true, langue: "fr" },
    select: { id: true, competenceId: true, palier: true },
  })) {
    if (!q.competenceId) continue;
    const liste = banque.get(q.competenceId) ?? [];
    liste.push({ id: q.id, palier: q.palier });
    banque.set(q.competenceId, liste);
  }

  // Qui enseigne quoi : pour valider plans et interventions.
  const affectations = await prisma.affectationEnseignant.findMany({
    where: { tenantId: TENANT },
    select: { classeId: true, matiereId: true, enseignant: { select: { userId: true } } },
  });
  const profDe = new Map<string, string>();
  for (const a of affectations) profDe.set(`${a.classeId}|${a.matiereId}`, a.enseignant.userId);

  const evidences: Prisma.LearningEvidenceCreateManyInput[] = [];
  const profils: Prisma.StudentLearningProfileCreateManyInput[] = [];
  const recommandations: Prisma.RecommandationCreateManyInput[] = [];
  const feuilles: Prisma.FeuilleExercicesCreateManyInput[] = [];
  const exercices: Prisma.ExerciceAssigneCreateManyInput[] = [];
  const alertes: Prisma.AlerteParentCreateManyInput[] = [];
  /** Profils déjà présents (étape 5) : à rafraîchir plutôt qu'insérer. */
  const rafraichir: { eleveId: string; competenceId: string; data: Prisma.StudentLearningProfileUpdateInput }[] = [];
  /** Les 3 compétences les plus fragiles par élève : pour le plan. */
  const plusFragiles = new Map<string, { competenceId: string; matiereId: string; libelle: string; mastery: number }[]>();

  for (const eleve of cibles) {
    const classe = eleve.classe;
    if (!classe) continue;
    const rentree = RENTREES[classe.annee];
    const reference = REFERENCES[classe.annee];
    if (!rentree || !reference) continue;

    // Toutes les compétences du niveau, groupées par chapitre, tous sujets.
    const competences = await prisma.competence.findMany({
      where: { tenantId: TENANT, chapitre: { niveau: classe.niveau } },
      select: {
        id: true, libelle: true, ordre: true,
        chapitre: {
          select: { id: true, nom: true, ordre: true, matiereId: true, matiere: { select: { code: true, nom: true } } },
        },
      },
      orderBy: [{ chapitre: { ordre: "asc" } }, { ordre: "asc" }],
    });
    if (competences.length === 0) continue;

    // Nombre de chapitres distincts par matière : la fenêtre de chaque
    // chapitre est l'année divisée par ce nombre — les chapitres s'étalent
    // sur les 36 semaines de l'année scolaire.
    const chapitresParMatiere = new Map<string, number>();
    const vusChapitres = new Set<string>();
    for (const c of competences) {
      if (vusChapitres.has(c.chapitre.id)) continue;
      vusChapitres.add(c.chapitre.id);
      chapitresParMatiere.set(c.chapitre.matiereId, (chapitresParMatiere.get(c.chapitre.matiereId) ?? 0) + 1);
    }

    // Ordre du chapitre dans SA matière (les `ordre` sont globaux au niveau).
    const ordreChapitre = new Map<string, number>();
    {
      const vus = new Map<string, Set<string>>();
      for (const c of competences) {
        const set = vus.get(c.chapitre.matiereId) ?? new Set<string>();
        if (!set.has(c.chapitre.id)) {
          set.add(c.chapitre.id);
          ordreChapitre.set(c.chapitre.id, set.size);
        }
        vus.set(c.chapitre.matiereId, set);
      }
    }

    const existants = await prisma.studentLearningProfile.findMany({
      where: { tenantId: TENANT, eleveId: eleve.id },
      select: { competenceId: true, evidenceCount: true },
    });
    const dejaProfile = new Set(existants.map((p) => p.competenceId));
    const compteExistants = new Map(existants.map((p) => [p.competenceId, p.evidenceCount]));
    const fragiles: { competenceId: string; matiereId: string; libelle: string; mastery: number }[] = [];
    let alertesPosees = 0;

    for (const comp of competences) {
      const matiereId = comp.chapitre.matiereId;
      const nbChapitres = chapitresParMatiere.get(matiereId) ?? 1;
      const k = ordreChapitre.get(comp.chapitre.id) ?? 1;
      const pas = SEMAINES_ANNEE / nbChapitres;
      const semaineDebut = 1 + Math.floor((k - 1) * pas);

      // Trois relevés dans la fenêtre du chapitre : début, milieu, fin.
      const semaines = [
        semaineDebut + Math.max(0, Math.round(pas * 0.2)),
        semaineDebut + Math.round(pas * 0.55),
        semaineDebut + Math.max(1, Math.round(pas * 0.85)),
      ];
      const dates = semaines.map((s) => dateSemaine(rentree, s));

      // La maîtrise évolue depuis le niveau scolaire de l'élève : les forts
      // progressent, les fragiles décrochent doucement — c'est la variation
      // que les onglets doivent montrer.
      const base = clamp(niveauEleve(eleve.id) / 20 + gauss(0, 0.07), 0.06, 0.96);
      const pente = base > 0.55 ? 0.035 : -0.012;
      let maitrise = base;
      const releves = [0, 1, 2].map(() => {
        maitrise = clamp(maitrise + gauss(pente, 0.05), 0.03, 0.99);
        return maitrise;
      });
      const finale = releves[releves.length - 1];
      const premiere = releves[0];

      const types = [EvidenceType.QUIZ, EvidenceType.EXERCICE, EvidenceType.DEVOIR];
      releves.forEach((m, i) => {
        evidences.push({
          id: `evf-${eleve.id}-${comp.id}-${i}`,
          tenantId: TENANT,
          siteId: eleve.siteId,
          eleveId: eleve.id,
          competenceId: comp.id,
          matiereId,
          sourceType: "exercice",
          sourceId: `srcf-${eleve.id}-${comp.id}`,
          evidenceType: types[i],
          rawScore: Math.round(m * 20 * 4) / 4,
          maxScore: 20,
          occurredAt: dates[i],
          masterySignal: Math.round(m * 100) / 100,
          confidence: clamp(0.55 + i * 0.14, 0.5, 0.92),
          weight: 1,
          errorType: m < 0.4 ? pick([ErrorType.CONCEPTUAL_ERROR, ErrorType.PROCEDURAL_ERROR, ErrorType.MISSING_PREREQUISITE]) : null,
          errorConfidence: m < 0.4 ? 0.7 : null,
          metadata: { annee: classe.annee, chapitre: comp.chapitre.nom, competence: comp.libelle },
        });
      });

      const statut = finale < 0.35 ? MasteryStatus.EMERGING
        : finale < 0.55 ? MasteryStatus.DEVELOPING
          : finale < 0.8 ? MasteryStatus.PROFICIENT
            : MasteryStatus.MASTERED;
      const profilData = {
        masteryScore: Math.round(finale * 100) / 100,
        confidenceScore: 0.85,
        masteryStatus: statut,
        evidenceCount: (compteExistants.get(comp.id) ?? 0) + releves.length,
        lastEvidenceAt: dates[dates.length - 1],
        trend: finale > premiere + 0.05 ? "hausse" : finale < premiere - 0.05 ? "baisse" : "stable",
        prerequisiteStatus: { checked: true, missing: finale < 0.35 ? 2 : 0 },
        recommendedAction: finale < 0.35 ? "remediation" : finale < 0.55 ? "retest" : finale > 0.9 ? "enrichment" : null,
      };
      if (dejaProfile.has(comp.id)) {
        rafraichir.push({ eleveId: eleve.id, competenceId: comp.id, data: profilData });
      } else {
        profils.push({
          id: `proff-${eleve.id}-${comp.id}`,
          tenantId: TENANT,
          siteId: eleve.siteId,
          eleveId: eleve.id,
          competenceId: comp.id,
          ...profilData,
        });
      }

      if (finale < 0.55) {
        fragiles.push({ competenceId: comp.id, matiereId, libelle: comp.libelle, mastery: finale });
      }

      // Recommandation quand un seuil est franchi.
      const niveauReco = finale < 0.35 ? NiveauRecommandation.CRITIQUE
        : finale < 0.55 ? NiveauRecommandation.FRAGILE
          : finale > 0.92 ? NiveauRecommandation.EXCELLENCE
            : null;
      if (niveauReco) {
        recommandations.push({
          id: `recof-${eleve.id}-${comp.id}`,
          tenantId: TENANT,
          siteId: eleve.siteId,
          eleveId: eleve.id,
          competenceId: comp.id,
          niveau: niveauReco,
          statut: niveauReco === NiveauRecommandation.CRITIQUE
            ? StatutRecommandation.OBLIGATOIRE
            : pick([StatutRecommandation.RECOMMANDEE, StatutRecommandation.PROPOSEE, StatutRecommandation.ACCEPTEE, StatutRecommandation.ECARTEE]),
          motif: `${niveauReco === NiveauRecommandation.EXCELLENCE ? "Excellence" : finale < 0.35 ? "Maîtrise critique" : "Maîtrise fragile"} (${Math.round(finale * 100)} %) sur ${comp.libelle}`,
          actionProposee: niveauReco === NiveauRecommandation.CRITIQUE
            ? "Plan de remédiation : reprise des prérequis"
            : niveauReco === NiveauRecommandation.FRAGILE
              ? "Exercices ciblés puis nouvelle évaluation"
              : "Parcours d'approfondissement",
          regleDeclenchee: `reco.${niveauReco.toLowerCase()}`,
          motifParams: { competence: comp.libelle, mastery: Math.round(finale * 100) / 100 },
          competencesBloquees: finale < 0.35 ? 2 : 0,
        });
      }

      // Deux feuilles par compétence : une terminée dans la fenêtre du
      // chapitre, une en cours (premiers chapitres) ou à venir (suivants) —
      // c'est ce qui remplit « mon entraînement » à chaque preset.
      const questions = banque.get(comp.id) ?? [];
      if (questions.length > 0) {
        for (const [rang, etat] of [
          [0, StatutFeuille.TERMINEE],
          [1, k <= 2 ? StatutFeuille.EN_COURS : StatutFeuille.ASSIGNEE],
        ] as const) {
          const feuilleId = `feuf-${eleve.id}-${comp.id}-${rang}`;
          const assignee = dates[rang === 0 ? 0 : 1];
          feuilles.push({
            id: feuilleId,
            tenantId: TENANT,
            siteId: eleve.siteId,
            eleveId: eleve.id,
            matiereId,
            type: finale < 0.45 ? "remediation" : finale > 0.85 ? "approfondissement" : "entrainement",
            statut: etat,
            assigneeLe: assignee,
            termineeLe: etat === StatutFeuille.TERMINEE ? new Date(assignee.getTime() + 3 * 86400000) : null,
          });

          let ordre = 0;
          for (const q of questions.slice(0, 3)) {
            exercices.push({
              id: `exof-${feuilleId}-${ordre}`,
              feuilleId,
              questionId: q.id,
              competenceId: comp.id,
              ordre: ordre++,
              palier: q.palier,
              regleDeclenchee: finale < 0.45 ? "exo.remediation" : "exo.consolidation",
              priorite: finale < 0.45 ? 1 : 3,
            });
          }
        }
      }

      // Alerte à la famille : deux au plus, sur les chapitres que la date de
      // référence peut révéler — le reste appartient au futur de l'année.
      if (finale < 0.45 && k <= 3 && alertesPosees < 2 && dates[1] <= reference) {
        alertesPosees++;
        alertes.push({
          id: `alpf-${eleve.id}-${comp.id}`,
          tenantId: TENANT,
          siteId: eleve.siteId,
          eleveId: eleve.id,
          parentId: parent.id,
          niveau: finale < 0.3 ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION,
          cle: "learnos.alerte.maitriseFragile",
          params: { classe: classe.nom, competence: comp.libelle, matiere: comp.chapitre.matiere.nom },
          canal: "whatsapp",
          statut: "ENVOYEE",
          envoyeeLe: dates[1],
          empreinte: `empf-${eleve.id}-${comp.id}`,
        });
      }
    }

    plusFragiles.set(eleve.id, fragiles.sort((a, b) => a.mastery - b.mastery).slice(0, 3));
    console.log(`  ${eleve.prenom} ${eleve.nom} : ${competences.length} compétences couvertes`);
  }

  // ── Plans de progression + étapes + interventions ────────────────────
  const plans: Prisma.PlanProgressionCreateManyInput[] = [];
  const etapes: Prisma.EtapePlanCreateManyInput[] = [];
  const interventions: Prisma.StudentInterventionCreateManyInput[] = [];

  for (const eleve of cibles) {
    const classe = eleve.classe;
    if (!classe) continue;
    const reference = REFERENCES[classe.annee];
    if (!reference) continue;
    const fragiles = plusFragiles.get(eleve.id) ?? [];
    if (fragiles.length === 0) continue;

    const premier = fragiles[0];
    const responsable = profDe.get(`${classe.id}|${premier.matiereId}`) ?? null;
    const planId = `planf-${eleve.id}`;
    const debut = new Date(reference.getTime() - 21 * 86400000);
    const revue = new Date(reference.getTime() + 14 * 86400000);

    plans.push({
      id: planId,
      tenantId: TENANT,
      siteId: eleve.siteId,
      eleveId: eleve.id,
      matiereId: premier.matiereId,
      type: "remediation",
      origine: "automatique",
      statut: StatutPlan.ACTIF,
      motif: `Maîtrise insuffisante sur ${fragiles.length} compétence(s), dont « ${premier.libelle} »`,
      regleDeclenchee: "plan.remediation.maitriseCritique",
      motifParams: { competences: fragiles.map((f) => f.libelle), mastery: premier.mastery },
      responsableUserId: responsable,
      valideParId: responsable,
      valideLe: debut,
      dateDebut: debut,
      dateRevue: revue,
      parentInforme: true,
      masteryAvant: premier.mastery,
    });

    fragiles.forEach((f, i) => {
      // Une étape faite, une en cours, une à faire : c'est le cycle que
      // l'écran « à faire cette semaine » doit montrer.
      const etat = i === 0 ? StatutEtape.FAIT : i === 1 ? StatutEtape.EN_COURS : StatutEtape.A_FAIRE;
      etapes.push({
        id: `etapef-${planId}-${i}`,
        planId,
        competenceId: f.competenceId,
        ordre: i,
        action: ACTIONS_ETAPE[i % ACTIONS_ETAPE.length],
        responsable: i === 1 ? "eleve" : "enseignant",
        echeance: new Date(reference.getTime() + (i + 1) * 7 * 86400000),
        statut: etat,
        valideeLe: etat === StatutEtape.FAIT ? reference : null,
      });
    });

    interventions.push({
      id: `intf-${eleve.id}`,
      tenantId: TENANT,
      siteId: eleve.siteId,
      eleveId: eleve.id,
      competenceId: premier.competenceId,
      reason: `Maîtrise à ${Math.round(premier.mastery * 100)} % après plusieurs relevés concordants`,
      evidenceRefs: [],
      interventionType: premier.mastery < 0.3 ? "prerequisite_review" : "remediation",
      recommendedAction: "Reprise des prérequis puis nouvelle évaluation",
      responsibleUserId: responsable,
      status: InterventionStatus.ACTIVE,
      startDate: debut,
      reviewDate: revue,
      createdByAi: true,
      approvedBy: responsable,
      approvedAt: debut,
    });
  }

  if (DRY) {
    console.log(`[simulation] preuves d'apprentissage : ${evidences.length}`);
    console.log(`[simulation] profils de maîtrise : ${profils.length} (+ ${rafraichir.length} à rafraîchir)`);
    console.log(`[simulation] recommandations : ${recommandations.length}`);
    console.log(`[simulation] feuilles d'exercices : ${feuilles.length}`);
    console.log(`[simulation] exercices assignés : ${exercices.length}`);
    console.log(`[simulation] alertes aux familles : ${alertes.length}`);
    console.log(`[simulation] plans : ${plans.length}, étapes : ${etapes.length}, interventions : ${interventions.length}`);
    return;
  }

  // `updatedAt` n'a pas de valeur par défaut au schéma : Prisma la calcule,
  // pas PostgreSQL. En écrivant sans Prisma, il faut la poser explicitement.
  const maintenant = new Date();
  const avecHorodatage = (lignes: Ligne[]) => lignes.map((l) => ({ ...l, updatedAt: maintenant }));

  await insererEnMasse("learnos_learning_evidences",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "matiereId", "sourceType", "sourceId", "evidenceType", "rawScore", "maxScore", "occurredAt", "masterySignal", "confidence", "weight", "errorType", "errorConfidence", "metadata"],
    evidences as unknown as Ligne[], { libelle: "preuves d'apprentissage", prefixeId: "evf-" });

  await insererEnMasse("learnos_student_learning_profiles",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "masteryScore", "confidenceScore", "masteryStatus", "evidenceCount", "lastEvidenceAt", "trend", "prerequisiteStatus", "recommendedAction", "updatedAt"],
    avecHorodatage(profils as unknown as Ligne[]), { libelle: "profils de maîtrise", prefixeId: "proff-" });

  await insererEnMasse("learnos_recommandations",
    ["id", "tenantId", "siteId", "eleveId", "competenceId", "niveau", "statut", "motif", "actionProposee", "regleDeclenchee", "motifParams", "competencesBloquees", "updatedAt"],
    avecHorodatage(recommandations as unknown as Ligne[]), { libelle: "recommandations", prefixeId: "recof-" });

  await insererEnMasse("learnos_feuilles_exercices",
    ["id", "tenantId", "siteId", "eleveId", "matiereId", "type", "statut", "assigneeLe", "termineeLe", "updatedAt"],
    avecHorodatage(feuilles as unknown as Ligne[]), { libelle: "feuilles d'exercices", prefixeId: "feuf-" });

  await insererEnMasse("learnos_exercices_assignes",
    ["id", "feuilleId", "questionId", "competenceId", "ordre", "palier", "regleDeclenchee", "priorite"],
    exercices as unknown as Ligne[], { libelle: "exercices assignés", prefixeId: "exof-" });

  await insererEnMasse("learnos_alertes_parent",
    ["id", "tenantId", "siteId", "eleveId", "parentId", "niveau", "cle", "params", "canal", "statut", "envoyeeLe", "empreinte", "updatedAt"],
    avecHorodatage(alertes as unknown as Ligne[]), { libelle: "alertes aux familles", prefixeId: "alpf-" });

  // Les profils posés par l'étape 5 (premier chapitre) sont rafraîchis :
  // ils doivent refléter les trois relevés supplémentaires, pas les deux
  // anciens. Peu de lignes : Prisma suffit, inutile d'un passthrough SQL.
  let majs = 0;
  for (const r of rafraichir) {
    await prisma.studentLearningProfile.updateMany({
      where: { eleveId: r.eleveId, competenceId: r.competenceId, tenantId: TENANT },
      data: r.data,
    });
    majs++;
  }
  console.log(`profils de maîtrise rafraîchis : ${majs}`);

  await prisma.planProgression.createMany({ data: plans, skipDuplicates: true });
  console.log(`plans de progression : ${plans.length}`);
  await prisma.etapePlan.createMany({ data: etapes, skipDuplicates: true });
  console.log(`étapes de plan : ${etapes.length}`);
  await prisma.studentIntervention.createMany({ data: interventions, skipDuplicates: true });
  console.log(`interventions : ${interventions.length}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
