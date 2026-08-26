/**
 * Comblement en masse de la banque de questions LEARNOS
 * ======================================================
 *
 * Détecte tous les couples compétence × palier sans question et génère
 * des énoncés via le moteur IA (`genererQuestions`).
 *
 *   npx tsx scripts/combler-banque.ts                          → tout combler
 *   npx tsx scripts/combler-banque.ts --matiere=<id>           → une matière
 *   npx tsx scripts/combler-banque.ts --niveau=1ere            → un niveau
 *   npx tsx scripts/combler-banque.ts --max=100                → limiter à 100 trous
 *   npx tsx scripts/combler-banque.ts --dry-run                → diagnostic seul
 *   npx tsx scripts/combler-banque.ts --delai=3000             → délai entre appels (ms)
 *   npx tsx scripts/combler-banque.ts --nombre-par-trou=3      → 3 questions par trou
 *
 * Le script est **reprenable** : à chaque lancement il re-détecte les trous
 * restants et ne génère que ce qui manque. Le cache IA (24 h) fait qu'un
 * trou déjà traité par un appel antérieur ne coûte rien la seconde fois.
 */

import { PrismaClient, type PalierExercice, type FormatQuestion } from "@prisma/client";

// Pooler en mode SESSION (DIRECT_URL, port 5432) : plus rapide en séquentiel.
const prisma = new PrismaClient({
  log: [],
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;

// Importer le moteur de génération APRÈS avoir injecté prisma dans globalThis.
import { genererQuestions } from "@/lib/learnos/generation-questions";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import type { SessionSiteClaims } from "@/lib/site-scope";

const PALIERS: PalierExercice[] = [
  "RESTITUTION",
  "APPLICATION",
  "CONSOLIDATION",
  "TRANSFERT",
  "OUVERTURE",
];

const FORMAT_PAR_DEFAUT: FormatQuestion = "CHOIX_UNIQUE";

// Claims niveau admin : accès à tout le tenant, pas de restriction de site.
const CLAIMS_ADMIN: SessionSiteClaims = {
  role: "TENANT_ADMIN",
  siteId: null,
  siteIds: null,
  tenantHasSites: true,
};

interface Args {
  matiereId?: string;
  niveau?: string;
  max?: number;
  dryRun?: boolean;
  delai?: number;
  nombreParTrou?: number;
}

function parseArgs(): Args {
  const args: Args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    if (k === "matiere") args.matiereId = v;
    else if (k === "niveau") args.niveau = v;
    else if (k === "max") args.max = parseInt(v, 10);
    else if (k === "dry-run") args.dryRun = true;
    else if (k === "delai") args.delai = parseInt(v, 10);
    else if (k === "nombre-par-trou") args.nombreParTrou = parseInt(v, 10);
  }
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs();
  const delai = args.delai ?? 2000;
  const nombreParTrou = args.nombreParTrou ?? 2;

  console.log("\n" + "═".repeat(70));
  console.log("  Comblement de la banque de questions LEARNOS");
  console.log("═".repeat(70));

  // 1. Trouver le tenant.
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true } });
  if (tenants.length === 0) {
    console.log("Aucun tenant trouvé.");
    return;
  }
  console.log(`Tenants disponibles : ${tenants.map((t) => t.slug).join(", ")}`);

  // On traite tous les tenants qui ont un curriculum.
  for (const tenant of tenants) {
    await comblerTenant(tenant.id, tenant.slug, args, delai, nombreParTrou);
  }

  await prisma.$disconnect();
}

