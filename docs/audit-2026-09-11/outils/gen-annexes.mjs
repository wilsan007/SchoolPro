import fs from "fs"; import path from "path";
const ROOT = process.argv[2], OUT = process.argv[3];
const rows = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const api = path.join(ROOT, "src/app/api");
const hasTest = (rel) => { let d = path.join(api, rel); while (d.startsWith(api)) { if (fs.existsSync(d) && fs.readdirSync(d).some(f => f.endsWith(".test.ts"))) return true; if (d === api) break; d = path.dirname(d); } return false; };
const PUBLIC = /^(auth\/|health$|reinscription\/confirm$|reinscription\/invitation|webhooks\/|cron\/|stripe\/webhook$)/;
// Plafonds d'expert : constats lus dans le code (voir les documents d'étape).
const CAP = {
  "parametres/annees-scolaires/[id]": [3.0, "API-C1 : tout compte connecté clôture/rouvre/archive l'année"],
  "eleves/changer-classe": [3.0, "API-C2 : aucun contrôle de rôle ; historiqueClasse sans tenantId"],
  "eleves/dispenses": [5.0, "API-H1 : aucun contrôle de rôle (création/suppression de dispenses)"],
  "eleves/upload-photo": [6.5, "API-H1 : aucun contrôle de rôle"],
  "eleves/attestation": [6.5, "API-H1 : aucun contrôle de rôle"],
  "vie-scolaire/convocations": [6.5, "API-H1 : aucun contrôle de rôle"],
  "classeur": [6.5, "API-H1 : aucun contrôle de rôle"],
  "parametres/classes/export": [7.0, "API-M : export sans contrôle de rôle"],
  "bulletins/generer": [5.0, "MET-H1/H2/H3 : flottants, réécriture de bulletins publiés, rang sans ex-aequo"],
  "facturation/paiement": [6.5, "MET-H5 : contrôle du solde hors transaction (double encaissement)"],
  "super-admin/tenants/[id]": [5.0, "DON-H2 : suppression définitive d'un établissement sans audit ni garde"],
  "cron/dispatch": [4.0, "AUT-C1 : tâches horaires exécutées 12×/h, mensuelles exécutées chaque jour"],
  "webhooks/whatsapp": [6.0, "AUT-H3 : signature non vérifiée si le secret manque (fail-open en prod)"],
  "webhooks/sms": [6.0, "AUT-H3 : fail-open"],
  "webhooks/resend": [6.0, "AUT-H3 : fail-open"],
  "health": [8.0, "INF-B : expose le nombre total d'utilisateurs"],
  "learnos/chatbot-direction": [6.0, "IA-H1 : moteur sous-jacent sans validation de select/include (désactivé)"],
  "reinscription/invitation/[id]": [7.5, "API-M : l'identifiant cuid sert de jeton d'accès, sans expiration"],
  "auth/[...nextauth]": [3.0, "AUTH-C1 : update de session forgé → changement de tenant (prouvé)"],
};
const scored = rows.map(r => {
  let s = 10; const why = [];
  const pub = PUBLIC.test(r.rel);
  if (!r.auth && !pub) { s -= 4; why.push("pas d'authentification reconnue"); }
  if (r.mutating && !r.perm && !pub) { s -= 3; why.push("mutation sans contrôle de rôle"); }
  if (r.readsBody && !r.zod) { s -= 1; why.push("corps non validé (Zod)"); }
  if (r.mutating && !r.audit) { const d = r.methods.includes("DELETE") ? 1.5 : 1; s -= d; why.push(r.methods.includes("DELETE") ? "suppression non auditée" : "mutation non auditée"); }
  if (!hasTest(r.rel)) { s -= 1; why.push("aucun test"); }
  if (r.errMsg) { s -= 1; why.push("message d'erreur interne renvoyé"); }
  if (r.muteDisables > 0) { s -= 0.5; why.push(`${r.muteDisables} exemption lint muette`); }
  if (r.lines > 400) { s -= 0.5; why.push(`${r.lines} lignes`); }
  let cap = CAP[r.rel]; if (cap && s > cap[0]) { s = cap[0]; why.unshift(cap[1]); } else if (cap) why.unshift(cap[1]);
  return { ...r, score: Math.max(0, Math.round(s * 10) / 10), why };
});
const dom = {}; for (const r of scored) { const d = r.rel.split("/")[0]; (dom[d] ??= []).push(r); }
let md = `# Annexe A — Inventaire noté des ${scored.length} routes API\n\n`;
md += `Généré le 2026-09-11 sur le commit \`4976316\` (HEAD, hors travail non commité).\n\n`;
md += `## Grille (plafond automatique, puis plafonds d'expert)\n\nDépart 10. Retraits : pas d'authentification (−4) · mutation sans contrôle de rôle (−3) · corps non validé par Zod (−1) · mutation non auditée (−1, suppression −1,5) · aucun test dans le dossier ou un parent (−1) · message d'erreur interne renvoyé (−1) · exemption \`require-site-filter\` sans justification (−0,5) · fichier > 400 lignes (−0,5).\nLes routes publiques par conception (\`auth/*\`, \`webhooks/*\`, \`cron/*\`, \`health\`, invitations de réinscription, webhook Stripe) ne perdent pas de points d'authentification : leur contrôle propre est jugé par un plafond d'expert.\nUn **plafond d'expert** s'applique quand la lecture du code a établi un défaut (identifiant de constat entre parenthèses, détaillé dans le document d'étape).\n\n> Une note automatique élevée n'est **pas** une certification : elle signifie seulement qu'aucun des signaux ci-dessus n'est absent. Le seuil 9,7 exige en plus une revue humaine de la route et un test couvrant ses refus (401/403/400/404).\n\n`;
md += `## Synthèse par domaine\n\n| Domaine | Routes | Moyenne | Minimum | ≥ 9,7 |\n|---|---:|---:|---:|---:|\n`;
const ds = Object.entries(dom).map(([d, L]) => [d, L.length, L.reduce((a, r) => a + r.score, 0) / L.length, Math.min(...L.map(r => r.score)), L.filter(r => r.score >= 9.7).length]).sort((a, b) => a[2] - b[2]);
for (const [d, n, avg, min, ok] of ds) md += `| ${d} | ${n} | ${avg.toFixed(1)} | ${min.toFixed(1)} | ${ok} |\n`;
const all = scored.map(r => r.score); md += `\n**Toutes routes :** moyenne ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2)} · ${all.filter(x => x >= 9.7).length}/${all.length} routes à 9,7 ou plus · ${all.filter(x => x < 7).length} sous 7.\n\n`;
md += `## Détail (du plus faible au plus fort)\n\n| Score | Route | Méthodes | Motifs |\n|---:|---|---|---|\n`;
for (const r of [...scored].sort((a, b) => a.score - b.score)) md += `| ${r.score.toFixed(1)} | \`/api/${r.rel}\` | ${r.methods || "—"} | ${r.why.join(" · ") || "—"} |\n`;
fs.writeFileSync(path.join(OUT, "A-inventaire-routes-api.md"), md);
console.log("routes", scored.length, "moy", (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2), ">=9.7:", all.filter(x => x >= 9.7).length, "<7:", all.filter(x => x < 7).length);
