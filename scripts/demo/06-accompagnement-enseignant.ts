/**
 * Démo Ambouli — étape 6 : ce que l'enseignant a DÉJÀ FAIT.
 *
 * LA DIFFÉRENCE ENTRE CONSTATER ET AGIR
 * Les étapes précédentes montrent une école qui produit des constats : des
 * notes, des absences, des maîtrises fragiles, des recommandations. Mais une
 * démonstration qui s'arrête là décrit un tableau de bord, pas un outil de
 * travail. Ce qui emporte la conviction, c'est la trace de la DÉCISION :
 *
 *   • un plan d'accompagnement ouvert pour un élève nommé, avec ses étapes,
 *     dont certaines déjà faites et une encore à faire cette semaine ;
 *   • une intervention approuvée par l'enseignant, pas seulement proposée
 *     par le moteur ;
 *   • des feuilles d'exercices corrigées et validées, avec la date ;
 *   • des recommandations tranchées — acceptées ou écartées, jamais laissées
 *     en suspens par lot entier.
 *
 * C'est ce qui permet de dire pendant la démonstration : « voici l'élève en
 * difficulté, voici ce que son professeur a décidé le 12 octobre, voici où
 * ça en est aujourd'hui ».
 *
 * PORTÉE
 * Toutes les années où des profils de maîtrise existent (2024-2025,
 * 2025-2026, 2026-2027) : la Time Machine doit trouver de l'action à chacune
 * de ses positions, pas seulement à la dernière.
 *
 * DÉTERMINISTE ET IDEMPOTENT.
 *
 *   pnpm exec tsx scripts/demo/06-accompagnement-enseignant.ts [--dry-run]
 */

import {
  Prisma, PrismaClient, StatutPlan, StatutEtape, InterventionStatus,
  StatutRecommandation, StatutFeuille,
} from "@prisma/client";
import { setSeed, randInt, pick, chance } from "../../prisma/seed-ambouli-helpers";
import { insererEnMasse, type Ligne } from "./_ecriture-massive";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
const TENANT = "tenant-ambouli";

/** Une position d'année : son libellé et la date à laquelle on s'y place. */
const ANNEES = [
  { libelle: "2024-2025", reference: new Date(2025, 2, 15) },
  { libelle: "2025-2026", reference: new Date(2026, 2, 15) },
  { libelle: "2026-2027", reference: new Date(2026, 9, 10) },
];

const ACTIONS_ETAPE = [
  "Reprendre les prérequis avec l'élève en demi-groupe",
  "Série d'exercices ciblés à faire à la maison",
  "Point individuel de dix minutes en fin de cours",
  "Nouvelle évaluation de la compétence",
  "Information et point avec la famille",
];