async function comblerTenant(
  tenantId: string,
  tenantSlug: string,
  args: Args,
  delai: number,
  nombreParTrou: number
) {
  console.log(`\n▸ Tenant : ${tenantSlug} (${tenantId})`);

  // 2. Charger les compétences du curriculum filtré.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId,
      ...(args.matiereId ? { matiereId: args.matiereId } : {}),
      ...(args.niveau ? { niveau: args.niveau } : {}),
    },
    select: {
      id: true,
      nom: true,
      niveau: true,
      matiere: { select: { id: true, nom: true } },
      competences: { select: { id: true, code: true, libelle: true } },
    },
    orderBy: [{ niveau: "asc" }, { ordre: "asc" }],
  });

  const competenceIds = chapitres.flatMap((c) => c.competences.map((cp) => cp.id));
  if (competenceIds.length === 0) {
    console.log("  Aucune compétence trouvée pour ce tenant/filtre.");
    return;
  }

  console.log(`  ${chapitres.length} chapitres, ${competenceIds.length} compétences`);

  // 3. Compter les questions existantes par compétence × palier.
  const comptes = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      competenceId: { in: competenceIds },
    },
    _count: { _all: true },
  });

  const pleins = new Set<string>();
  for (const c of comptes) {
    pleins.add(`${c.competenceId}|${c.palier}`);
  }

  // 4. Identifier les trous.
  const trous: { competenceId: string; palier: PalierExercice; libelle: string; matiere: string }[] = [];
  for (const chapitre of chapitres) {
    for (const comp of chapitre.competences) {
      for (const palier of PALIERS) {
        if (!pleins.has(`${comp.id}|${palier}`)) {
          trous.push({
            competenceId: comp.id,
            palier,
            libelle: `${comp.code} — ${comp.libelle}`,
            matiere: chapitre.matiere.nom,
          });
        }
      }
    }
  }

  console.log(`  ${trous.length} trous détectés`);

  if (trous.length === 0) {
    console.log("  ✓ Banque complète, rien à combler.");
    return;
  }

  if (args.dryRun) {
    console.log("\n  Mode --dry-run : diagnostic seul, aucune génération.\n");
    // Afficher un échantillon.
    const parMatiere = new Map<string, number>();
    for (const t of trous) {
      parMatiere.set(t.matiere, (parMatiere.get(t.matiere) ?? 0) + 1);
    }
    for (const [mat, count] of [...parMatiere.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${mat.padEnd(30)} ${count} trous`);
    }
    console.log(`\n  Total : ${trous.length} trous à combler.`);
    return;
  }

  // 5. Limiter le nombre de trous si demandé.
  const aCombler = args.max ? trous.slice(0, args.max) : trous;
  console.log(`  ${aCombler.length} trous à traiter (max=${args.max ?? "∞"}, ${nombreParTrou}q/trou, délai=${delai}ms)\n`);

  // 6. Générer.
  let creees = 0;
  let echecs = 0;
  let iaIndisponible = false;
  const debut = Date.now();

  for (let i = 0; i < aCombler.length; i++) {
    const trou = aCombler[i];
    const progression = `[${i + 1}/${aCombler.length}]`;

    try {
      const resultat = await genererQuestions(
        tenantId,
        CLAIMS_ADMIN,
        {
          competenceId: trou.competenceId,
          palier: trou.palier,
          format: FORMAT_PAR_DEFAUT,
          nombre: nombreParTrou,
        },
        "script-combler-banque"
      );

      creees += resultat.creees.length;
      if (resultat.creees.length === 0) {
        echecs++;
        console.log(
          `${progression} ✗ ${trou.matiere} | ${trou.libelle} | ${trou.palier} — rejeté (0 créé, ${resultat.rejetees} rejeté(s), ${resultat.modele})`
        );
      } else {
        console.log(
          `${progression} ✓ ${trou.matiere} | ${trou.libelle} | ${trou.palier} — ${resultat.creees.length}q créée(s) (${resultat.modele}${resultat.cached ? ", cache" : ""})`
        );
      }
    } catch (error) {
      echecs++;
      if (error instanceof AiAllProvidersFailedError) {
        console.log(`${progression} ✗ IA INDISPONIBLE — arrêt.`);
        iaIndisponible = true;
        break;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${progression} ✗ ${trou.matiere} | ${trou.libelle} | ${trou.palier} — erreur: ${msg}`);
    }

    // Délai entre les appels pour respecter les quotas IA.
    if (i < aCombler.length - 1) {
      await sleep(delai);
    }

    // Point de contrôle tous les 50 trous.
    if ((i + 1) % 50 === 0) {
      const elapsed = Math.round((Date.now() - debut) / 1000);
      const rate = ((i + 1) / elapsed).toFixed(1);
      const remaining = Math.round(((aCombler.length - i - 1) * elapsed) / (i + 1));
      console.log(
        `  ── checkpoint: ${creees} créées, ${echecs} échecs, ${elapsed}s écoulées, ${rate} trous/s, ~${remaining}s restantes ──`
      );
    }
  }

  const duree = Math.round((Date.now() - debut) / 1000);
  console.log(`\n  ═══ Résumé : ${creees} question(s) créée(s), ${echecs} échec(s), ${duree}s`);

  if (iaIndisponible) {
    console.log("  ⚠ IA indisponible — relancez le script pour reprendre (le cache évite les doublons).");
  }

  // 7. Vérification finale.
  const trousRestants = await compterTrousRestants(tenantId, competenceIds);
  console.log(`  Trous restants : ${trousRestants} (avant: ${trous.length})`);
}

async function compterTrousRestants(tenantId: string, competenceIds: string[]): Promise<number> {
  const comptes = await prisma.question.groupBy({
    by: ["competenceId", "palier"],
    where: {
      tenantId,
      actif: true,
      competenceId: { in: competenceIds },
    },
    _count: { _all: true },
  });

  const pleins = new Set<string>();
  for (const c of comptes) {
    pleins.add(`${c.competenceId}|${c.palier}`);
  }

  let restant = 0;
  for (const compId of competenceIds) {
    for (const palier of PALIERS) {
      if (!pleins.has(`${compId}|${palier}`)) restant++;
    }
  }
  return restant;
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
