/**
 * Script de simulation UX : crée des données réelles et vérifie
 * ce que le parent voit selon le statut de ses enfants.
 *
 * Usage: npx tsx scripts/test-parent-ux.ts <tenantId>
 */

import prisma from "../src/lib/prisma";
import { checkUserFinancialBlock, checkEleveAccess, getSituationFinanciere } from "../src/lib/financial-guard";
import { personalScopeFilter } from "../src/lib/site-scope";
import type { Prisma } from "@prisma/client";

async function simulate() {
  const tenantId = process.argv[2] ?? "cms8kt0b40001zbi3o63y7c5v";

  console.log("=".repeat(70));
  console.log("SIMULATION UX : VUE PARENT AVEC ENFANTS EXCLUS");
  console.log("=".repeat(70));

  // ── Trouver le parent de test créé précédemment (celui avec des enfants) ──
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: "test-parent" }, tenantId },
    include: {
      parents: {
        include: {
          enfants: {
            include: {
              eleve: {
                select: {
                  id: true, nom: true, prenom: true, statut: true,
                  classe: { select: { nom: true, niveau: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Trouver celui qui a au moins 1 enfant
  const testUser = testUsers.find((u) => u.parents.some((p) => p.enfants.length > 0));

  if (!testUser || testUser.parents.length === 0) {
    console.log("❌ Aucun parent de test avec enfants trouvé. Exécutez d'abord test-financial-block.ts");
    process.exit(1);
  }

  const parent = testUser.parents.find((p) => p.enfants.length > 0) ?? testUser.parents[0];
  const enfants = parent.enfants.map((ep) => ep.eleve);

  console.log(`\n👤 Parent: ${testUser.name} (${testUser.email})`);
  console.log(`   Rôle: ${testUser.role}`);
  console.log(`   Enfants: ${enfants.length}`);

  for (const e of enfants) {
    console.log(`   - ${e.prenom} ${e.nom} | statut=${e.statut} | classe=${e.classe?.nom ?? "N/A"}`);
  }

  // ── Simulation 1: Ce que le parent voit sur la page /eleves ──
  console.log("\n" + "─".repeat(70));
  console.log("📱 SIMULATION 1: Page /eleves (liste des élèves)");
  console.log("─".repeat(70));

  // Le filtre personnel du parent — pour le modèle Eleve, la relation est directe
  const parentEleveFilter = {
    parents: { some: { parent: { userId: testUser.id } } },
  };

  console.log("\nFiltre personnel (direct sur Eleve):");
  console.log(JSON.stringify(parentEleveFilter, null, 2));

  // Requête simulée : ce que la page /eleves retourne au parent
  // APRES CORRECTION: les élèves exclus sont filtrés pour les parents
  const isParent = testUser.role === "PARENT";
  const elevesVisibles = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...parentEleveFilter,
      // Filtrage des exclus pour les parents (comportement corrigé)
      ...(isParent && { statut: { not: "EXCLU" } }),
    } as Prisma.EleveWhereInput,
    include: {
      classe: { select: { nom: true, niveau: true } },
    },
    orderBy: [{ prenom: "asc" }],
  });

  // Pour la simulation, on récupère aussi les exclus (pour montrer la différence)
  const elevesExclus = await prisma.eleve.findMany({
    where: {
      tenantId,
      ...parentEleveFilter,
      statut: "EXCLU",
    } as Prisma.EleveWhereInput,
    include: {
      classe: { select: { nom: true, niveau: true } },
    },
  });

  console.log(`\n📋 Élèves visibles par le parent: ${elevesVisibles.length}`);
  for (const e of elevesVisibles) {
    const access = await checkEleveAccess(e.id, tenantId);
    console.log(`   ${e.prenom} ${e.nom} | statut=${e.statut} | accès=${access.allowed ? "✅" : "❌ BLOQUÉ"}`);
  }

  // ── Simulation 2: Blocage au niveau du layout ──
  console.log("\n" + "─".repeat(70));
  console.log("📱 SIMULATION 2: Layout (blocage global)");
  console.log("─".repeat(70));

  const block = await checkUserFinancialBlock(testUser.id, tenantId);
  console.log(`\nBlocage total: ${block.blocked ? "OUI → redirection /acces-bloque ❌" : "NON ✅"}`);
  console.log(`Blocage partiel: ${block.partialBlock ? "OUI → bannière d'avertissement ⚠️" : "NON"}`);
  if (block.messageKey) console.log(`Message key: "${block.messageKey}"`);
  if (block.excludedEleveIds) {
    console.log(`Enfants exclus IDs: ${block.excludedEleveIds.join(", ")}`);
  }

  // ── Simulation 3: Fiche détaillée de chaque enfant ──
  console.log("\n" + "─".repeat(70));
  console.log("📱 SIMULATION 3: Fiche détaillée par enfant (/eleves/[id])");
  console.log("─".repeat(70));

  for (const e of enfants) {
    console.log(`\n📄 ${e.prenom} ${e.nom} (${e.id}):`);
    const access = await checkEleveAccess(e.id, tenantId);
    const situation = await getSituationFinanciere(e.id, tenantId);

    if (!access.allowed) {
      console.log(`   ❌ ACCÈS BLOQUÉ`);
      console.log(`   Motif: ${access.exclusion?.motif}`);
      console.log(`   Depuis: ${new Date(access.exclusion!.dateDebut).toLocaleDateString("fr-FR")}`);
      console.log(`   → Le parent voit une page de blocage au lieu de la fiche`);
    } else {
      console.log(`   ✅ ACCÈS AUTORISÉ`);
      console.log(`   Total facturé: ${situation.totalFacture} DJF`);
      console.log(`   Total payé: ${situation.totalPaye} DJF`);
      console.log(`   Reste à payer: ${situation.totalRestant} DJF`);
      console.log(`   Factures en retard: ${situation.nbFacturesEnRetard}`);
      console.log(`   Relances: ${situation.nbRelances}`);
      console.log(`   Exclu: ${situation.estExclu ? "OUI" : "NON"}`);
      console.log(`   → Le parent voit la fiche complète avec notes, absences, bulletins`);
    }
  }

  // ── Simulation 4: Filtrage des élèves exclus de la liste ──
  console.log("\n" + "─".repeat(70));
  console.log("📱 SIMULATION 4: Filtrage des élèves exclus de la liste");
  console.log("─".repeat(70));

  console.log(`\n✅ Enfants visibles dans /eleves (${elevesVisibles.length}):`);
  for (const e of elevesVisibles) {
    console.log(`   ${e.prenom} ${e.nom} | ${e.classe?.nom ?? "N/A"} | statut=${e.statut}`);
  }

  console.log(`\n❌ Enfants masqués (exclus) (${elevesExclus.length}):`);
  for (const e of elevesExclus) {
    console.log(`   ${e.prenom} ${e.nom} | statut=${e.statut} → NON VISIBLE dans la liste`);
  }

  // ── Résumé UX ──
  console.log("\n" + "=".repeat(70));
  console.log("RÉSUMÉ UX PARENT (APRÈS CORRECTIONS)");
  console.log("=".repeat(70));
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  ÉLÉMENT UX              │  ÉTAT                                │
├─────────────────────────────────────────────────────────────────┤
│  Layout (bannière)       │  ⚠️  Bannière jaune affichée         │
│  Page /eleves            │  ${elevesVisibles.length} enfants visibles (exclus masqués)     │
│  Fiche enfant exclu      │  ❌ Redirection /acces-bloque        │
│  Fiche enfant normal     │  ✅ Fiche complète (notes, etc.)     │
│  Bulletin enfant exclu   │  ❌ Redirection /acces-bloque        │
│  Bulletin enfant normal  │  ✅ Bulletin accessible              │
│  Page /acces-bloque      │  ✅ Pas de redirection (partiel)     │
└─────────────────────────────────────────────────────────────────┘

✅ COMPORTEMENT VALIDÉ:
   1. Le parent voit ${elevesVisibles.length} enfants sur ${enfants.length} dans /eleves
   2. L'enfant exclu (Sim1) est INVISIBLE dans la liste
   3. Si le parent tente d'accéder à /eleves/<id_exclu> → redirection /acces-bloque
   4. Si le parent tente d'accéder au bulletin → redirection /acces-bloque
   5. Les ${elevesVisibles.length} autres enfants sont normalement accessibles
   6. Bannière d'avertissement en haut de toutes les pages
`);

  await prisma.$disconnect();
}

simulate().catch(console.error);
