#!/usr/bin/env node
/**
 * EcolPro — Générateur des politiques RLS
 * =======================================
 *
 * POURQUOI GÉNÉRER PLUTÔT QU'ÉCRIRE À LA MAIN
 * `prisma/migrations/rls-enable-all.sql` a été écrit à la main : il
 * appelle `site_matches()`, une fonction qui n'existait pas — la
 * migration échouait donc dès sa 18e ligne et n'a jamais pu être
 * appliquée. Une politique RLS écrite à la main dérive du schéma dès la
 * migration suivante, et personne ne le voit : le SQL reste valide, il
 * couvre simplement une table de moins.
 *
 * Ce script dérive les politiques de `prisma/schema.prisma`, seule source
 * de vérité. Le rejouer après un changement de schéma et comparer le
 * résultat (`--check`) transforme « une table a été ajoutée sans RLS » en
 * échec de CI, plutôt qu'en fuite découverte six mois plus tard.
 *
 * Usage :
 *   node scripts/rls/generate-policies.cjs           # écrit le fichier SQL
 *   node scripts/rls/generate-policies.cjs --check   # échoue si obsolète
 */
const fs = require("fs");
const path = require("path");

const SCHEMA = path.join(__dirname, "../../prisma/schema.prisma");
const OUT = path.join(__dirname, "../../prisma/sql/rls/02-policies.sql");

// ============================================================
// 1. Lecture du schéma
// ============================================================
function parseModels(src) {
  const models = {};
  // \p{L} et non \w : deux modèles portent un nom accentué (Réunion,
  // Résolution). Avec \w, le parseur s'arrêtait au « R » et les
  // ignorait — deux tables se seraient retrouvées sans RLS, sans que
  // rien ne le signale. C'est précisément le type d'angle mort qu'un
  // générateur est censé supprimer, d'où le drapeau `u`.
  const re = /^model\s+([\p{L}\p{N}_]+)\s*\{([\s\S]*?)^\}/gmu;
  let m;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    models[name] = {
      name,
      table: (body.match(/@@map\("([^"]+)"\)/) || [])[1] || name,
      tenant: /^\s*tenantId\s/m.test(body)
        ? (/^\s*tenantId\s+String\?/m.test(body) ? "optional" : "required")
        : null,
      site: /^\s*siteId\s/m.test(body)
        ? (/^\s*siteId\s+String\?/m.test(body) ? "optional" : "required")
        : null,
    };
  }
  return models;
}

// ============================================================
// 2. Tables sans tenantId — rattachement explicite au parent
// ============================================================
// Chaque entrée décrit le chemin qui relie la table à un tenant. Un
// chemin de deux maillons (réponse → exercice assigné → feuille) est
// exprimé comme tel : la politique imbrique alors deux EXISTS.
//
// Rien n'est deviné. Ajouter un modèle sans tenantId et sans entrée ici
// fait échouer le script : c'est le but — l'oubli devient bloquant.
const ORPHAN_PATHS = {
  MembreConseil:           [{ parent: "Conseil",            fk: "conseilId" }],
  // Réunion (nom accentué) : rattachée au conseil qui la convoque.
  "Réunion":               [{ parent: "Conseil",            fk: "conseilId" }],
  ObjectifMentorat:        [{ parent: "Mentorat",           fk: "mentoratId" }],
  SeanceMentorat:          [{ parent: "Mentorat",           fk: "mentoratId" }],
  UserSite:                [{ parent: "Site",               fk: "siteId" }],
  EnseignantSite:          [{ parent: "Site",               fk: "siteId" }],
  EvenementCalendaire:     [{ parent: "AnneesScolaires",    fk: "anneeId" }],
  Periode:                 [{ parent: "AnneesScolaires",    fk: "anneeId" }],
  EleveParent:             [{ parent: "Eleve",              fk: "eleveId" }],
  SessionExamen:           [{ parent: "Examen",             fk: "examId" }],
  Echeancier:              [{ parent: "Facture",            fk: "factureId" }],
  EcheancePaiement:        [{ parent: "Facture",            fk: "factureId" }],
  Paiement:                [{ parent: "Facture",            fk: "factureId" }],
  Sanction:                [{ parent: "Incident",           fk: "incidentId" }],
  BulletinPaie:            [{ parent: "FicheRH",            fk: "ficheRHId" }],
  ConversationParticipant: [{ parent: "Conversation",       fk: "conversationId" }],
  Message:                 [{ parent: "Conversation",       fk: "conversationId" }],
  ContenuCours:            [{ parent: "Cours",              fk: "coursId" }],
  EtapePlan:               [{ parent: "PlanProgression",    fk: "planId" }],
  ExerciceAssigne:         [{ parent: "FeuilleExercices",   fk: "feuilleId" }],
  ExerciceReponse:         [{ parent: "ExerciceAssigne",    fk: "exerciceAssigneId" },
                            { parent: "FeuilleExercices",   fk: "feuilleId" }],
  SeanceCompetence:        [{ parent: "SeancePedagogique",  fk: "seanceId" }],
  SeanceCommentaire:       [{ parent: "SeancePedagogique",  fk: "seanceId" }],
  ListeFournitureItem:     [{ parent: "ListeFournitureClasse", fk: "listeId" }],
};

