/**
 * Harmonise l'orthographe des niveaux déjà enregistrés (« 5ème » → « 5eme »,
 * « Première » → « 1ere »…), avec la même règle que les écritures
 * (`niveauStocke`). Aperçu par défaut ; écrit avec --apply, dans une seule
 * transaction.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/harmoniser-niveaux.ts [--apply]
 *
 * Pilote `pg` et non Prisma : le pooler coupe certaines écritures via Prisma.
 */
import { Client } from "pg";
import { niveauStocke } from "../src/lib/niveau-display";

// Colonnes rapprochées entre elles par égalité stricte.
const COLONNES: [table: string, colonne: string][] = [
  ["classes", "niveau"],
  ["learnos_chapitres", "niveau"],
  ["learnos_calibration_seuils", "niveau"],
  ["learnos_patterns_pedago", "niveau"],
  ["learnos_seuils_recommandation", "niveau"],
  ["learnos_plans_lecon", "niveauScolaire"],
  ["learnos_rubriques_evaluation", "niveauScolaire"],
  ["parcours_scolaires", "niveau"],
  ["sessions_examen", "niveau"],
  ["matieres", "niveau"],
];

const APPLY = process.argv.includes("--apply");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const plan: { table: string; colonne: string; avant: string; apres: string; lignes: number }[] = [];
  for (const [table, colonne] of COLONNES) {
    const r = await c.query(`select "${colonne}" v, count(*)::int n from "${table}" where "${colonne}" is not null group by 1`);
    for (const { v, n } of r.rows) {
      const apres = niveauStocke(v);
      if (apres !== v) plan.push({ table, colonne, avant: v, apres, lignes: n });
    }
  }
  console.table(plan);
  if (plan.length === 0) { console.log("Rien à harmoniser."); await c.end(); return; }
  if (!APPLY) { console.log("Aperçu seulement. Relancer avec --apply."); await c.end(); return; }

  await c.query("BEGIN");
  try {
    for (const p of plan) {
      const r = await c.query(`update "${p.table}" set "${p.colonne}" = $1 where "${p.colonne}" = $2`, [p.apres, p.avant]);
      console.log(`${p.table}.${p.colonne} : « ${p.avant} » → « ${p.apres} » (${r.rowCount})`);
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ÉCHEC, rien n'a été modifié :", (e as Error).message);
    process.exitCode = 1;
  }
  await c.end();
})();
