#!/usr/bin/env node
/**
 * SchoolPro — Garde-fou : la base visée est-elle bien la bonne ?
 * ==============================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * Deux projets voisins, issus d'un ancêtre commun, aux noms presque
 * identiques — SchoolPro (ici, avec LEARNOS) et EcolPro (déployé sur
 * ecolemiriam.com, sans LEARNOS). Leurs schémas ont divergé d'environ
 * 46 tables.
 *
 * Le scénario qu'on cherche à rendre IMPOSSIBLE : un `prisma db push`
 * lancé depuis ce dépôt alors que DATABASE_URL pointe — par un .env
 * oublié, un tunnel SSH resté ouvert, une variable exportée dans le
 * shell — vers la base de production d'ecolemiriam. Prisma alignerait
 * alors le schéma : création de dizaines de tables, suppression de
 * colonnes inconnues. Sur une base qui contient les élèves, les parents
 * et la comptabilité d'une école réelle.
 *
 * PRINCIPE : ÉCHEC FERMÉ.
 * En cas de doute — base injoignable, empreinte illisible, identité
 * absente — on REFUSE. Une opération destructrice bloquée à tort coûte
 * trente secondes ; une base de production écrasée coûte l'année
 * scolaire.
 *
 * DEUX NIVEAUX DE CONTRÔLE
 *   1. L'hôte (instantané, sans réseau) : liste noire, puis liste blanche.
 *      Attrape le cas le plus courant sans même ouvrir de connexion.
 *   2. L'empreinte du schéma (une requête) : la base contient-elle les
 *      tables qui caractérisent SchoolPro, et aucune de celles qui
 *      caractérisent EcolPro ? C'est le contrôle qui résiste à tout :
 *      même une URL d'apparence anodine est démasquée par son contenu.
 *
 * Usage :
 *   node scripts/guard-target-db.cjs            # vérifie DATABASE_URL
 *   node scripts/guard-target-db.cjs --url <u>  # vérifie une URL donnée
 *   node scripts/guard-target-db.cjs --quiet    # silencieux si tout va bien
 *
 * Sortie 0 = feu vert. Sortie 1 = refus (l'appelant NE DOIT PAS continuer).
 */

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const IDENTITE = path.join(RACINE, ".project-identity.json");

const args = process.argv.slice(2);
const silencieux = args.includes("--quiet");
const urlExplicite = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;

const ROUGE = "\x1b[31m";
const VERT = "\x1b[32m";
const JAUNE = "\x1b[33m";
const GRAS = "\x1b[1m";
const RAZ = "\x1b[0m";

function refuser(titre, details) {
  console.error("");
  console.error(`${ROUGE}${GRAS}  ╔══════════════════════════════════════════════════════════════╗${RAZ}`);
  console.error(`${ROUGE}${GRAS}  ║  OPÉRATION REFUSÉE — MAUVAISE BASE DE DONNÉES                ║${RAZ}`);
  console.error(`${ROUGE}${GRAS}  ╚══════════════════════════════════════════════════════════════╝${RAZ}`);
  console.error("");
  console.error(`  ${GRAS}${titre}${RAZ}`);
  console.error("");
  for (const ligne of details) console.error(`  ${ligne}`);
  console.error("");
  console.error(`  ${JAUNE}Projet courant : SchoolPro (avec LEARNOS)${RAZ}`);
  console.error(`  ${JAUNE}Voir : GARDE-FOUS.md${RAZ}`);
  console.error("");
  process.exit(1);
}

function ok(message) {
  if (!silencieux) console.log(`${VERT}✓${RAZ} ${message}`);
}

// ─── Identité du projet ──────────────────────────────────────────────────
if (!fs.existsSync(IDENTITE)) {
  refuser("Fichier d'identité introuvable.", [
    `Attendu : ${path.relative(process.cwd(), IDENTITE)}`,
    "Sans lui, impossible de savoir quelle base est légitime — donc refus.",
  ]);
}
const identite = JSON.parse(fs.readFileSync(IDENTITE, "utf8"));

