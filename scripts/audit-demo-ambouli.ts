/**
 * Audit du jeu de démonstration « Cité Scolaire Ambouli ».
 *
 * Vérifie trois choses que le validateur SQL ne peut pas voir, parce qu'elles
 * ne se lisent qu'une fois les données en base :
 *
 *  1. la répartition entre les deux campus (aucun écran ne doit être vide
 *     d'un côté et plein de l'autre) ;
 *  2. la cohérence métier (dates dans les bornes, factures soldées, emploi du
 *     temps sans collision) ;
 *  3. la Time Machine : le volume visible doit CROÎTRE avec la date simulée,
 *     et rester figé pour ce qui est structurel ou planifié.
 *
 *   npx tsx scripts/audit-demo-ambouli.ts
 */
import { PrismaClient } from "@prisma/client";
import { filtreHorizon } from "../src/lib/demo-horizon";
import { siteFilterForModel, mergeFilters } from "../src/lib/site-scope";

const prisma = new PrismaClient();
const T = "tenant-ambouli";
const q = (s: string) => prisma.$queryRawUnsafe<Record<string, unknown>[]>(s);

/** Les six dates sont les presets exacts du modal Time Machine. */
const DATES: [string, string][] = [
  ["2025-10-15T10:00:00Z", "Oct 25"],
  ["2026-01-15T10:00:00Z", "Jan 26"],
  ["2026-03-15T10:00:00Z", "Mar 26"],
  ["2026-06-15T10:00:00Z", "Juin 26"],
  ["2026-08-16T10:00:00Z", "Aout 26"],
  ["2026-10-15T10:00:00Z", "Oct 26"],
];
const SITES: [string, string][] = [
  ["site-ambouli", "Campus Ambouli"],
  ["site-arhiba", "Annexe Arhiba"],
];

function tab(rows: Record<string, unknown>[]) {
  if (!rows.length) return "  (vide)";
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (v: unknown[]) => "  " + v.map((x, i) => String(x ?? "").padEnd(w[i])).join(" | ");
  return [line(cols), "  " + w.map((x) => "-".repeat(x)).join("-+-"), ...rows.map((r) => line(cols.map((c) => r[c])))].join("\n");
}

let anomalies = 0;
const verifs: Record<string, unknown>[] = [];
async function check(nom: string, sql: string, attendu = 0) {
  try {
    const n = Number((await q(sql))[0]?.n ?? 0);
    const ok = n === attendu;
    if (!ok) anomalies++;
    verifs.push({ verification: nom, valeur: n, attendu, verdict: ok ? "OK" : "ANOMALIE" });
  } catch (e) {
    anomalies++;
    verifs.push({ verification: nom, valeur: "ERR", attendu, verdict: (e as Error).message.slice(0, 60) });
  }
}

// Claims d'un chef d'établissement borné à un seul campus.
const claims = (siteId: string) => ({
  role: "PRINCIPAL" as const, siteId, siteIds: [siteId],
  tenantId: T, tenantHasSites: true, id: "u", userId: "u",
});
const MODEL_PRISMA: Record<string, string> = {
  note: "Note", absence: "Absence", incident: "Incident", bulletin: "Bulletin",
  facture: "Facture", paiement: "Paiement", devoir: "Devoir",
  evaluation: "Evaluation", examen: "Examen", eleve: "Eleve",
  learningEvidence: "LearningEvidence", predictionDifficulte: "PredictionDifficulte",
};
const SANS_TENANT = new Set(["paiement"]);

