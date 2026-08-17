#!/usr/bin/env node

/**
 * EcolPro — Agent de synchronisation locale
 *
 * Télécharge périodiquement un export complet des données de l'établissement
 * sous forme de fichiers Excel compressés en ZIP. Les sauvegardes sont stockées
 * localement sur le PC du principal.
 *
 * Utilisation :
 *   node agent.js                    # Lance la sync selon l'intervalle configuré
 *   node agent.js --once             # Une seule sync puis arrêt
 *   node agent.js --interval 30      # Override l'intervalle (30 ou 60 minutes)
 *
 * Configuration :
 *   Éditez config.json avec votre clé API (disponible dans Paramètres → Sauvegarde)
 *
 * Installation :
 *   Aucune dépendance requise — Node.js 18+ suffit.
 *   (Utilise uniquement les modules natifs : https, fs, path)
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG_PATH = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

const SERVER_URL = config.serverUrl || "https://ecolpro.vercel.app";
const API_KEY = config.apiKey;
const BACKUP_DIR = path.resolve(__dirname, config.backupDir || "./backups");
const MAX_BACKUPS = config.maxBackups || 30;
const LOG_FILE = path.resolve(__dirname, config.logFile || "./sync.log");

// Override par arguments CLI
const args = process.argv.slice(2);
const onceMode = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const cliInterval = intervalArg ? parseInt(intervalArg.split("=")[1]) : null;

// L'intervalle vient de la config côté serveur, mais on peut override
let syncInterval = cliInterval || config.intervalMinutes || 60;

// ============================================================
// LOGGING
// ============================================================

function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore les erreurs de log
  }
}

// ============================================================
// TÉLÉCHARGEMENT
// ============================================================

function downloadBackup() {
  return new Promise((resolve, reject) => {
    const url = `${SERVER_URL}/api/sync/export-all?apiKey=${encodeURIComponent(API_KEY)}`;
    const protocol = url.startsWith("https") ? https : http;

    log(`Téléchargement depuis ${SERVER_URL}/api/sync/export-all...`);

    const req = protocol.get(
      url,
      {
        headers: { "User-Agent": "EcolPro-SyncAgent/1.0" },
        timeout: 300000, // 5 minutes max
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            reject(
              new Error(
                `HTTP ${res.statusCode}: ${body.substring(0, 200) || "Erreur serveur"}`
              )
            );
          });
          return;
        }

        // Créer le dossier de sauvegarde
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, "-").substring(0, 16);
        const backupPath = path.join(BACKUP_DIR, dateStr);

        fs.mkdirSync(backupPath, { recursive: true });

        const filename =
          res.headers["content-disposition"]
            ?.match(/filename="([^"]+)"/)?.[1] || `sauvegarde_${dateStr}.zip`;
        const filePath = path.join(backupPath, filename);

        const fileStream = fs.createWriteStream(filePath);
        const fileCount = res.headers["x-export-file-count"] || "?";
        const totalRows = res.headers["x-export-total-rows"] || "?";

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          const stats = fs.statSync(filePath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          log(
            `Sauvegarde réussie: ${filename} (${sizeMB} MB, ${fileCount} fichiers, ${totalRows} lignes)`
          );
          log(`Stockée dans: ${backupPath}`);
          resolve({ filePath, backupPath, fileCount, totalRows, sizeMB });
        });

        fileStream.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      }
    );

    req.on("error", (err) => {
      reject(new Error(`Erreur réseau: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout: le téléchargement a pris trop de temps"));
    });
  });
}

// ============================================================
// NETTOYAGE DES ANCIENNES SAUVEGARDES
// ============================================================

function cleanOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;

    const entries = fs
      .readdirSync(BACKUP_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        path: path.join(BACKUP_DIR, e.name),
        mtime: fs.statSync(path.join(BACKUP_DIR, e.name)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (entries.length <= MAX_BACKUPS) return;

    const toDelete = entries.slice(MAX_BACKUPS);
    for (const entry of toDelete) {
      fs.rmSync(entry.path, { recursive: true, force: true });
      log(`Ancienne sauvegarde supprimée: ${entry.name}`);
    }
  } catch (err) {
    log(`Erreur lors du nettoyage: ${err.message}`, "WARN");
  }
}

// ============================================================
// BOUCLE PRINCIPALE
// ============================================================

async function runSync() {
  if (API_KEY === "REMPLACER_PAR_VOTRE_CLE_API" || !API_KEY) {
    log("ERREUR: Clé API non configurée. Éditez config.json avec votre clé.", "ERROR");
    log("Vous trouverez votre clé API dans: Paramètres → Sauvegarde & Sync → Clé API", "ERROR");
    process.exit(1);
  }

  try {
    log("=== Début de la synchronisation ===");
    await downloadBackup();
    cleanOldBackups();
    log("=== Synchronisation terminée avec succès ===");
  } catch (err) {
    log(`ÉCHEC: ${err.message}`, "ERROR");
    if (onceMode) process.exit(1);
  }
}

async function main() {
  // Créer le dossier de backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  log("========================================");
  log("  EcolPro — Agent de synchronisation");
  log("========================================");
  log(`Serveur: ${SERVER_URL}`);
  log(`Dossier de sauvegarde: ${BACKUP_DIR}`);
  log(`Intervalle: ${syncInterval} minutes`);
  log(`Sauvegardes max conservées: ${MAX_BACKUPS}`);
  log("========================================");

  if (onceMode) {
    log("Mode --once: une seule synchronisation");
    await runSync();
    process.exit(0);
  }

  // Première sync immédiate
  await runSync();

  // Puis sync périodique
  const intervalMs = syncInterval * 60 * 1000;
  log(`Prochaine synchronisation dans ${syncInterval} minutes...`);

  setInterval(async () => {
    await runSync();
    log(`Prochaine synchronisation dans ${syncInterval} minutes...`);
  }, intervalMs);

  // Garder le processus vivant
  process.stdin.resume();

  // Gestion propre de l'arrêt
  process.on("SIGINT", () => {
    log("Arrêt de l'agent (SIGINT)");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log("Arrêt de l'agent (SIGTERM)");
    process.exit(0);
  });
}

main();
