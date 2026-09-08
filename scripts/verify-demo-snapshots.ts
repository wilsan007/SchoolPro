/**
 * Vérification des snapshots Time Machine
 * ========================================
 *
 * Chaque preset de la machine à temps DOIT avoir des données pré-calculées
 * dans les tables métier (emploi du temps, compétences, pronostics, KPI,
 * notes, absences, etc.). Ce script vérifie que ces snapshots existent avant
 * qu'on affiche le preset.
 *
 * Usage : pnpm exec tsx scripts/verify-demo-snapshots.ts [--tenant=<slug>]
 */

import { PrismaClient } from "@prisma/client";
import { DEMO_PRESETS } from "@/lib/demo-presets";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

interface DateCheck {
  name: string;
  model: string;
  dateField: string;
  /** Champ relationnel vers le tenant si pas de colonne directe `tenantId`. */
  tenantField?: string;
  extraWhere?: Record<string, unknown>;
}

// Tables BORNÉES par demo-horizon.ts pour la Time Machine.
const HORIZON_CHECKS: DateCheck[] = [
  { name: "Notes", model: "note", dateField: "date" },
  { name: "Absences", model: "absence", dateField: "date" },
  { name: "Incidents", model: "incident", dateField: "date" },
  { name: "Devoirs", model: "devoir", dateField: "dateDonne" },
  { name: "Bulletins", model: "bulletin", dateField: "publishedAt" },
  { name: "Factures", model: "facture", dateField: "echeance" },
  { name: "Paiements", model: "paiement", dateField: "date", tenantField: "facture" },
  { name: "Dépenses", model: "depense", dateField: "date" },
  { name: "Relances", model: "relance", dateField: "envoyeeLe" },
  { name: "Événements LEARNOS", model: "learnosEvent", dateField: "occurredAt" },
  { name: "Preuves d'apprentissage", model: "learningEvidence", dateField: "occurredAt" },
  { name: "Prédictions", model: "predictionDifficulte", dateField: "emiseLe" },
  { name: "Snapshots KPI", model: "kpiSnapshot", dateField: "periode" },
  { name: "Alertes parents", model: "alerteParent", dateField: "envoyeeLe" },
  { name: "Évaluations terminées", model: "evaluation", dateField: "date", extraWhere: { statut: { not: "PLANIFIE" } } },
];

// Tables NON bornées par demo-horizon mais qui ont un axe temporel.
const TIME_CHECKS: DateCheck[] = [
  { name: "Séances pédagogiques", model: "seancePedagogique", dateField: "date" },
  { name: "Planifications chapitres démarrées", model: "planificationChapitre", dateField: "demarreLe", extraWhere: { demarreLe: { not: null } } },
  { name: "Planifications compétences", model: "planificationCompetence", dateField: "createdAt" },
];

interface ExistenceCheck {
  name: string;
  model: string;
  tenantField?: string;
}

// Tables structurelles : pas de filtre temporel, on vérifie juste l'existence.
const EXISTENCE_CHECKS: ExistenceCheck[] = [
  { name: "Créneaux emploi du temps", model: "emploiTemps" },
  { name: "Curriculum / chapitres", model: "chapitre" },
  { name: "Compétences", model: "competence" },
  { name: "Matieres", model: "matiere" },
];

function parseErreurTenant(erreur?: string): string | undefined {
  return erreur?.includes("tenantId") ? "pas de colonne tenantId directe" : undefined;
}

const ALL_DATE_CHECKS = [...HORIZON_CHECKS, ...TIME_CHECKS];

async function compterDate(
  tenantId: string,
  preset: Date,
  check: DateCheck
): Promise<{ count: number; erreur?: string }> {
  // @ts-expect-error Prisma dynamic delegate
  const delegate = prisma[check.model];
  if (!delegate) return { count: 0, erreur: `Modèle inconnu : ${check.model}` };

  // Essai direct tenantId ; si absent, on tente de filtrer via la relation par défaut.
  const whereTenant = check.tenantField
    ? { [check.tenantField]: { tenantId } }
    : { tenantId };

  const where: Record<string, unknown> = { ...whereTenant, ...check.extraWhere };
  where[check.dateField] = { lte: preset };

  try {
    const count = await delegate.count({ where });
    return { count };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { count: 0, erreur: msg.slice(0, 120) };
  }
}

async function compterExistence(
  tenantId: string,
  name: string,
  model: string,
  tenantField?: string
) {
  // @ts-expect-error Prisma dynamic delegate
  const delegate = prisma[model];
  if (!delegate) return { name, count: 0, erreur: `Modèle inconnu : ${model}` };

  const where = tenantField ? { [tenantField]: { tenantId } } : { tenantId };
  try {
    return { name, count: await delegate.count({ where }) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { name, count: 0, erreur: msg.slice(0, 120) };
  }
}

interface Result {
  presetId: string;
  presetLabel: string;
  presetDate: Date;
  ok: boolean;
  manques: string[];
  counts: Record<string, number>;
}

async function main() {
  const args = process.argv.slice(2);
  const tenantSlug = args.find((a) => a.startsWith("--tenant="))?.replace("--tenant=", "");

  const tenants = await prisma.tenant.findMany({
    where: tenantSlug ? { slug: tenantSlug } : undefined,
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.log("Aucun tenant trouvé" + (tenantSlug ? ` pour slug=${tenantSlug}` : ""));
    process.exit(1);
  }

  let globalOk = true;

  for (const tenant of tenants) {
    console.log(`\n▸ Tenant : ${tenant.slug} (${tenant.id})`);
    const results: Result[] = [];

    for (const preset of DEMO_PRESETS) {
      const presetDate = new Date(preset.date);
      const counts: Record<string, number> = {};
      const manques: string[] = [];

      for (const check of ALL_DATE_CHECKS) {
        const result = await compterDate(tenant.id, presetDate, check);
        counts[check.name] = result.count;
        if (result.count === 0) {
          const detail = parseErreurTenant(result.erreur);
          manques.push(detail ? `${check.name} (${detail})` : check.name);
        }
      }

      const existence = await Promise.all(
        EXISTENCE_CHECKS.map((e) => compterExistence(tenant.id, e.name, e.model, e.tenantField))
      );
      for (const e of existence) {
        counts[e.name] = e.count;
        if (e.count === 0) {
          const detail = parseErreurTenant(e.erreur);
          manques.push(detail ? `${e.name} (${detail})` : e.name);
        }
      }

      const ok = manques.length === 0;
      results.push({
        presetId: preset.id,
        presetLabel: preset.label,
        presetDate,
        ok,
        manques,
        counts,
      });
      globalOk &&= ok;
    }

    for (const r of results) {
      console.log(`  ${r.ok ? "✓" : "✗"} ${r.presetLabel} (${r.presetDate.toISOString().slice(0, 10)})`);
      if (!r.ok) {
        console.log(`    Manques : ${r.manques.join(", ")}`);
      }
      const importants = [
        "Séances pédagogiques",
        "Planifications chapitres démarrées",
        "Prédictions",
        "Snapshots KPI",
        "Notes",
        "Créneaux emploi du temps",
        "Curriculum / chapitres",
        "Compétences",
      ];
      for (const key of importants) {
        if (r.counts[key] !== undefined) console.log(`    ${key} : ${r.counts[key]}`);
      }
    }
  }

  await prisma.$disconnect();

  if (!globalOk) {
    console.log("\n⚠ Certains presets sont incomplets : le Time Machine ne doit pas être utilisé sur ces dates.");
    process.exit(1);
  }

  console.log("\n✓ Tous les presets sont prêts pour la démonstration.");
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
