/**
 * Démo Ambouli — étape 9 : l'élève fort de la famille de démonstration l'est
 * aussi dans LEARNOS.
 *
 * CE QUI CLOCHAIT
 * `niveauEleve` déduit le niveau d'un élève de son identifiant. Pour la fiche
 * 2025-2026 de l'enfant « fort » du compte parent (17,75 de moyenne, fixée à la
 * main par l'étape 1), ce calcul donnait 7/20 : l'étape 8 lui a donc écrit le
 * volet LEARNOS d'un élève en difficulté — 192 preuves autour de 0,32, 41
 * recommandations critiques, un plan de remédiation et deux alertes à la
 * famille. Le bulletin disait 17,75, le profil de compétences disait « à
 * reprendre », et l'entraînement servait de la reprise des bases aux deux
 * enfants : la démonstration ne montrait aucune différence entre eux.
 *
 * CE QUE CE SCRIPT FAIT
 * Il réécrit ce volet à partir du niveau réel, sans rien supprimer :
 *   • les preuves `evf-` : même calendrier, scores recalculés ;
 *   • les profils de maîtrise correspondants ;
 *   • les recommandations : « excellence » au-delà du seuil, closes sinon ;
 *   • le plan : remédiation → approfondissement, sur ses trois meilleures
 *     compétences, avec l'intervention qui l'accompagne ;
 *   • les alertes « maîtrise fragile » à la famille : écartées ;
 *   • les feuilles de remédiation : requalifiées.
 *
 * La fiche 2026-2027 n'est PAS touchée : ses notes (9,7) et son profil y sont
 * cohérents entre eux, et la réaligner demanderait de réécrire aussi le
 * bulletin.
 *
 * DÉTERMINISTE ET IDEMPOTENT : le tirage est semé par compétence, une seconde
 * exécution réécrit les mêmes valeurs.
 *
 *   pnpm exec tsx scripts/demo/09-realigner-eleve-fort.ts [--dry-run]
 */

import { Client } from "pg";
import { mulberry32 } from "../../prisma/seed-ambouli-helpers";

const DRY = process.argv.includes("--dry-run");

