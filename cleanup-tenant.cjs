const { Client } = require('pg');
// ⚠️  Aucun identifiant en dur : la chaîne de connexion vient de
//     l'environnement. Exemple d'exécution :
//       DATABASE_URL="postgresql://user:pass@host:5432/db" node cleanup-tenant.cjs
const CONNECTION_STRING = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('ERREUR : définir DIRECT_URL (ou DATABASE_URL) avant de lancer ce script.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 15000 });
  await client.connect();
  console.log('Connected — cleaning tenant-ambouli...\n');

  // Désactiver les FK temporairement pour éviter les cascades complexes
  await client.query('SET session_replication_role = replica;');

  const tables = [
    // LEARNOS (enfants d'abord)
    'learnos_evaluation_competences',
    'learnos_student_interventions',
    'learnos_recommandations',
    'learnos_etapes_plan',
    'learnos_plans_progression',
    'learnos_predictions',
    'learnos_alertes_parent',
    'learnos_echanges_parent',
    'learnos_exercices_reponses',
    'learnos_exercices_assignes',
    'learnos_feuilles_exercices',
    'learnos_questions',
    'learnos_journal_apprentissage',
    'learnos_kpi_snapshots',
    'learnos_patterns_pedago',
    'learnos_student_learning_profiles',
    'learnos_learning_evidences',
    'learnos_planification_competences',
    'learnos_planification_chapitres',
    'learnos_seuils_recommandation',
    'learnos_competences',
    'learnos_chapitres',
    '_CompetencePrerequis',
    // Vie scolaire
    'notes',
    'evaluations',
    'bulletin_matieres',
    'bulletins',
    'examens',
    'devoirs',
    'absences',
    'incidents',
    'sanctions',
    'passages_infirmerie',
    'fiches_sanitaires',
    'entretiens_conseiller',
    'dispenses_matiere',
    'exclusions_eleve',
    'absences_personnel',
    'conges_personnel',
    'remplacements_cours',
    'evenements',
    'taches',
    'relances',
    // Finance
    'echeances_paiement',
    'echeanciers',
    'paiements',
    'factures',
    // Emploi du temps
    'emploi_temps',
    // Structure
    'eleves',
    'parents',
    'classes',
    'periodes',
    'evenements_calendaires',
    'annees_scolaires',
    'matieres',
    'salles',
    'tarifs',
    'structures',
    'user_roles',
    'user_sites',
    'users',
    'sites',
  ];

  let total = 0;
  for (const t of tables) {
    try {
      const r = await client.query(`DELETE FROM "${t}" WHERE "tenantId"='tenant-ambouli'`);
      if (r.rowCount > 0) {
        console.log(`  ${t}: ${r.rowCount}`);
        total += r.rowCount;
      }
    } catch (e) {
      // Pas de colonne tenantId — essayer sans filtre
      try {
        const r = await client.query(`DELETE FROM "${t}"`);
        if (r.rowCount > 0) {
          console.log(`  ${t}: ${r.rowCount} (no tenant filter)`);
          total += r.rowCount;
        }
      } catch (e2) {
        if (!e2.message.includes('does not exist') && !e2.message.includes('column')) {
          console.log(`  ${t}: SKIP — ${e2.message.slice(0, 60)}`);
        }
      }
    }
  }

  // Supprimer le tenant lui-même
  try {
    const r = await client.query("DELETE FROM tenants WHERE id='tenant-ambouli'");
    console.log(`  tenants: ${r.rowCount}`);
    total += r.rowCount;
  } catch (e) {
    console.log(`  tenants: SKIP — ${e.message.slice(0, 60)}`);
  }

  // Réactiver les FK
  await client.query('SET session_replication_role = DEFAULT;');

  console.log(`\n✅ Cleanup done — ${total} rows deleted total`);

  // Vérifier que c'est vide
  const check = await client.query("SELECT count(*) FROM annees_scolaires WHERE \"tenantId\"='tenant-ambouli'");
  console.log(`Verification — annees_scolaires restantes: ${check.rows[0].count}`);

  await client.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
