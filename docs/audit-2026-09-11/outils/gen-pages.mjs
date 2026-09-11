import fs from "fs"; import path from "path";
const ROOT = process.argv[2], OUT = process.argv[3];
const dash = path.join(ROOT, "src/app/(dashboard)");
const pages = []; (function w(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p = path.join(d,e.name); if (e.isDirectory()) w(p); else if (e.name === "page.tsx") pages.push(p); } })(dash);
const perm = fs.readFileSync(path.join(ROOT, "src/lib/permissions.ts"), "utf8");
const RAW = /\b(bg|text|border)-(red|green|blue|yellow|orange|amber|slate|gray|zinc|indigo|pink|rose|sky|lime|teal|cyan|violet|purple|fuchsia|neutral|stone)-[0-9]{2,3}\b/g;
function imports(file){ const s = fs.readFileSync(file,"utf8"); return [...s.matchAll(/from "@\/components\/([^"]+)"/g)].map(m=>path.join(ROOT,"src/components",m[1])).flatMap(b=>[b+".tsx",b+".ts",path.join(b,"index.tsx")]).filter(f=>fs.existsSync(f)); }
const rows = pages.map(p => {
  const route = "/" + path.relative(dash, path.dirname(p)).replace(/\\/g,"/");
  const s = fs.readFileSync(p, "utf8");
  const files = [p, ...imports(p)];
  const src = files.map(f => fs.readFileSync(f,"utf8")).join("\n");
  const guard = /guardPage\(/.test(s);
  const clientCheck = /session\?\.user\?\.role|role !== "SUPER_ADMIN"/.test(s);
  const inRegistry = perm.includes(`/^\\${route.split("/")[1] ? "/"+route.split("/")[1] : ""}`) || perm.includes(route.split("/")[1] ?? "__");
  let d = path.dirname(p), loading = false; while (d.startsWith(dash)) { if (fs.existsSync(path.join(d,"loading.tsx"))) { loading = true; break; } if (d === dash) break; d = path.dirname(d); }
  const i18n = /getTranslations|useTranslations/.test(src);
  const raw = (src.match(RAW) || []).length;
  const iconBtn = (src.match(/size="icon"/g) || []).length, labelled = (src.match(/size="icon"[^>]*(aria-label|title=)/g) || []).length;
  const modals = (src.match(/fixed inset-0/g) || []).length, dialogRole = /role="dialog"|aria-modal/.test(src);
  let sc = 10; const why = [];
  if (!guard) { if (clientCheck || inRegistry) { sc -= 1; why.push("pas de guardPage (registre middleware / contrôle client seulement)"); } else { sc -= 3; why.push("aucune garde serveur"); } }
  sc -= 1; why.push("aucun error.tsx dans l'application");
  if (!loading) { sc -= 0.5; why.push("pas de loading.tsx"); }
  if (!i18n) { sc -= 1; why.push("aucun appel i18n"); }
  if (raw > 50) { sc -= 1; why.push(`${raw} couleurs brutes hors jetons`); } else if (raw > 10) { sc -= 0.5; why.push(`${raw} couleurs brutes`); }
  if (iconBtn > labelled) { sc -= 0.5; why.push(`${iconBtn - labelled} bouton(s) icône sans libellé`); }
  if (modals && !dialogRole) { sc -= 0.5; why.push(`${modals} modale(s) maison sans role="dialog"`); }
  if (/^\/test-/.test(route)) { sc = Math.min(sc, 6); why.unshift("page de test présente en production"); }
  return { route, score: Math.max(0, Math.round(sc*10)/10), why };
}).sort((a,b)=>a.score-b.score);
const avg = rows.reduce((a,r)=>a+r.score,0)/rows.length;
let md = `# Annexe B — Inventaire noté des ${rows.length} pages du tableau de bord\n\nGénéré le 2026-09-11 sur le commit \`4976316\`. Analyse de la page **et des composants qu'elle importe directement**.\n\n## Grille\n\nDépart 10. Retraits : pas de \`guardPage\` (−1 si la route est couverte par le registre du middleware ou un contrôle client, −3 sinon) · aucun \`error.tsx\` dans l'application (−1, s'applique à toutes les pages) · pas de \`loading.tsx\` sur le segment (−0,5) · aucun appel i18n (−1) · couleurs Tailwind brutes hors jetons de DESIGN.md (> 10 : −0,5 ; > 50 : −1) · boutons icône sans \`aria-label\` (−0,5) · modales maison sans \`role="dialog"\` (−0,5). Pages \`/test-*\` plafonnées à 6.\n\n> Le seuil 9,7 exige en plus : test Playwright de la page pour chaque rôle autorisé **et** refusé, contrôle axe-core sans violation « serious/critical », capture validée contre DESIGN.md.\n\n**Moyenne : ${avg.toFixed(2)}** · ${rows.filter(r=>r.score>=9.7).length}/${rows.length} pages à 9,7 ou plus · la meilleure note possible aujourd'hui est 9,0 tant qu'aucun \`error.tsx\` n'existe.\n\n| Score | Page | Motifs |\n|---:|---|---|\n`;
for (const r of rows) md += `| ${r.score.toFixed(1)} | \`${r.route}\` | ${r.why.join(" · ")} |\n`;
fs.writeFileSync(path.join(OUT, "B-inventaire-pages.md"), md);
console.log("pages", rows.length, "moy", avg.toFixed(2), "min", rows[0].score, rows.slice(0,6).map(r=>r.route+":"+r.score).join(", "));