const TENANT = "tenant-ambouli";
/** Ragueh Mahamoud, 2nde D 2025-2026 — cf. `ENFANT_FORT_2025` de l'étape 1. */
const ELEVE = "ele-ambouli-2025-0445";
const MOYENNE = 17.75;

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
function releves(competenceId: string): number[] {
  const alea = mulberry32(graine(`${ELEVE}|${competenceId}`));
  let maitrise = borner(MOYENNE / 20 - 0.03 + (alea() - 0.5) * 0.24, 0.7, 0.96);
  return [0, 1, 2].map(() => {
    maitrise = borner(maitrise + 0.02 + (alea() - 0.5) * 0.06, 0.6, 0.99);
    return arrondi(maitrise);
  });
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const preuves = (
    await c.query(
      `select e.id, e."competenceId", e."occurredAt", k.libelle, ch."matiereId", m.nom matiere
         from learnos_learning_evidences e
         join learnos_competences k on k.id = e."competenceId"
         join learnos_chapitres ch on ch.id = k."chapitreId"
         join matieres m on m.id = ch."matiereId"
        where e."tenantId" = $1 and e."eleveId" = $2 and e.id like 'evf-%'
        order by e.id`,
      [TENANT, ELEVE]
    )
  ).rows as { id: string; competenceId: string; occurredAt: Date; libelle: string; matiereId: string; matiere: string }[];

  const parCompetence = new Map<string, typeof preuves>();
  for (const p of preuves) {
    const liste = parCompetence.get(p.competenceId);
    if (liste) liste.push(p);
    else parCompetence.set(p.competenceId, [p]);
  }

  const bilan = [...parCompetence.entries()].map(([competenceId, liste]) => {
    const scores = releves(competenceId);
    // Le rang du relevé est le suffixe de l'identifiant (`-0`, `-1`, `-2`).
    const lignes = liste.map((p) => ({ id: p.id, score: scores[Number(p.id.slice(-1))] ?? scores[2] }));
    return {
      competenceId,
      libelle: liste[0].libelle,
      matiereId: liste[0].matiereId,
      matiere: liste[0].matiere,
      premiere: scores[0],
      finale: scores[2],
      derniere: liste.reduce((d, p) => (p.occurredAt > d ? p.occurredAt : d), liste[0].occurredAt),
      lignes,
    };
  });

  const excellentes = bilan.filter((b) => b.finale > 0.92);
  const meilleures = [...bilan].sort((a, b) => b.finale - a.finale).slice(0, 3);
  const moyenne = arrondi(bilan.reduce((s, b) => s + b.finale, 0) / Math.max(1, bilan.length));

  console.log(`${bilan.length} compétences, ${preuves.length} preuves à réécrire`);
  console.log(`maîtrise finale moyenne : ${moyenne} — ${excellentes.length} au-delà de 0,92`);
  console.log(`plan d'approfondissement sur : ${meilleures.map((b) => b.libelle).join(" · ")}`);
  if (DRY || bilan.length === 0) {
    console.log(DRY ? "[simulation] rien n'est écrit." : "Aucune preuve à réaligner.");
    await c.end();
    return;
  }

  await c.query("begin");
  try {
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
          ELEVE,
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
            where "eleveId" = $1 and "competenceId" = $2 and id like 'recof-%'`,
          [
            ELEVE,
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
            where "eleveId" = $1 and "competenceId" = $2 and id like 'recof-%'`,
          [ELEVE, b.competenceId, b.derniere]
        );
      }

      await c.query(
        `update learnos_exercices_assignes x
            set "regleDeclenchee" = 'exo.consolidation', priorite = 3
           from learnos_feuilles_exercices f
          where f.id = x."feuilleId" and f."eleveId" = $1 and f.id like 'feuf-%' and x."competenceId" = $2`,
        [ELEVE, b.competenceId]
      );
      await c.query(
        `update learnos_feuilles_exercices set type = $3, "updatedAt" = now()
          where "eleveId" = $1 and id like $2 and type = 'remediation'`,
        [ELEVE, `feuf-${ELEVE}-${b.competenceId}-%`, b.finale > 0.85 ? "approfondissement" : "entrainement"]
      );
    }

    // Le plan : même calendrier, même enseignant, autre objet.
    const planId = `planf-${ELEVE}`;
    const premier = meilleures[0];
    await c.query(
      `update learnos_plans_progression
          set type = 'approfondissement', "matiereId" = $2, motif = $3,
              "regleDeclenchee" = 'plan_potentiel_eleve', "motifParams" = $4::jsonb,
              "masteryAvant" = $5, "updatedAt" = now()
        where id = $1`,
      [
        planId,
        premier.matiereId,
        `${premier.matiere} — ${excellentes.length} compétences sont maîtrisées au-delà des attendus : ` +
          `un parcours d'approfondissement entretiendrait l'engagement.`,
        JSON.stringify({ matiere: premier.matiere, n: excellentes.length }),
        premier.finale,
      ]
    );
    const actions = [
      "Problème ouvert à résoudre en autonomie",
      "Série d'exercices de transfert, hors du cadre du cours",
      "Présentation de la démarche à la classe",
    ];
    for (const [i, b] of meilleures.entries()) {
      await c.query(
        `update learnos_etapes_plan set "competenceId" = $2, action = $3, responsable = 'eleve'
          where id = $1`,
        [`etapef-${planId}-${i}`, b.competenceId, actions[i]]
      );
    }
    await c.query(
      `update learnos_student_interventions
          set "competenceId" = $2, "interventionType" = 'enrichment', reason = $3,
              "recommendedAction" = 'Parcours d''approfondissement en autonomie', "updatedAt" = now()
        where id = $1`,
      [
        `intf-${ELEVE}`,
        premier.competenceId,
        `Maîtrise à ${Math.round(premier.finale * 100)} % après plusieurs relevés concordants`,
      ]
    );

    // Une alerte « maîtrise fragile » envoyée pour un élève qui ne l'est pas :
    // écartée comme le ferait un enseignant, pas effacée (cf. `alertes-parent`).
    await c.query(
      `update learnos_alertes_parent
          set statut = 'SUPPRIMEE', "motifSuppression" = 'Alerte émise sur un profil erroné — réalignement de la démonstration'
        where "eleveId" = $1 and id like 'alpf-%'`,
      [ELEVE]
    );

    await c.query("commit");
    console.log("Réalignement écrit.");
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
