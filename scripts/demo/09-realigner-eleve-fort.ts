/**
 * Démo Ambouli — étape 9 : l'élève fort de la famille de démonstration l'est
 * aussi dans LEARNOS, et dans son bulletin de l'année en cours.
 *
 * CE QUI CLOCHAIT
 * `niveauEleve` déduit le niveau d'un élève de son identifiant. Pour les deux
 * fiches de l'enfant « fort » du compte parent (17,75 de moyenne, fixée à la
 * main par l'étape 1), ce calcul donnait 7/20 en 2025-2026 et 9,9/20 en
 * 2026-2027. Les étapes 3, 5 et 8 lui ont donc écrit les notes et le volet
 * LEARNOS d'un élève moyen ou en difficulté : preuves basses, recommandations
 * critiques, plan de remédiation, alertes « maîtrise fragile » à la famille.
 * L'entraînement servait de la reprise des bases aux deux enfants, et la
 * démonstration ne montrait aucune différence entre eux.
 *
 * CE QUE CE SCRIPT FAIT, pour chaque fiche, sans rien supprimer :
 *   • les notes de 2026-2027 (`note-2026-`) : recalculées autour de 17,75 ;
 *   • les preuves générées (`evf-`, `ev-2026-`) : même calendrier, scores
 *     recalculés — celles qui découlent d'une note reprennent cette note ;
 *   • les profils de maîtrise correspondants ;
 *   • les recommandations : « excellence » au-delà du seuil, closes sinon ;
 *   • les plans de remédiation → approfondissement, sur ses meilleures
 *     compétences, avec les interventions qui les accompagnent ;
 *   • les alertes « maîtrise fragile » à la famille : écartées ;
 *   • les feuilles de remédiation : requalifiées.
 *
 * Ce qu'il ne touche PAS : absences, incidents et alertes de devoirs en
 * retard, qui ne découlent pas du niveau scolaire.
 *
 * DÉTERMINISTE ET IDEMPOTENT : le tirage est semé par identifiant, une seconde
 * exécution réécrit les mêmes valeurs.
 *
 *   pnpm exec tsx --env-file=.env scripts/demo/09-realigner-eleve-fort.ts [--dry-run]
 */

import { Client } from "pg";
import { mulberry32 } from "../../prisma/seed-ambouli-helpers";
import { niveauEleve } from "./_profil-eleve";

const DRY = process.argv.includes("--dry-run");

const TENANT = "tenant-ambouli";
/** Ragueh Mahamoud — 2nde D en 2025-2026, 1ère S en 2026-2027. */
const FICHES = ["ele-ambouli-2025-0445", "ele-ambouli-2026-0449"];

const borner = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const arrondi = (v: number) => Math.round(v * 100) / 100;

