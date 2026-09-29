#!/usr/bin/env node
/**
 * SchoolPro — « le déploiement consomme-t-il ce que le modèle déclare ? »
 * =======================================================================
 * `docker-compose.yml` mappe EXPLICITEMENT chaque variable d'environnement
 * (aucun `env_file`) : il n'y a donc aucun filet de sécurité. Une variable
 * consommée mais absente de `docker/scripts/secrets.sh` — le fichier que
 * l'exploitant remplit via `make secrets-init`, puis que `deploy.sh` déchiffre
 * en `.env.runtime` — reste VIDE en production, et compose retombe
 * silencieusement sur son défaut :
 *
 *   R2_BACKUP_ACCESS_KEY_ID vide → dépôt de sauvegarde hors site INACTIF
 *   RLS_MODE vide                → défaut « off », cloisonnement non appliqué
 *   TWO_FACTOR_SECRET vide       → personne ne peut configurer son 2FA
 *
 * Cas réel, corrigé le 29/09/2026 : le modèle déclarait `R2_ACCOUNT_ID`,
 * `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `PGBACKREST_R2_BUCKET` —
 * quatre noms consommés par PERSONNE — tandis que les quatre noms réellement
 * lus par pgBackRest (`R2_S3_ENDPOINT`, `R2_BACKUP_*`) n'étaient produits par
 * rien. Remplir le modèle à la lettre laissait donc la sauvegarde hors site
 * définitivement inactive, en silence — et le contrôle `cmd_check` du script,
 * qui testait lui aussi `R2_ACCESS_KEY_ID`, se taisait dans le même temps.
 * `docker compose config -q` ne pouvait pas le voir : les valeurs par défaut
 * `:-` rendent une variable manquante valide.
 *
 * Contrôle BIDIRECTIONNEL, sans exception :
 *   1. consommée par compose mais non déclarée → échec (défaut silencieux) ;
 *   2. déclarée mais consommée par personne    → échec (leurre qui fait croire
 *      à une configuration qui n'opère rien).
 *
 * Usage : node scripts/ci/check-secrets-names.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const RACINE = path.resolve(import.meta.dirname, "../..");
const FICHIER_COMPOSE = "docker-compose.yml";
const FICHIER_MODELE = "docker/scripts/secrets.sh";
const FICHIER_FIXTURE = ".env.production.example";

/** Variables déclarées en tête de fichier d'exemple (`NOM=valeur`). */
function declareesExemple(texte) {
  const noms = new Set();
  for (const m of texte.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)) noms.add(m[1]);
  return noms;
}

/** Variables interpolées par docker-compose : `${NOM}`, `${NOM:-défaut}`, `${NOM:?}`. */
function consommees(texte) {
  const noms = new Set();
  for (const m of texte.matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)) noms.add(m[1]);
  return noms;
}

/**
 * Variables ENGENDRÉES par le heredoc de `secrets.sh`.
 *
 * On ne lit que le heredoc (`cat > "${plain}" <<EOF` … `EOF`) : c'est lui qui
 * produit le fichier de secrets de production. Le reste du script est du code,
 * pas une déclaration — un `grep` sur tout le fichier confondrait les deux.
 */
function declarees(texte) {
  const debut = texte.indexOf('cat > "${plain}" <<EOF');
  if (debut === -1) {
    console.error(
      `✗ ${FICHIER_MODELE} : heredoc de génération introuvable.\n` +
        "  Le contrôle ne peut pas savoir ce que le modèle déclare : on refuse\n" +
        "  plutôt que de conclure « tout va bien » sur une lecture vide."
    );
    process.exit(1);
  }
  const fin = texte.indexOf("\nEOF", debut);
  const heredoc = texte.slice(debut, fin === -1 ? undefined : fin);
  const noms = new Set();
  for (const m of heredoc.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)) noms.add(m[1]);
  return noms;
}

const compose = consommees(readFileSync(path.join(RACINE, FICHIER_COMPOSE), "utf8"));
const modele = declarees(readFileSync(path.join(RACINE, FICHIER_MODELE), "utf8"));
const fixture = declareesExemple(readFileSync(path.join(RACINE, FICHIER_FIXTURE), "utf8"));

// Une lecture vide signalerait un changement de forme, pas une absence de
// problème : on refuse plutôt que d'afficher un succès trompeur.
if (compose.size === 0 || modele.size === 0 || fixture.size === 0) {
  console.error(
    `✗ Lecture vide (${compose.size} consommées, ${modele.size} déclarées, ` +
      `${fixture.size} dans la fixture) : le format des fichiers a changé, ` +
      "ce contrôle n'est plus fiable."
  );
  process.exit(1);
}

/** Compare une liste déclarée à ce que le compose consomme. Retourne le nombre de problèmes. */
function comparer(libelle, declarees, { bidirectionnel }) {
  const manquantes = [...compose].filter((n) => !declarees.has(n)).sort();
  console.log(`${libelle} : ${declarees.size} variables déclarées.`);

  if (manquantes.length > 0) {
    console.log("");
    console.log(`✗ Consommées par ${FICHIER_COMPOSE} mais absentes de ${libelle} :`);
    for (const n of manquantes) console.log(`    ${n}`);
    console.log("  → compose retombera sur sa valeur par défaut, EN SILENCE.");
    return manquantes.length;
  }

  if (!bidirectionnel) {
    console.log("  ✓ Toutes les variables consommées y figurent.");
    return 0;
  }

  const inutiles = [...declarees].filter((n) => !compose.has(n)).sort();
  if (inutiles.length === 0) {
    console.log("  ✓ Coïncidence exacte avec le compose — aucune variable fantôme.");
    return 0;
  }

  console.log("");
  console.log(`✗ Déclarées par ${libelle} mais consommées par PERSONNE :`);
  for (const n of inutiles) console.log(`    ${n}`);
  console.log(
    "  → les remplir ne configure rien : elles font croire à une mise en\n" +
      "    service qui n'opère rien. Supprimez-les, ou alignez le nom sur celui\n" +
      `    attendu par ${FICHIER_COMPOSE}.`
  );
  return inutiles.length;
}

console.log(
  `${compose.size} variables consommées par ${FICHIER_COMPOSE}.`
);
console.log("");

let problemes = 0;
// Source de vérité du déploiement VPS : `deploy.sh` déchiffre ce fichier en
// `.env.runtime`, puis compose s'en sert. Les deux directions s'appliquent.
problemes += comparer(FICHIER_MODELE, modele, { bidirectionnel: true });
console.log("");
// Fixture de `docker compose config` : elle doit couvrir ce que le compose
// consomme, mais déclarer en plus des variables propres à MinIO ou Redis n'est
// pas une anomalie — d'où le contrôle à sens unique.
problemes += comparer(FICHIER_FIXTURE, fixture, { bidirectionnel: false });

if (problemes > 0) {
  console.log("");
  console.log(`✗ ${problemes} problème(s) de nommage — le déploiement ne lira pas ce que vous croyez.`);
  process.exit(1);
}

console.log("");
console.log("✓ Aucune variable fantôme dans le déploiement.");