// ============================================================
// 3. Tables volontairement hors RLS — chaque exclusion est motivée
// ============================================================
const EXCLUDED = {
  Tenant:
    "Table des tenants elle-même : elle porte une politique dédiée (voir plus bas), " +
    "sans quoi la connexion et le changement d'établissement deviendraient impossibles.",
  Module:
    "Catalogue global des modules fonctionnels (référentiel produit, aucune donnée d'école).",
  CalendrierOfficiel:
    "Calendrier officiel partagé par pays, volontairement commun à tous les tenants.",
  AiCache:
    "Cache de réponses IA indexé par empreinte de la requête, sans notion de tenant. " +
    "À RÉEXAMINER : si une empreinte pouvait coïncider entre deux tenants, une réponse " +
    "calculée pour l'un serait servie à l'autre. Le correctif n'est pas une politique RLS " +
    "mais l'ajout du tenantId dans la clé de cache.",
  Account:
    "Table NextAuth, lue AVANT toute authentification : aucun contexte de tenant n'existe " +
    "encore à ce stade. Protégée par le fait qu'elle n'est jamais exposée par une route.",
  Session:
    "Table NextAuth (sessions JWT : de facto inutilisée). Même raison qu'Account.",
  VerificationToken:
    "Jetons de vérification e-mail, consommés avant authentification. Même raison.",
};

// ============================================================
// 3 bis. Tables de liaison implicites créées par Prisma
// ============================================================
// Une relation many-to-many sans modèle explicite donne une table
// `_NomRelation` avec deux colonnes "A" et "B". Elle n'apparaît nulle
// part dans le schéma en tant que modèle : sans entrée ici, elle
// resterait sans RLS et personne ne le remarquerait.
const IMPLICIT_JOIN_TABLES = [
  {
    table: "_CompetencePrerequis",
    comment:
      "Prérequis entre compétences (many-to-many implicite). Rattachée par sa\n" +
      "-- colonne \"A\" : si la compétence source est visible, le lien l'est aussi.",
    parentTable: "learnos_competences",
    column: "A",
  },
];

// ============================================================
// 4. Construction des prédicats
// ============================================================
function tenantPredicate(model) {
  if (model.tenant === "required") return `tenant_matches("tenantId")`;
  // tenantId optionnel = référentiel partagé (banque de questions, cours,
  // chapitres…). NULL signifie « commun à tous les tenants » et doit
  // rester visible, sinon LEARNOS perd son socle pédagogique partagé.
  return `("tenantId" IS NULL OR tenant_matches("tenantId"))`;
}