// ─── URL cible ───────────────────────────────────────────────────────────
const url = urlExplicite || process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  refuser("Aucune URL de base de données définie.", [
    "DATABASE_URL et DIRECT_URL sont vides.",
  ]);
}

let hote;
try {
  hote = new URL(url).hostname;
} catch {
  refuser("URL de base de données illisible.", ["Format attendu : postgresql://…"]);
}

// ─── Contrôle 1 : l'hôte ─────────────────────────────────────────────────
const { hotes: hotesInterdits = [], raison } = identite.interdits || {};
if (hotesInterdits.includes(hote)) {
  refuser(`L'hôte « ${hote} » est explicitement interdit pour ce projet.`, [
    raison || "",
    "",
    "Cette machine appartient à un AUTRE projet. Y appliquer le schéma de",
    "celui-ci corromprait une base de production.",
  ]);
}

const hotesAutorises = identite.database?.hotes_autorises || [];
if (hotesAutorises.length && !hotesAutorises.includes(hote)) {
  refuser(`L'hôte « ${hote} » ne figure pas parmi les hôtes autorisés.`, [
    `Autorisés : ${hotesAutorises.join(", ")}`,
    "",
    "S'il s'agit d'une nouvelle base légitime, l'ajouter dans",
    ".project-identity.json — délibérément, pas dans l'urgence.",
  ]);
}
ok(`hôte « ${hote} » autorisé`);

// ─── Contrôle 2 : l'empreinte du schéma ──────────────────────────────────
(async () => {
  const obligatoires = identite.database?.marqueurs_obligatoires || [];
  const interdits = identite.database?.marqueurs_interdits || [];
  if (!obligatoires.length && !interdits.length) {
    ok("aucun marqueur de schéma défini — contrôle d'empreinte ignoré");
    return;
  }

  let PrismaClient;
  try {
    ({ PrismaClient } = require("@prisma/client"));
  } catch {
    refuser("Client Prisma introuvable.", [
      "Impossible de vérifier l'empreinte du schéma.",
      "Lancer d'abord : pnpm install && pnpm exec prisma generate",
    ]);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  let tables;
  try {
    const lignes = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    tables = new Set(lignes.map((l) => l.table_name));
  } catch (e) {
    refuser("Base injoignable — empreinte non vérifiable.", [
      String(e.message).split("\n")[0],
      "",
      "Le contrôle échoue fermé : tant que l'identité de la base n'est pas",
      "établie, aucune opération destructrice n'est autorisée.",
    ]);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  // Base vide : rien à corrompre, et c'est le cas normal d'un premier
  // `db push` sur un conteneur de développement neuf.
  if (tables.size === 0) {
    ok("base vide — première initialisation, autorisée");
    return;
  }

  const intrus = interdits.filter((t) => tables.has(t));
  if (intrus.length) {
    refuser("Cette base appartient à un AUTRE projet.", [
      `Tables trouvées qui n'existent que chez EcolPro : ${intrus.join(", ")}`,
      `Hôte : ${hote}`,
      `Tables au total : ${tables.size}`,
      "",
      "Il s'agit très probablement de la base d'ecolemiriam.com.",
      "Aucune opération de SchoolPro ne doit la toucher.",
    ]);
  }

  const manquants = obligatoires.filter((t) => !tables.has(t));
  if (manquants.length) {
    refuser("Cette base ne ressemble pas à celle de SchoolPro.", [
      `Tables attendues et absentes : ${manquants.join(", ")}`,
      `Hôte : ${hote}`,
      `Tables au total : ${tables.size}`,
      "",
      "Soit la base appartient à un autre projet, soit son schéma est très",
      "en retard. Dans les deux cas, vérifier AVANT d'écrire.",
    ]);
  }

  ok(`empreinte SchoolPro confirmée (${tables.size} tables, marqueurs LEARNOS présents)`);
  if (!silencieux) console.log("");
})();
