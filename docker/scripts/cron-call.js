#!/usr/bin/env node
/* ============================================================
 * EcolPro — Déclencheur de tâches planifiées
 *
 * Remplace Vercel Cron. Exécuté par Ofelia à l'intérieur du conteneur
 * applicatif (`docker exec`), il appelle l'endpoint cron en local.
 *
 * Deux avantages à passer par 127.0.0.1 plutôt que par le domaine public :
 *   - le trafic ne sort jamais du conteneur : ni tunnel, ni Cloudflare, ni
 *     limitation de débit Caddy à contourner ;
 *   - CRON_SECRET est déjà dans l'environnement du conteneur, il n'a donc
 *     pas à être dupliqué dans la configuration de l'ordonnanceur.
 *
 * Usage : node /app/cron-call.js <chemin-de-la-tache>
 *   ex.  node /app/cron-call.js dispatch-scheduled
 * ============================================================ */

const task = process.argv[2];

if (!task) {
  console.error("[cron] Nom de tâche manquant.");
  process.exit(1);
}

// Liste blanche : empêche ce script de servir de proxy vers une route
// arbitraire de l'application si la configuration d'Ofelia était altérée.
const ALLOWED = new Set([
  "dispatch",
  "dispatch-scheduled",
  "purge-sites",
  "learnos-events",
]);

if (!ALLOWED.has(task)) {
  console.error(`[cron] Tâche non autorisée : ${task}`);
  process.exit(1);
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("[cron] CRON_SECRET absent de l'environnement.");
  process.exit(1);
}

const port = process.env.PORT || "3000";
const url = `http://127.0.0.1:${port}/api/cron/${task}`;

// Délai généreux : la répartition des notifications ou la purge des sites
// peuvent légitimement durer plusieurs minutes sur un gros établissement.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

const started = Date.now();

fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
  signal: controller.signal,
})
  .then(async (res) => {
    clearTimeout(timeout);
    const elapsed = Date.now() - started;
    const body = await res.text().catch(() => "");

    if (!res.ok) {
      console.error(`[cron] ${task} → HTTP ${res.status} en ${elapsed}ms : ${body.slice(0, 500)}`);
      process.exit(1);
    }

    console.log(`[cron] ${task} → OK en ${elapsed}ms : ${body.slice(0, 500)}`);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(timeout);
    const reason = err.name === "AbortError" ? "délai dépassé (10 min)" : err.message;
    console.error(`[cron] ${task} → échec : ${reason}`);
    process.exit(1);
  });