function predicateFor(model, models) {
  const parts = [];
  if (model.tenant) parts.push(tenantPredicate(model));
  if (model.site) parts.push(`site_matches("siteId")`);
  if (parts.length) return parts.join("\n      AND ");

  // Table sans tenantId : on remonte la chaîne des parents.
  const chain = ORPHAN_PATHS[model.name];
  const build = (i, childAlias) => {
    const link = chain[i];
    const parent = models[link.parent];
    const alias = `p${i}`;
    const inner = i + 1 < chain.length
      ? build(i + 1, alias)
      : parent.tenant
        ? (parent.site
            ? `${tenantPredicate(parent).replace(/"tenantId"/g, `${alias}."tenantId"`)}\n${"  ".repeat(i + 4)}AND site_matches(${alias}."siteId")`
            : tenantPredicate(parent).replace(/"tenantId"/g, `${alias}."tenantId"`))
        : (() => { throw new Error(`Parent ${parent.name} sans tenantId`); })();
    const fkRef = childAlias ? `${childAlias}."${link.fk}"` : `"${link.fk}"`;
    return `EXISTS (\n${"  ".repeat(i + 4)}SELECT 1 FROM public.${parent.table} ${alias}\n${"  ".repeat(i + 4)}WHERE ${alias}.id = ${fkRef}\n${"  ".repeat(i + 5)}AND ${inner}\n${"  ".repeat(i + 4)})`;
  };
  return build(0, null);
}

// ============================================================
// 5. Génération
// ============================================================
const src = fs.readFileSync(SCHEMA, "utf8");
const models = parseModels(src);
const errors = [];
const blocks = [];
const stats = { tenantSite: 0, tenant: 0, orphan: 0, excluded: 0 };

for (const model of Object.values(models).sort((a, b) => a.table.localeCompare(b.table))) {
  if (EXCLUDED[model.name]) { stats.excluded++; continue; }

  if (!model.tenant && !ORPHAN_PATHS[model.name]) {
    errors.push(
      `${model.name} (${model.table}) n'a pas de tenantId et aucun chemin de rattachement.\n` +
      `    → ajouter une entrée dans ORPHAN_PATHS, ou une exclusion MOTIVÉE dans EXCLUDED.`
    );
    continue;
  }
  if (ORPHAN_PATHS[model.name]) {
    for (const link of ORPHAN_PATHS[model.name]) {
      if (!models[link.parent]) {
        errors.push(`${model.name} : parent inconnu « ${link.parent} » (modèle renommé ou supprimé ?)`);
      }
    }
    stats.orphan++;
  } else if (model.tenant && model.site) stats.tenantSite++;
  else stats.tenant++;

  if (errors.length) continue;

  const pred = predicateFor(model, models);
  const policy = `${model.table}_isolation`;
  blocks.push(
`-- ${model.name}
ALTER TABLE public."${model.table}" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${policy} ON public."${model.table}";
CREATE POLICY ${policy} ON public."${model.table}"
  FOR ALL
  TO ecolpro_app
  USING (
      ${pred}
  )
  WITH CHECK (
      ${pred}
  );`
  );
}

if (errors.length) {
  console.error("\nGÉNÉRATION IMPOSSIBLE — le schéma a des tables non couvertes :\n");
  errors.forEach((e) => console.error("  • " + e));
  console.error("\nAucun fichier écrit. Corriger puis relancer.\n");
  process.exit(1);
}

for (const j of IMPLICIT_JOIN_TABLES) {
  stats.orphan++;
  blocks.push(
`-- ${j.table} (table de liaison implicite)
-- ${j.comment}
ALTER TABLE public."${j.table}" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${j.table.replace(/^_/, "")}_isolation ON public."${j.table}";
CREATE POLICY ${j.table.replace(/^_/, "")}_isolation ON public."${j.table}"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.${j.parentTable} c
        WHERE c.id = "${j.column}"
          AND (c."tenantId" IS NULL OR tenant_matches(c."tenantId"))
      )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.${j.parentTable} c
        WHERE c.id = "${j.column}"
          AND (c."tenantId" IS NULL OR tenant_matches(c."tenantId"))
      )
  );`
  );
}