async function ecrireParLots<T>(libelle: string, lignes: T[], ecrire: (lot: T[]) => Promise<{ count: number }>) {
  if (lignes.length === 0) return console.log(`${libelle} : rien à écrire`);
  if (DRY) return console.log(`[simulation] ${libelle} : ${lignes.length} ligne(s)`);
  let n = 0;
  for (let i = 0; i < lignes.length; i += 500) {
    const { count } = await ecrire(lignes.slice(i, i + 500));
    n += count;
  }
  console.log(`${libelle} : ${n} écrite(s) sur ${lignes.length} proposée(s)`);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20261010);

  // Qui enseigne quoi : c'est l'enseignant affecté qui décide, pas un acteur
  // anonyme. `AffectationEnseignant` reste la source de vérité.
  const affectations = await prisma.affectationEnseignant.findMany({
    where: { tenantId: TENANT },
    select: { classeId: true, matiereId: true, enseignant: { select: { userId: true } } },
  });
  const profDe = new Map<string, string>();
  for (const a of affectations) profDe.set(`${a.classeId}|${a.matiereId}`, a.enseignant.userId);

  const plans: Prisma.PlanProgressionCreateManyInput[] = [];
  const etapes: Prisma.EtapePlanCreateManyInput[] = [];
  const interventions: Prisma.StudentInterventionCreateManyInput[] = [];

  for (const annee of ANNEES) {
    // Les élèves dont une compétence est en difficulté : ce sont eux qu'un
    // enseignant accompagne. Les autres n'ont pas besoin d'un plan, et en
    // fabriquer un les banaliserait.
    const fragiles = await prisma.studentLearningProfile.findMany({
      where: {
        tenantId: TENANT,
        eleve: { classe: { annee: annee.libelle }, deletedAt: null },
        masteryScore: { lt: 0.45 },
      },
      select: {
        id: true, eleveId: true, competenceId: true, masteryScore: true, siteId: true,
        competence: { select: { libelle: true, chapitre: { select: { matiereId: true } } } },
        eleve: { select: { classeId: true, prenom: true, nom: true } },
      },
      orderBy: { masteryScore: "asc" },
      take: 900,
    });

    // Un plan par élève (pas par compétence) : un enseignant n'ouvre pas six
    // plans pour le même enfant, il en ouvre un et y met des étapes.
    const parEleve = new Map<string, typeof fragiles>();
    for (const p of fragiles) {
      const liste = parEleve.get(p.eleveId) ?? [];
      if (liste.length < 3) liste.push(p);
      parEleve.set(p.eleveId, liste);
    }

    for (const [eleveId, profils] of parEleve) {
      const premier = profils[0];
      const matiereId = premier.competence?.chapitre?.matiereId ?? null;
      const classeId = premier.eleve.classeId;
      const responsable = classeId && matiereId ? profDe.get(`${classeId}|${matiereId}`) ?? null : null;
      const planId = `plan-${annee.libelle.slice(0, 4)}-${eleveId}`;

      // Trois états, pour que la démonstration montre un cycle et non une
      // photographie : un plan qui tourne, un en revue, un déjà clos.
      const statut = chance(0.5) ? StatutPlan.ACTIF : chance(0.5) ? StatutPlan.EN_REVUE : StatutPlan.TERMINE;
      const debut = new Date(annee.reference.getTime() - 21 * 86400000);
      const revue = new Date(annee.reference.getTime() + 14 * 86400000);

      plans.push({
        id: planId,
        tenantId: TENANT,
        siteId: premier.siteId,
        eleveId,
        matiereId,
        type: "remediation",
        origine: "automatique",
        statut,
        motif: `Maîtrise insuffisante sur ${profils.length} compétence(s), dont « ${premier.competence?.libelle ?? "—"} »`,
        regleDeclenchee: "plan.remediation.maitriseCritique",
        motifParams: { competences: profils.map((p) => p.competence?.libelle).filter(Boolean), mastery: premier.masteryScore },
        responsableUserId: responsable,
        // Le moteur propose, l'enseignant valide : sans cette validation, le
        // plan n'est qu'une suggestion et la démonstration ne montre aucune
        // décision humaine.
        valideParId: responsable,
        valideLe: debut,
        dateDebut: debut,
        dateRevue: revue,
        dateFin: statut === StatutPlan.TERMINE ? revue : null,
        parentInforme: chance(0.7),
        masteryAvant: premier.masteryScore,
        masteryApres: statut === StatutPlan.TERMINE ? Math.min(0.95, premier.masteryScore + 0.22) : null,
        resultat: statut === StatutPlan.TERMINE ? "Progression constatée sur les compétences visées" : null,
      });

      profils.forEach((p, i) => {
        // L'étape en cours est celle qui donne à l'écran « à faire cette
        // semaine » quelque chose à dire.
        const etat = statut === StatutPlan.TERMINE
          ? StatutEtape.VALIDE
          : i === 0 ? StatutEtape.FAIT : i === 1 ? StatutEtape.EN_COURS : StatutEtape.A_FAIRE;
        etapes.push({
          id: `etape-${planId}-${i}`,
          planId,
          competenceId: p.competenceId,
          ordre: i,
          action: ACTIONS_ETAPE[i % ACTIONS_ETAPE.length],
          responsable: i === 1 ? "eleve" : "enseignant",
          echeance: new Date(annee.reference.getTime() + (i + 1) * 7 * 86400000),
          statut: etat,
          valideeLe: etat === StatutEtape.VALIDE || etat === StatutEtape.FAIT ? annee.reference : null,
        });
      });

      // L'intervention est la trace côté moteur : proposée par l'IA,
      // approuvée par un humain nommé, avec un résultat quand elle est close.
      const etatIntervention = statut === StatutPlan.TERMINE
        ? InterventionStatus.COMPLETED
        : statut === StatutPlan.EN_REVUE ? InterventionStatus.UNDER_REVIEW : InterventionStatus.ACTIVE;
      interventions.push({
        id: `interv-${annee.libelle.slice(0, 4)}-${eleveId}`,
        tenantId: TENANT,
        siteId: premier.siteId,
        eleveId,
        competenceId: premier.competenceId,
        reason: `Maîtrise à ${Math.round(premier.masteryScore * 100)} % après deux relevés concordants`,
        evidenceRefs: [],
        interventionType: premier.masteryScore < 0.3 ? "prerequisite_review" : "remediation",
        recommendedAction: "Reprise des prérequis puis nouvelle évaluation",
        responsibleUserId: responsable,
        status: etatIntervention,
        startDate: debut,
        reviewDate: revue,
        outcome: etatIntervention === InterventionStatus.COMPLETED ? "Compétence de nouveau évaluée, seuil atteint" : null,
        masteryBefore: premier.masteryScore,
        masteryAfter: etatIntervention === InterventionStatus.COMPLETED ? Math.min(0.95, premier.masteryScore + 0.25) : null,
        createdByAi: true,
        approvedBy: responsable,
        approvedAt: debut,
      });
    }
  }

  if (DRY) {
    console.log(`[simulation] plans d'accompagnement : ${plans.length}`);
    console.log(`[simulation] étapes de plan : ${etapes.length}`);
    console.log(`[simulation] interventions : ${interventions.length}`);
  } else {
    // `updatedAt` est calculé par Prisma, pas par PostgreSQL : en écrivant avec
    // le pilote `pg`, il faut le poser soi-même.
    const maintenant = new Date();
    const horodate = (lignes: Ligne[]) => lignes.map((l) => ({ ...l, updatedAt: maintenant }));

    await insererEnMasse("learnos_plans_progression",
      ["id", "tenantId", "siteId", "eleveId", "matiereId", "type", "origine", "statut", "motif", "regleDeclenchee", "motifParams", "responsableUserId", "valideParId", "valideLe", "dateDebut", "dateRevue", "dateFin", "parentInforme", "masteryAvant", "masteryApres", "resultat", "updatedAt"],
      horodate(plans as unknown as Ligne[]), { libelle: "plans d'accompagnement" });

    await insererEnMasse("learnos_etapes_plan",
      ["id", "planId", "competenceId", "ordre", "action", "responsable", "echeance", "statut", "valideeLe", "updatedAt"],
      horodate(etapes as unknown as Ligne[]), { libelle: "étapes de plan" });

    await insererEnMasse("learnos_student_interventions",
      ["id", "tenantId", "siteId", "eleveId", "competenceId", "reason", "evidenceRefs", "interventionType", "recommendedAction", "responsibleUserId", "status", "startDate", "reviewDate", "outcome", "masteryBefore", "masteryAfter", "createdByAi", "approvedBy", "approvedAt", "updatedAt"],
      horodate(interventions as unknown as Ligne[]), { libelle: "interventions" });
  }

  // ------------------------------------------------------------------
  // Les feuilles d'exercices corrigées
  // ------------------------------------------------------------------
  // Une feuille terminée par l'élève mais jamais regardée par personne laisse
  // penser que l'enseignant subit l'outil. On date la correction.
  const terminees = await prisma.feuilleExercices.findMany({
    where: { tenantId: TENANT, statut: StatutFeuille.TERMINEE, valideParId: null },
    select: { id: true, termineeLe: true, matiereId: true, eleve: { select: { classeId: true } } },
    take: 8000,
  });

  let validees = 0;
  if (!DRY) {
    // Regroupées par enseignant : une mise à jour par professeur plutôt que
    // huit mille écritures unitaires.
    const parProf = new Map<string, string[]>();
    for (const f of terminees) {
      const prof = f.eleve.classeId && f.matiereId ? profDe.get(`${f.eleve.classeId}|${f.matiereId}`) : null;
      if (!prof) continue;
      const liste = parProf.get(prof) ?? [];
      liste.push(f.id);
      parProf.set(prof, liste);
    }
    for (const [prof, ids] of parProf) {
      for (let i = 0; i < ids.length; i += 500) {
        const lot = ids.slice(i, i + 500);
        const { count } = await prisma.feuilleExercices.updateMany({
          where: { id: { in: lot } },
          data: { valideParId: prof, valideeLe: new Date(2026, 9, 12, 17, 0, 0) },
        });
        validees += count;
      }
    }
  }
  console.log(`feuilles d'exercices corrigées : ${DRY ? terminees.length + " (simulation)" : validees}`);

  // ------------------------------------------------------------------
  // Les recommandations tranchées
  // ------------------------------------------------------------------
  // Une file d'attente entièrement en attente donne l'image d'un outil que
  // personne n'utilise. On en tranche les deux tiers — acceptées pour la
  // plupart, écartées quand l'enseignant a jugé autrement.
  const enAttente = await prisma.recommandation.findMany({
    where: { tenantId: TENANT, decideParId: null, statut: { in: [StatutRecommandation.PROPOSEE, StatutRecommandation.RECOMMANDEE] } },
    select: { id: true, eleve: { select: { classeId: true } }, competence: { select: { chapitre: { select: { matiereId: true } } } } },
    take: 6000,
  });

  let tranchees = 0;
  if (!DRY) {
    const acceptees = new Map<string, string[]>();
    const ecartees = new Map<string, string[]>();
    for (const r of enAttente) {
      if (!chance(0.66)) continue;
      const matiereId = r.competence?.chapitre?.matiereId;
      const prof = r.eleve.classeId && matiereId ? profDe.get(`${r.eleve.classeId}|${matiereId}`) : null;
      if (!prof) continue;
      const cible = chance(0.8) ? acceptees : ecartees;
      const liste = cible.get(prof) ?? [];
      liste.push(r.id);
      cible.set(prof, liste);
    }
    for (const [statut, carte] of [[StatutRecommandation.ACCEPTEE, acceptees], [StatutRecommandation.ECARTEE, ecartees]] as const) {
      for (const [prof, ids] of carte) {
        for (let i = 0; i < ids.length; i += 500) {
          const lot = ids.slice(i, i + 500);
          const { count } = await prisma.recommandation.updateMany({
            where: { id: { in: lot } },
            data: { statut, decideParId: prof, decideeLe: new Date(2026, 9, 8, 16, 0, 0) },
          });
          tranchees += count;
        }
      }
    }
  }
  console.log(`recommandations tranchées : ${DRY ? Math.round(enAttente.length * 0.66) + " (simulation)" : tranchees}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
