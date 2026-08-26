import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ log: [] });

const j = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
  console.log("TENANTS :");
  for (const t of tenants) console.log(`  ${t.id}  ${t.name}`);

  const T = "tenant-ambouli";
  console.log("\nANNÉES SCOLAIRES :");
  const annees = await db.anneesScolaires.findMany({
    where: { tenantId: T }, orderBy: { dateDebut: "asc" },
  });
  for (const a of annees) {
    console.log(`  ${a.libelle}  ${j(a.dateDebut)} → ${j(a.dateFin)}  isCurrent=${a.isCurrent}  ${a.statut}`);
  }

  const cibles: [string, string | null][] = [
    ["eleve", null], ["classe", null], ["matiere", null],
    ["evaluation", "date"], ["note", "date"], ["absence", "date"],
    ["incident", "date"], ["sanction", "dateDebut"], ["passageInfirmerie", "date"],
    ["devoir", "dateDonne"], ["bulletin", "publishedAt"], ["facture", "echeance"],
    ["depense", "date"], ["examen", "dateDebut"],
    ["planificationChapitre", null], ["chapitre", null], ["competence", null],
    ["learningEvidence", "occurredAt"], ["studentLearningProfile", null],
    ["predictionDifficulte", "emiseLe"], ["planProgression", null],
    ["recommandation", null], ["kpiSnapshot", "periode"], ["learnosEvent", "occurredAt"],
  ];

  console.log("\nDONNÉES (tenant-ambouli) :");
  console.log("  modèle".padEnd(28) + "n".padStart(9) + "   étendue de la date métier");
  console.log("  " + "-".repeat(72));
  for (const [m, champ] of cibles) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (db as any)[m];
    if (!d) { console.log(`  ${m.padEnd(26)} (modèle absent)`); continue; }
    let n = 0;
    try { n = await d.count({ where: { tenantId: T } }); }
    catch { try { n = await d.count(); } catch { console.log(`  ${m.padEnd(26)} n/a`); continue; } }
    let etendue = "";
    if (champ && n > 0) {
      try {
        const a = await d.aggregate({ where: { tenantId: T }, _min: { [champ]: true }, _max: { [champ]: true } });
        etendue = `${j(a._min?.[champ])} → ${j(a._max?.[champ])}`;
      } catch { etendue = "?"; }
    }
    console.log(`  ${m.padEnd(26)}${String(n).padStart(9)}   ${etendue}`);
  }

  console.log("\nPLANIFICATION PAR ANNÉE :");
  for (const a of annees) {
    const st = await db.planificationChapitre.groupBy({
      where: { tenantId: T, anneeId: a.id }, by: ["statut"], _count: true,
    });
    const tr = await db.planificationChapitre.aggregate({
      where: { tenantId: T, anneeId: a.id },
      _count: { traiteLe: true, demarreLe: true },
      _min: { traiteLe: true }, _max: { traiteLe: true },
    });
    console.log(`  ${a.libelle} : ${JSON.stringify(st)}`);
    console.log(`     traiteLe renseigné ${tr._count.traiteLe}, étendue ${j(tr._min.traiteLe)} → ${j(tr._max.traiteLe)}`);
  }

  console.log("\nCE QUI MANQUE POUR LES INDICES :");
  const prof = await db.studentLearningProfile.count({ where: { tenantId: T } });
  const pred = await db.predictionDifficulte.count({ where: { tenantId: T, predictionCorrecte: { not: null } } });
  console.log(`  ISP  : planifs ✔ | profils d'apprentissage ${prof} | prédictions vérifiées ${pred}`);
  const reco = await db.recommandation.count({ where: { tenantId: T, statut: "OBLIGATOIRE", resolueLe: null } });
  const plans = await db.planProgression.count({ where: { tenantId: T } });
  console.log(`  KPI  : recommandations obligatoires ouvertes ${reco} | plans de progression ${plans}`);

  await db.$disconnect();
}
main().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
