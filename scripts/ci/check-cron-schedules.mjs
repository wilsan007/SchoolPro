#!/usr/bin/env node
/**
 * SchoolPro — Garde-fou des tâches planifiées
 * ============================================================
 *
 * POURQUOI CE FICHIER EXISTE
 * Trois pannes, toutes déjà survenues, sont invisibles à la lecture :
 *
 *   1. UN CRON VERCEL PLUS FRÉQUENT QUE QUOTIDIEN. Le plan Hobby refuse
 *      l'expression et le déploiement échoue avec `errorCode: invalid_routes`,
 *      à l'étape `process-and-upload-routes` — sans le dire dans les logs du
 *      CLI (le build réussit, puis « Deploying outputs… », puis `status ●
 *      Error`). C'est la cause de l'échec de TOUS les déploiements Vercel
 *      entre le 9 et le 24 septembre 2026 (`e6e086c`, passage de quotidien à
 *      « toutes les 5 minutes »).
 *
 *   2. UNE TÂCHE QUI N'EST JAMAIS DÉCLENCHÉE. Le répartiteur ne s'exécute
 *      qu'aux heures où un ordonnanceur l'appelle. Décaler l'appel de 02:00 à
 *      03:00 UTC dans `vercel.json` suffit à ce que la facturation mensuelle
 *      (`heures: [2]`) ne tourne plus JAMAIS sur cette cible — sans erreur,
 *      sans journal : les factures manquent, simplement.
 *
 *   3. UNE TÂCHE MORTE. Une entrée sans `executer`, ou un `heures: []`, reste
 *      silencieuse pendant des mois.
 *
 * Ce script lit les trois sources de vérité — les tâches du répartiteur,
 * `crontab.txt` (Fly.io) et `vercel.json` — et refuse les incohérences.
 *
 * Usage : node scripts/ci/check-cron-schedules.mjs
 * Sortie 0 = cohérent. Sortie 1 = problème (l'appelant NE DOIT PAS déployer).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPARTITEUR = join(RACINE, "src/app/api/cron/dispatch/route.ts");
const CRONTAB = join(RACINE, "crontab.txt");
const VERCEL = join(RACINE, "vercel.json");

const problemes = [];
const avertissements = [];

// ------------------------------------------------------------
// 1. Les tâches déclarées dans le répartiteur
// ------------------------------------------------------------
// L'analyse est textuelle — le fichier est du TypeScript, pas du JSON. On
// s'appuie sur la forme stable de chaque entrée : `nom: "…"`, puis `heures`,
// `jourDuMois` et `idempotenceMois` dans le même objet.
function lireTaches() {
  const src = readFileSync(REPARTITEUR, "utf8");
  const debut = src.indexOf("const TACHES");
  if (debut === -1) {
    problemes.push("Registre `TACHES` introuvable dans le répartiteur.");
    return [];
  }
  const fin = src.indexOf("\n];", debut);
  const bloc = src.slice(debut, fin === -1 ? src.length : fin);

  const taches = [];
  const reNom = /nom:\s*"([^"]+)"/g;
  let m;
  while ((m = reNom.exec(bloc))) {
    // Fenêtre jusqu'au `nom:` suivant : suffisant pour attraper les champs de
    // cette entrée sans confondre avec la suivante.
    const suite = bloc.slice(m.index, reNom.lastIndex + 700);
    const heures = /heures:\s*(\[([^\]]*)\]|null)/.exec(suite);
    const jourDuMois = /jourDuMois:\s*(\d+)/.exec(suite);
    taches.push({
      nom: m[1],
      // `heures: null` = à chaque passage.
      heures: heures
        ? heures[1] === "null"
          ? null
          : (heures[2].match(/\d+/g) ?? []).map(Number)
        : undefined,
      jourDuMois: jourDuMois ? Number(jourDuMois[1]) : undefined,
      idempotenceMois: /idempotenceMois:\s*true/.test(suite),
      executer: /executer:/.test(suite),
    });
  }
  return taches;
}

const taches = lireTaches();

for (const t of taches) {
  if (t.heures === undefined) {
    problemes.push(`Tâche « ${t.nom} » : champ \`heures\` illisible (attendu [..] ou null).`);
  }
  if (!t.executer) {
    problemes.push(`Tâche « ${t.nom} » : aucun \`executer\` — la tâche ne fait rien.`);
  }
  if (t.jourDuMois !== undefined && !t.idempotenceMois) {
    // Sans fenêtre mensuelle, une tâche mensuelle s'exécuterait à CHAQUE passage
    // de son heure (douze fois dans l'heure).
    avertissements.push(
      `Tâche « ${t.nom} » : \`jourDuMois\` sans \`idempotenceMois\` — elle tournerait à chaque passage de l'heure prévue.`
    );
  }
  if (t.jourDuMois !== undefined && (t.jourDuMois < 1 || t.jourDuMois > 31)) {
    problemes.push(`Tâche « ${t.nom} » : \`jourDuMois: ${t.jourDuMois}\` hors 1-31.`);
  }
}

if (taches.length === 0) {
  problemes.push("Aucune tâche lue dans le répartiteur — le contrôle serait vide.");
}

// ------------------------------------------------------------
// 2. Les heures réellement déclenchées, par ordonnanceur
// ------------------------------------------------------------
/** Heures UTC auxquelles Fly.io (supercronic) appelle le répartiteur. */
function heuresCouvertesParCrontab() {
  if (!existsSync(CRONTAB)) {
    problemes.push("crontab.txt introuvable (Fly.io : sans lui, aucun cron).");
    return { heures: new Set(), dispatchPresent: false };
  }
  const src = readFileSync(CRONTAB, "utf8");
  const heures = new Set();
  let dispatchPresent = false;

  for (const ligne of src.split("\n")) {
    if (ligne.trim().startsWith("#")) continue;
    // L'URL doit se terminer par `/api/cron/dispatch` : un simple `includes`
    // laisserait passer `/api/cron/dispatch-scheduled`, qui a un tout autre
    // horaire — et masquerait un vrai trou de couverture.
    const url = (ligne.match(/https?:\/\/\S+/) ?? [])[0];
    if (!url || !url.endsWith("/api/cron/dispatch")) continue;
    dispatchPresent = true;
    const champs = ligne.trim().split(/\s+/);
    const [minute, h] = champs;
    if (!(minute === "*" || minute.startsWith("*/") || /^\d+$/.test(minute))) continue;
    const heuresCron =
      h === "*" ? Array.from({ length: 24 }, (_, i) => i) : h.split(",").map(Number);
    for (const heure of heuresCron) heures.add(heure);
  }
  return { heures, dispatchPresent };
}