function graine(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Trois relevés d'un élève solide : il part de son niveau et progresse un peu.
 * La dispersion est voulue — un profil à 95 % partout ne montrerait qu'un seul
 * palier d'exercice, alors qu'un bon élève a lui aussi des acquis à entretenir.
 */
function releves(eleveId: string, competenceId: string): number[] {
  const alea = mulberry32(graine(`${eleveId}|${competenceId}`));
  let maitrise = borner(niveauEleve(eleveId) / 20 - 0.03 + (alea() - 0.5) * 0.24, 0.7, 0.96);
  return [0, 1, 2].map(() => {
    maitrise = borner(maitrise + 0.02 + (alea() - 0.5) * 0.06, 0.6, 0.99);
    return arrondi(maitrise);
  });
}

/** Une note autour du niveau : un bon élève peut rater une interrogation. */
function note(eleveId: string, noteId: string): number {
  const alea = mulberry32(graine(noteId));
  // Somme de trois tirages : une cloche, sans dépendre d'un générateur global.
  const ecart = (alea() + alea() + alea() - 1.5) * 2.4;
  return Math.round(borner(niveauEleve(eleveId) + ecart, 13, 20) * 4) / 4;
}

interface Preuve {
  id: string;
  competenceId: string;
  sourceId: string;
  occurredAt: Date;
  libelle: string;
  matiereId: string;
  matiere: string;
}

async function realigner(c: Client, eleveId: string) {
  console.log(`\n── ${eleveId} (niveau ${niveauEleve(eleveId)}) ──`);

  // Notes générées pour 2026-2027. La fiche 2025-2026 tient les siennes de
  // l'étape 1, déjà à 17,75 : la requête n'y trouve rien.
  // Le filtre sur l'identifiant se fait ici et non en SQL : un `like` sur la
  // clé primaire fait abandonner l'index par élève, et la requête expire.
  const notes = (
    (await c.query(`select id, "evaluationId" from notes where "eleveId" = $1`, [eleveId])).rows as {
      id: string;
      evaluationId: string | null;
    }[]
  ).filter((n) => n.id.startsWith("note-2026-"));
  const noteParEvaluation = new Map<string, number>();
  const nouvellesNotes = notes.map((n) => {
    const valeur = note(eleveId, n.id);
    if (n.evaluationId) noteParEvaluation.set(n.evaluationId, valeur);
    return { id: n.id, valeur };
  });

  const preuves = (
    await c.query(
      `select e.id, e."competenceId", e."sourceId", e."occurredAt", k.libelle, ch."matiereId", m.nom matiere
         from learnos_learning_evidences e
         join learnos_competences k on k.id = e."competenceId"
         join learnos_chapitres ch on ch.id = k."chapitreId"
         join matieres m on m.id = ch."matiereId"
        where e."tenantId" = $1 and e."eleveId" = $2
        order by e."occurredAt", e.id`,
      [TENANT, eleveId]
    )
  ).rows.filter((p: Preuve) => p.id.startsWith("evf-") || p.id.startsWith("ev-2026-")) as Preuve[];

  const parCompetence = new Map<string, (Preuve & { score: number })[]>();
  for (const p of preuves) {
    const tirage = releves(eleveId, p.competenceId);
    // Une preuve tirée d'une évaluation notée reprend la note : le bulletin et
    // le profil de compétences doivent raconter le même devoir.
    const notee = noteParEvaluation.get(p.sourceId);
    const score =
      notee !== undefined ? arrondi(notee / 20) : (tirage[Number(p.id.slice(-1))] ?? tirage[2]);
    const liste = parCompetence.get(p.competenceId);
    if (liste) liste.push({ ...p, score });
    else parCompetence.set(p.competenceId, [{ ...p, score }]);
  }

  // Les preuves sont triées par date : la première et la dernière de chaque
  // compétence donnent la tendance et le niveau final.
  const bilan = [...parCompetence.entries()].map(([competenceId, liste]) => ({
    competenceId,
    libelle: liste[0].libelle,
    matiereId: liste[0].matiereId,
    matiere: liste[0].matiere,
    premiere: liste[0].score,
    finale: liste[liste.length - 1].score,
    derniere: liste[liste.length - 1].occurredAt,
    lignes: liste,
  }));

  const excellentes = bilan.filter((b) => b.finale > 0.92);
  const classees = [...bilan].sort((a, b) => b.finale - a.finale);
  const moyenne = arrondi(bilan.reduce((s, b) => s + b.finale, 0) / Math.max(1, bilan.length));
  const moyenneNotes =
    nouvellesNotes.length > 0
      ? arrondi(nouvellesNotes.reduce((s, n) => s + n.valeur, 0) / nouvellesNotes.length)
      : null;

  console.log(`${nouvellesNotes.length} notes à réécrire${moyenneNotes !== null ? ` — moyenne ${moyenneNotes}` : ""}`);
  console.log(`${bilan.length} compétences, ${preuves.length} preuves à réécrire`);
  console.log(`maîtrise finale moyenne : ${moyenne} — ${excellentes.length} au-delà de 0,92`);
  if (DRY || bilan.length === 0) return;

  for (const n of nouvellesNotes) {
    await c.query(`update notes set valeur = $2, "updatedAt" = now() where id = $1`, [n.id, n.valeur]);
  }

  for (const b of bilan) {
    for (const l of b.lignes) {
      await c.query(
        `update learnos_learning_evidences
            set "masterySignal" = $2, "rawScore" = $3, "errorType" = null, "errorConfidence" = null
          where id = $1`,
        [l.id, l.score, Math.round(l.score * 20 * 4) / 4]
      );
    }

    await c.query(
      `update learnos_student_learning_profiles
          set "masteryScore" = $3, "masteryStatus" = $4::"MasteryStatus", trend = $5,
              "prerequisiteStatus" = '{"checked": true, "missing": 0}'::jsonb,
              "recommendedAction" = $6, "updatedAt" = now()
        where "eleveId" = $1 and "competenceId" = $2`,
      [
        eleveId,
        b.competenceId,
        b.finale,
        b.finale >= 0.8 ? "MASTERED" : "PROFICIENT",
        b.finale > b.premiere + 0.05 ? "hausse" : b.finale < b.premiere - 0.05 ? "baisse" : "stable",
        b.finale > 0.9 ? "enrichment" : null,
      ]
    );

    if (b.finale > 0.92) {
      await c.query(
        `update learnos_recommandations
            set niveau = 'EXCELLENCE', statut = 'PROPOSEE', "resolueLe" = null,
                motif = $3, "actionProposee" = 'Parcours d''approfondissement',
                "regleDeclenchee" = 'reco.excellence', "motifParams" = $4::jsonb,
                "competencesBloquees" = 0, "updatedAt" = now()
          where "eleveId" = $1 and "competenceId" = $2 and id like 'reco%'`,
        [
          eleveId,
          b.competenceId,
          `Excellence (${Math.round(b.finale * 100)} %) sur ${b.libelle}`,
          JSON.stringify({ competence: b.libelle, mastery: b.finale }),
        ]
      );
    } else {
      // Ni critique ni fragile : la recommandation n'a plus d'objet. Elle est
      // close à la date du dernier relevé, pas effacée.
      await c.query(
        `update learnos_recommandations set "resolueLe" = $3, "updatedAt" = now()
          where "eleveId" = $1 and "competenceId" = $2 and id like 'reco%'`,
        [eleveId, b.competenceId, b.derniere]
      );
    }

    await c.query(
      `update learnos_feuilles_exercices f set type = $3, "updatedAt" = now()
        where f."eleveId" = $1 and f.id like 'feu%' and f.type = 'remediation'
          and exists (select 1 from learnos_exercices_assignes x
                       where x."feuilleId" = f.id and x."competenceId" = $2)`,
      [eleveId, b.competenceId, b.finale > 0.85 ? "approfondissement" : "entrainement"]
    );
    await c.query(
      `update learnos_exercices_assignes x
          set "regleDeclenchee" = 'exo.consolidation', priorite = 3
         from learnos_feuilles_exercices f
        where f.id = x."feuilleId" and f."eleveId" = $1 and f.id like 'feu%'
          and x."competenceId" = $2 and x."regleDeclenchee" = 'exo.remediation'`,
      [eleveId, b.competenceId]
    );
  }

  // Les plans : même calendrier, même enseignant, autre objet. Chaque plan
  // reçoit les meilleures compétences encore libres, pour que deux plans du
  // même élève ne portent pas sur les mêmes.
  const plans = (
    await c.query(
      `select p.id, array_agg(e.id order by e.ordre) etapes
         from learnos_plans_progression p
         left join learnos_etapes_plan e on e."planId" = p.id
        where p."eleveId" = $1 and p.type = 'remediation'
        group by p.id order by p.id`,
      [eleveId]
    )
  ).rows as { id: string; etapes: (string | null)[] }[];
  const actions = [
    "Problème ouvert à résoudre en autonomie",
    "Série d'exercices de transfert, hors du cadre du cours",
    "Présentation de la démarche à la classe",
  ];
  let rang = 0;
  for (const plan of plans) {
    const etapes = plan.etapes.filter((e): e is string => e !== null);
    const retenues = classees.slice(rang, rang + Math.max(1, etapes.length));
    rang += retenues.length;
    const premier = retenues[0] ?? classees[0];
    await c.query(
      `update learnos_plans_progression
          set type = 'approfondissement', "matiereId" = $2, motif = $3,
              "regleDeclenchee" = 'plan_potentiel_eleve', "motifParams" = $4::jsonb,
              "masteryAvant" = $5, "updatedAt" = now()
        where id = $1`,
      [
        plan.id,
        premier.matiereId,
        `${premier.matiere} — ${excellentes.length} compétences sont maîtrisées au-delà des attendus : ` +
          `un parcours d'approfondissement entretiendrait l'engagement.`,
        JSON.stringify({ matiere: premier.matiere, n: excellentes.length }),
        premier.finale,
      ]
    );
    for (const [i, etapeId] of etapes.entries()) {
      const b = retenues[i] ?? premier;
      await c.query(
        `update learnos_etapes_plan set "competenceId" = $2, action = $3, responsable = 'eleve' where id = $1`,
        [etapeId, b.competenceId, actions[i % actions.length]]
      );
    }
  }

  const meilleure = classees[0];
  await c.query(
    `update learnos_student_interventions
        set "competenceId" = $2, "interventionType" = 'enrichment', reason = $3,
            "recommendedAction" = 'Parcours d''approfondissement en autonomie', "updatedAt" = now()
      where "eleveId" = $1 and "interventionType" in ('prerequisite_review', 'remediation')`,
    [
      eleveId,
      meilleure.competenceId,
      `Maîtrise à ${Math.round(meilleure.finale * 100)} % après plusieurs relevés concordants`,
    ]
  );

  // Une alerte « maîtrise fragile » envoyée pour un élève qui ne l'est pas :
  // écartée comme le ferait un enseignant, pas effacée (cf. `alertes-parent`).
  await c.query(
    `update learnos_alertes_parent
        set statut = 'SUPPRIMEE', "motifSuppression" = 'Alerte émise sur un profil erroné — réalignement de la démonstration'
      where "eleveId" = $1 and cle = 'learnos.alerte.maitriseFragile' and statut <> 'SUPPRIMEE'`,
    [eleveId]
  );
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("begin");
  try {
    for (const eleveId of FICHES) await realigner(c, eleveId);
    if (DRY) {
      await c.query("rollback");
      console.log("\n[simulation] rien n'est écrit.");
    } else {
      await c.query("commit");
      console.log("\nRéalignement écrit.");
    }
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