async function compte(model: string, siteId: string, date: Date | null) {
  const site = siteFilterForModel(model, claims(siteId));
  const horizon = date ? filtreHorizon(MODEL_PRISMA[model], "count", date) : null;
  const base = SANS_TENANT.has(model) ? {} : { tenantId: T };
  const where = mergeFilters(base, site, horizon ? { AND: [horizon] } : null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[model].count({ where });
}

async function main() {
  console.log("\n===== 1. RÉPARTITION ENTRE LES DEUX CAMPUS =====\n");
  console.log(tab(await q(`
    SELECT 'eleves' e, COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int ambouli,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int arhiba,
           COUNT(*) FILTER (WHERE "siteId" IS NULL)::int sans_site
      FROM eleves WHERE "tenantId"='${T}' AND "deletedAt" IS NULL
    UNION ALL SELECT 'classes', COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int, COUNT(*) FILTER (WHERE "siteId" IS NULL)::int
      FROM classes WHERE "tenantId"='${T}'
    UNION ALL SELECT 'factures', COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int, COUNT(*) FILTER (WHERE "siteId" IS NULL)::int
      FROM factures WHERE "tenantId"='${T}'
    UNION ALL SELECT 'learnos evidences', COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int, COUNT(*) FILTER (WHERE "siteId" IS NULL)::int
      FROM learnos_learning_evidences WHERE "tenantId"='${T}'
    UNION ALL SELECT 'learnos predictions', COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int, COUNT(*) FILTER (WHERE "siteId" IS NULL)::int
      FROM learnos_predictions WHERE "tenantId"='${T}'
    UNION ALL SELECT 'learnos chapitres (partagés)', COUNT(*) FILTER (WHERE "siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE "siteId"='site-arhiba')::int, COUNT(*) FILTER (WHERE "siteId" IS NULL)::int
      FROM learnos_chapitres WHERE "tenantId"='${T}'
    UNION ALL SELECT 'exclusions', COUNT(*) FILTER (WHERE e."siteId"='site-ambouli')::int,
           COUNT(*) FILTER (WHERE e."siteId"='site-arhiba')::int, 0
      FROM exclusions_eleve x JOIN eleves e ON e.id=x."eleveId" WHERE x."tenantId"='${T}'`)));

  console.log("\n===== 2. COHÉRENCE MÉTIER =====\n");
  await check("Élèves sans site ou sans classe", `SELECT COUNT(*)::int n FROM eleves WHERE "tenantId"='${T}' AND "deletedAt" IS NULL AND ("siteId" IS NULL OR "classeId" IS NULL)`);
  await check("Élève dans une classe d'un autre campus", `SELECT COUNT(*)::int n FROM eleves e JOIN classes c ON c.id=e."classeId" WHERE e."tenantId"='${T}' AND e."siteId" IS DISTINCT FROM c."siteId"`);
  await check("Note hors des bornes de sa période", `SELECT COUNT(*)::int n FROM notes nt JOIN periodes pe ON pe.id=nt."periodeId" WHERE nt."tenantId"='${T}' AND (nt.date < pe."dateDebut" OR nt.date > pe."dateFin")`);
  await check("Note ou absence le week-end (ven/sam)", `SELECT (SELECT COUNT(*) FROM notes WHERE "tenantId"='${T}' AND EXTRACT(DOW FROM date) IN (5,6)) + (SELECT COUNT(*) FROM absences WHERE "tenantId"='${T}' AND EXTRACT(DOW FROM date) IN (5,6)) AS n`);
  await check("Absence hors de toute année scolaire", `SELECT COUNT(*)::int n FROM absences a WHERE a."tenantId"='${T}' AND NOT EXISTS (SELECT 1 FROM annees_scolaires an WHERE an."tenantId"=a."tenantId" AND a.date BETWEEN an."dateDebut" AND an."dateFin")`);
  await check("Bulletin publié avant la fin de son trimestre", `SELECT COUNT(*)::int n FROM bulletins b JOIN periodes pe ON pe.id=b."periodeId" WHERE b."tenantId"='${T}' AND b."publishedAt" IS NOT NULL AND b."publishedAt" < pe."dateFin"`);
  await check("Facture PAYEE au solde non nul", `SELECT COUNT(*)::int n FROM (SELECT f.id FROM factures f LEFT JOIN paiements pa ON pa."factureId"=f.id WHERE f."tenantId"='${T}' AND f.statut='PAYEE' GROUP BY f.id, f.montant HAVING COALESCE(SUM(pa.montant),0) < f.montant - 0.01) z`);
  await check("Paiements cumulés > montant facturé", `SELECT COUNT(*)::int n FROM (SELECT f.id FROM factures f JOIN paiements pa ON pa."factureId"=f.id WHERE f."tenantId"='${T}' GROUP BY f.id, f.montant HAVING SUM(pa.montant) > f.montant + 0.01) z`);
  await check("Enseignant sur deux classes au même créneau", `SELECT COUNT(*)::int n FROM (SELECT et."enseignantId", et.jour, et."heureDebut", et.annee FROM emplois_temps et JOIN classes c ON c.id=et."classeId" WHERE c."tenantId"='${T}' AND et."enseignantId" IS NOT NULL GROUP BY 1,2,3,4 HAVING COUNT(*)>1) z`);
  await check("Salle occupée deux fois au même créneau", `SELECT COUNT(*)::int n FROM (SELECT et.salle, et.jour, et."heureDebut", et.annee FROM emplois_temps et JOIN classes c ON c.id=et."classeId" WHERE c."tenantId"='${T}' AND et.salle IS NOT NULL GROUP BY 1,2,3,4 HAVING COUNT(*)>1) z`);
  await check("Cours programmé un vendredi ou un samedi", `SELECT COUNT(*)::int n FROM emplois_temps et JOIN classes c ON c.id=et."classeId" WHERE c."tenantId"='${T}' AND et.jour IN ('VENDREDI','SAMEDI')`);
  await check("Élève sans tuteur gardien", `SELECT COUNT(*)::int n FROM eleves e WHERE e."tenantId"='${T}' AND e."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM eleve_parents ep WHERE ep."eleveId"=e.id AND ep."isGardien"=true)`);
  await check("Année en cours du tenant ≠ année isCurrent", `SELECT COUNT(*)::int n FROM tenants t WHERE t.id='${T}' AND t."currentYear" <> (SELECT libelle FROM annees_scolaires WHERE "tenantId"='${T}' AND "isCurrent" LIMIT 1)`);
  await check("Cours déjà saisis pour la rentrée à venir", `SELECT COUNT(*)::int n FROM notes WHERE "tenantId"='${T}' AND date >= '2026-09-15'`);
  console.log(tab(verifs));

  console.log("\n===== 3. TIME MACHINE — 6 DATES x 2 CAMPUS =====\n");
  const bornes: [string, string][] = [
    ["note", "Notes"], ["absence", "Absences"], ["incident", "Incidents"],
    ["bulletin", "Bulletins"], ["facture", "Factures"], ["paiement", "Paiements"],
    ["learningEvidence", "LEARNOS evidences"],
  ];
  const figes: [string, string][] = [
    ["evaluation", "Évaluations (planifié)"], ["examen", "Examens (planifié)"], ["eleve", "Élèves (structurel)"],
  ];

  for (const [model, label] of [...bornes, ...figes]) {
    const doitCroitre = bornes.some(([m]) => m === model);
    const rows: Record<string, unknown>[] = [];
    for (const [siteId, nom] of SITES) {
      const row: Record<string, unknown> = { campus: nom };
      for (const [iso, lab] of DATES) row[lab] = await compte(model, siteId, new Date(iso));
      rows.push(row);
    }
    console.log(`### ${label}`);
    console.log(tab(rows));
    for (const r of rows) {
      const serie = DATES.map(([, l]) => Number(r[l]));
      const decroit = serie.some((v, i) => i > 0 && v < serie[i - 1]);
      const fige = new Set(serie).size === 1;
      if (decroit) { anomalies++; console.log(`  ⚠ ${r.campus} : série non monotone`); }
      if (doitCroitre && fige) { anomalies++; console.log(`  ⚠ ${r.campus} : figé aux 6 dates — l'horloge n'a aucun effet`); }
      if (!doitCroitre && !fige) { anomalies++; console.log(`  ⚠ ${r.campus} : varie alors que ce modèle est hors horizon`); }
    }
    console.log("");
  }

  console.log(anomalies === 0
    ? "===== RÉSULTAT : aucune anomalie ====="
    : `===== RÉSULTAT : ${anomalies} anomalie(s) =====`);
  process.exitCode = anomalies === 0 ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