/** Heures UTC des crons Vercel visant le répartiteur. */
function heuresCouvertesParVercel() {
  if (!existsSync(VERCEL)) return { heures: new Set(), crons: [] };
  let config;
  try {
    config = JSON.parse(readFileSync(VERCEL, "utf8"));
  } catch (e) {
    problemes.push(`vercel.json illisible : ${e.message}`);
    return { heures: new Set(), crons: [] };
  }
  const crons = config.crons ?? [];
  const heures = new Set();
  for (const cron of crons) {
    // Même précaution que côté crontab : `endsWith`, pour ne pas confondre
    // `/api/cron/dispatch` avec `/api/cron/dispatch-scheduled`.
    if (!String(cron.path ?? "").endsWith("/api/cron/dispatch")) continue;
    const champs = String(cron.schedule ?? "").trim().split(/\s+/);
    if (champs.length !== 5) {
      problemes.push(`Cron Vercel « ${cron.schedule} » : expression à 5 champs attendue.`);
      continue;
    }
    const h = champs[1];
    if (h === "*") for (let i = 0; i < 24; i++) heures.add(i);
    else for (const heure of h.split(",")) heures.add(Number(heure));
  }
  return { heures, crons };
}

const crontab = heuresCouvertesParCrontab();
const vercel = heuresCouvertesParVercel();

if (!crontab.dispatchPresent) {
  problemes.push(
    "crontab.txt n'appelle pas /api/cron/dispatch : sur Fly.io, plus aucune tâche ne tourne."
  );
}

// ------------------------------------------------------------
// 3. Contrainte du plan Vercel Hobby : crons QUOTIDIENS uniquement
// ------------------------------------------------------------
const QUOTIDIEN = /^\d{1,2} \d{1,2} \* \* \*$/;
for (const cron of vercel.crons) {
  if (!QUOTIDIEN.test(String(cron.schedule ?? "").trim())) {
    problemes.push(
      `vercel.json : « ${cron.schedule} » n'est pas quotidien. Le plan Hobby refuse ` +
        "toute expression plus fréquente et TOUS les déploiements échouent " +
        "(« Hobby accounts are limited to daily cron jobs »), avec un `status ● Error` " +
        "illisible dans les logs du CLI."
    );
  }
}

// ------------------------------------------------------------
// 4. Chaque tâche a-t-elle une heure réellement couverte ?
// ------------------------------------------------------------
const couvertes = new Set([...crontab.heures, ...vercel.heures]);

for (const t of taches) {
  if (t.heures === null || t.heures === undefined) continue; // à chaque passage
  if (t.heures.length === 0) {
    avertissements.push(`Tâche « ${t.nom} » : \`heures: []\` — elle ne s'exécute jamais.`);
    continue;
  }
  if (couvertes.size > 0 && !t.heures.some((h) => couvertes.has(h))) {
    problemes.push(
      `Tâche « ${t.nom} » déclarée à ${JSON.stringify(t.heures)} h UTC, mais aucun ` +
        "ordonnanceur n'appelle le répartiteur à ces heures " +
        `(crontab : ${JSON.stringify([...crontab.heures].sort((a, b) => a - b))}, ` +
        `vercel : ${JSON.stringify([...vercel.heures].sort((a, b) => a - b))}). ` +
        "Cette tâche ne s'exécutera JAMAIS — silencieusement."
    );
  }
}

// ------------------------------------------------------------
// Verdict
// ------------------------------------------------------------
if (avertissements.length) {
  console.log("\nAvertissements :");
  for (const a of avertissements) console.log(`  ⚠ ${a}`);
}

if (problemes.length) {
  console.error("\nTâches planifiées incohérentes :\n");
  for (const p of problemes) console.error(`  ✗ ${p}`);
  console.error("\nAucun déploiement ne devrait partir dans cet état.\n");
  process.exit(1);
}

console.log(
  `✓ Tâches planifiées cohérentes : ${taches.length} tâches, ` +
    `${couvertes.size} heures UTC couvertes, ${vercel.crons.length} crons Vercel quotidiens.`
);