const header = `-- ============================================================
-- EcolPro — Politiques RLS d'isolation multi-tenant
--
-- ⚠️  FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN.
--     Source : prisma/schema.prisma
--     Générateur : scripts/rls/generate-policies.cjs
--     Régénérer : pnpm rls:generate
--     Vérifier  : pnpm rls:check   (échoue si le schéma a bougé)
--
-- Prérequis : docker/postgres/init/03-rls-functions.sql (fonctions de
-- contexte). Sans elles, ce fichier échoue à la première politique.
--
-- CHOIX : ENABLE, PAS « FORCE »
-- \`FORCE ROW LEVEL SECURITY\` appliquerait aussi les politiques au
-- PROPRIÉTAIRE des tables (ecolpro_owner). Or c'est ce rôle qui exécute
-- les migrations Prisma et les reprises de données : le forcer ferait
-- échouer silencieusement tout backfill (« 0 ligne mise à jour »).
-- L'application, elle, se connecte en \`ecolpro_app\` — un rôle NI
-- propriétaire NI superutilisateur : les politiques s'y appliquent
-- pleinement, ce qui est le seul cas qui compte. Le propriétaire n'est
-- utilisé que par un conteneur éphémère, jamais exposé au réseau.
--
-- CHOIX : \`TO ecolpro_app\`
-- Les politiques ne visent que le rôle applicatif. Le rôle de sauvegarde
-- (\`ecolpro_backup\`, pg_read_all_data) doit continuer à tout lire — une
-- sauvegarde partielle serait pire qu'inutile.
--
-- USING **et** WITH CHECK
-- USING filtre ce qui est LU (et ce qui peut être modifié/supprimé) ;
-- WITH CHECK contrôle ce qui est ÉCRIT. Sans WITH CHECK, un utilisateur
-- pourrait insérer une ligne au nom d'un autre tenant — invisible pour
-- lui, bien réelle pour la victime.
--
-- Couverture : ${stats.tenantSite + stats.tenant + stats.orphan} tables
--   ${String(stats.tenantSite).padStart(3)} tenant + site
--   ${String(stats.tenant).padStart(3)} tenant seul
--   ${String(stats.orphan).padStart(3)} rattachées via un parent
--   ${String(stats.excluded).padStart(3)} exclues (motivées ci-dessous)
--
-- Exclusions :
${Object.entries(EXCLUDED).map(([k, v]) => `--   • ${k} — ${v.replace(/\s+/g, " ")}`).join("\n")}
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Cas particulier : la table des tenants
-- Un utilisateur doit voir SON tenant (nom, options, abonnement) et rien
-- d'autre. La liste des établissements auxquels il a accès est servie par
-- user_tenants, elle-même filtrée par sa propre politique.
-- ------------------------------------------------------------
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_isolation ON public."tenants";
CREATE POLICY tenants_isolation ON public."tenants"
  FOR ALL
  TO ecolpro_app
  USING ( is_super_admin() OR id = current_tenant_id() )
  WITH CHECK ( is_super_admin() OR id = current_tenant_id() );

`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const sql = header + blocks.join("\n\n") + "\n\nCOMMIT;\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== sql) {
    console.error(
      "\nLes politiques RLS ne correspondent plus au schéma Prisma.\n" +
      "Une table a probablement été ajoutée, renommée ou déplacée.\n" +
      "  → lancer : pnpm rls:generate, relire le diff, puis committer.\n"
    );
    process.exit(1);
  }
  console.log(`RLS à jour — ${stats.tenantSite + stats.tenant + stats.orphan} tables couvertes, ${stats.excluded} exclues.`);
  process.exit(0);
}

fs.writeFileSync(OUT, sql);
console.log(`Écrit : ${path.relative(process.cwd(), OUT)}`);
console.log(`  ${stats.tenantSite} tenant+site | ${stats.tenant} tenant | ${stats.orphan} via parent | ${stats.excluded} exclues`);
