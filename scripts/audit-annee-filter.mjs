#!/usr/bin/env node
/**
 * SchoolPro — Métrique du filtre d'année (« ratchet »)
 * ============================================================
 *
 * POURQUOI CE SCRIPT EXISTE
 * La règle non négociable n°2 (AGENTS.md) interdit toute requête de données
 * pédagogiques sans filtre d'année. Sa violation a déjà coûté un incident sur
 * 42 fichiers (août 2026). La règle ESLint `ecolpro/require-annee-filter`
 * signale chaque cas dans l'éditeur ; ce script en donne le COMPTE, pour que la
 * dette ne puisse pas grandir sans que personne ne le voie.
 *
 * Il ne réimplémente PAS la détection : il lit la sortie JSON d'ESLint. Une
 * seule vérité, donc — un compteur parallèle finirait par diverger de la règle
 * et l'on ne saurait plus lequel croire.
 *
 * Usage :
 *   node scripts/audit-annee-filter.mjs              # compte et compare au plafond
 *   node scripts/audit-annee-filter.mjs --json       # sortie machine
 *   node scripts/audit-annee-filter.mjs --max 380    # plafond explicite
 *
 * Sortie 0 = la dette n'a pas grandi. Sortie 1 = elle a grandi (ou la mesure a
 * échoué) : baisser le plafond au fur et à mesure des corrections.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGLE = "ecolpro/require-annee-filter";

/**
 * Plafond de référence — mesuré le 29/09/2026 APRÈS correction des faux
 * positifs de la règle et de deux lots de corrections réelles.
 *
 *   Premier passage .............. 380   (dont 319 faux positifs de la règle)
 *   Après correction règle ........  61
 *   Après lot « src/app/api » .....  54
 *   Après lot « src/lib/learnos » ..  37
 *
 * À BAISSER, jamais à monter.
 */
const PLAFOND_PAR_DEFAUT = 37;

const args = process.argv.slice(2);
const json = args.includes("--json");
const maxArg = args.indexOf("--max");
const plafond =
  maxArg !== -1 && args[maxArg + 1] ? Number(args[maxArg + 1]) : PLAFOND_PAR_DEFAUT;

/** Compte les signalements de la règle, en lisant la sortie JSON d'ESLint. */
function mesurer() {
  let sortie;
  try {
    sortie = execFileSync(
      "pnpm",
      ["exec", "eslint", "src", "--format", "json"],
      { cwd: RACINE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (e) {
    // ESLint sort en code 1 dès qu'il reste un avertissement : la sortie JSON
    // est tout de même exploitable.
    sortie = e.stdout;
    if (!sortie) {
      console.error("Mesure impossible : ESLint n'a rien renvoyé.", e.message);
      process.exit(1);
    }
  }
  return JSON.parse(sortie);
}

const resultats = mesurer();

const occurrences = [];
for (const fichier of resultats) {
  for (const message of fichier.messages) {
    if (message.ruleId === REGLE) {
      occurrences.push({
        fichier: fichier.filePath.replace(`${RACINE}/`, ""),
        ligne: message.line,
        modele: (message.message.match(/« ([^»]+) »/) || [])[1] ?? "?",
      });
    }
  }
}

const total = occurrences.length;
const parDossier = {};
for (const o of occurrences) {
  const dossier = o.fichier.split("/").slice(0, 3).join("/");
  parDossier[dossier] = (parDossier[dossier] ?? 0) + 1;
}

if (json) {
  console.log(JSON.stringify({ total, plafond, parDossier, occurrences }, null, 2));
} else {
  console.log(`Requêtes sans filtre d'année : ${total} (plafond ${plafond})`);
  console.log("");
  for (const [dossier, n] of Object.entries(parDossier).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${dossier}`);
  }
  console.log("");
  if (total > plafond) {
    console.log(
      `✗ La dette a GRANDI de ${total - plafond} requête(s). Ajoutez le filtre ` +
        "d'année (ou une exemption motivée), plutôt que de relever le plafond."
    );
  } else if (total < plafond) {
    console.log(
      `✓ Dette en baisse : ${plafond - total} requête(s) corrigée(s). ` +
        `Baisser le plafond à ${total} dans ce fichier (et dans eslint.config.mjs ` +
        "si le compte atteint 0)."
    );
  } else {
    console.log("✓ Dette stable — inchangée depuis la dernière mesure.");
  }
}

process.exit(total > plafond ? 1 : 0);
