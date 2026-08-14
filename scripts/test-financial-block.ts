/**
 * Script de simulation : teste la logique de blocage financier
 * Scénario : parent avec 3 enfants, 1 seul en retard/exclu
 *
 * Usage: npx tsx scripts/test-financial-block.ts
 */

import prisma from "../src/lib/prisma";
import { checkUserFinancialBlock, getSituationFinanciere, checkEleveAccess } from "../src/lib/financial-guard";

// Script de simulation manuelle (hors requête HTTP) : aucune session réelle n'existe.
// On simule un périmètre TENANT_ADMIN (accès à tout le tenant, tous sites confondus) car ce
// script vérifie la logique métier sur l'ensemble du tenant, pas le périmètre d'un site précis.
const ADMIN_CLAIMS = { role: "TENANT_ADMIN" } as const;

async function simulate() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("Usage: npx tsx scripts/test-financial-block.ts <tenantId>");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("SIMULATION : BLOCAGE FINANCIER & EXCLUSION");
  console.log("=".repeat(70));

  // ── Étape 1: Trouver ou créer un parent avec 3 enfants ──
  console.log("\n📋 Étape 1: Recherche d'un parent avec plusieurs enfants...");

  const parents = await prisma.parent.findMany({
    where: { tenantId },
    include: {
      enfants: { include: { eleve: { select: { id: true, nom: true, prenom: true, statut: true, classe: { select: { nom: true } } } } } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const parentAvecEnfants = parents.find((p) => p.enfants.length >= 2);
  if (!parentAvecEnfants) {
    console.log("❌ Aucun parent avec au moins 2 enfants trouvé. Création de données de test...");

    // Créer un parent de test
    const testUser = await prisma.user.create({
      data: {
        email: `test-parent-${Date.now()}@ecolpro.test`,
        name: "Parent Test Simulation",
        role: "PARENT",
        tenantId,
        password: "$2a$10$test",
      },
    });

    const testParent = await prisma.parent.create({
      data: {
        nom: "Test",
        prenom: "Parent Simulation",
        phone: "771234567",
        userId: testUser.id,
        tenantId,
      },
    });

    // Créer 3 élèves de test
    const classes = await prisma.classe.findMany({ where: { tenantId }, take: 3 });
    const eleves = [];
    for (let i = 0; i < 3; i++) {
      const matricule = `SIM-${Date.now()}-${i}`;
      const eleve = await prisma.eleve.create({
        data: {
          matricule,
          nom: `TestEnfant${i + 1}`,
          prenom: `Sim${i + 1}`,
          dateNaissance: new Date(2010 + i, 0, 15),
          sexe: i === 1 ? "F" : "M",
          statut: "ACTIF",
          anneeInscription: "2025-2026",
          tenantId,
          classeId: classes[i]?.id ?? null,
        },
      });
      await prisma.eleveParent.create({
        data: {
          eleveId: eleve.id,
          parentId: testParent.id,
          lien: i === 0 ? "PERE" : "MERE",
          isGardien: i === 0,
        },
      });
      eleves.push(eleve);
    }

    console.log(`✅ Parent créé: ${testUser.name} (${testUser.email})`);
    console.log(`✅ 3 enfants créés: ${eleves.map((e) => `${e.prenom} ${e.nom}`).join(", ")}`);

    await runSimulation(testUser.id, tenantId, eleves);
  } else {
    console.log(`✅ Parent trouvé: ${parentAvecEnfants.user?.name} avec ${parentAvecEnfants.enfants.length} enfants`);
    const eleves = parentAvecEnfants.enfants.map((ep) => ep.eleve);
    await runSimulation(parentAvecEnfants.user!.id, tenantId, eleves);
  }
}

async function runSimulation(userId: string, tenantId: string, eleves: any[]) {
  const eleveIds = eleves.map((e) => e.id);

  // ── Étape 2: État initial — aucun enfant exclu ──
  console.log("\n" + "─".repeat(70));
  console.log("📋 Étape 2: État initial (aucun enfant exclu)");
  console.log("─".repeat(70));

  let block = await checkUserFinancialBlock(userId, tenantId, ADMIN_CLAIMS);
  console.log(`Blocage: ${block.blocked ? "OUI ❌" : "NON ✅"}`);
  console.log(`Blocage partiel: ${block.partialBlock ? "OUI ⚠️" : "NON ✅"}`);
  console.log(`Message: ${block.messageKey ?? "Aucun"}`);

  for (const e of eleves) {
    const access = await checkEleveAccess(e.id, tenantId);
    console.log(`  ${e.prenom} ${e.nom}: accès=${access.allowed ? "AUTORISÉ ✅" : "BLOQUÉ ❌"}`);
  }

  // ── Étape 3: Exclure 1 enfant sur 3 ──
  const enfantExclu = eleves[0];
  console.log("\n" + "─".repeat(70));
  console.log(`📋 Étape 3: Exclusion de ${enfantExclu.prenom} ${enfantExclu.nom} (1 sur ${eleves.length})`);
  console.log("─".repeat(70));

  // Créer une facture en retard
  const facture = await prisma.facture.create({
    data: {
      tenantId,
      eleveId: enfantExclu.id,
      numero: `SIM-${Date.now()}`,
      libelle: "Scolarité Test Simulation",
      montant: 50000,
      devise: "DJF",
      statut: "EN_RETARD",
      echeance: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 jours en retard
    },
  });
  console.log(`  Facture créée: ${facture.numero} (50 000 DJF, en retard)`);

  // Envoyer 3 relances
  for (let i = 1; i <= 3; i++) {
    await prisma.relance.create({
      data: {
        tenantId,
        factureId: facture.id,
        niveau: i,
        canal: "sms",
        message: `Relance niveau ${i} pour ${facture.numero}`,
      },
    });
  }
  console.log(`  3 relances envoyées`);

  // Exclure l'élève
  await prisma.exclusionEleve.create({
    data: {
      tenantId,
      eleveId: enfantExclu.id,
      motif: "NON_PAIEMENT",
      details: "Non-paiement répété après 3 relances",
      dateDebut: new Date(),
    },
  });
  await prisma.eleve.update({
    where: { id: enfantExclu.id },
    data: { statut: "EXCLU" },
  });
  console.log(`  ${enfantExclu.prenom} ${enfantExclu.nom} exclu (statut=EXCLU)`);

  // ── Étape 4: Vérifier le blocage ──
  console.log("\n" + "─".repeat(70));
  console.log("📋 Étape 4: Vérification du blocage (1 enfant exclu sur 3)");
  console.log("─".repeat(70));

  block = await checkUserFinancialBlock(userId, tenantId, ADMIN_CLAIMS);
  console.log(`Blocage total: ${block.blocked ? "OUI ❌" : "NON ✅"}`);
  console.log(`Blocage partiel: ${block.partialBlock ? "OUI ⚠️" : "NON"}`);
  console.log(`Enfants exclus: ${block.excludedEleveIds?.length ?? 0}`);
  console.log(`Message: ${block.messageKey ?? "Aucun"}`);

  for (const e of eleves) {
    const access = await checkEleveAccess(e.id, tenantId);
    const situation = await getSituationFinanciere(e.id, tenantId, ADMIN_CLAIMS);
    console.log(`  ${e.prenom} ${e.nom}:`);
    console.log(`    Accès: ${access.allowed ? "AUTORISÉ ✅" : "BLOQUÉ ❌"}`);
    console.log(`    Financier: facturé=${situation.totalFacture}, payé=${situation.totalPaye}, restant=${situation.totalRestant}`);
    console.log(`    Retards: ${situation.nbFacturesEnRetard}, Relances: ${situation.nbRelances}`);
    console.log(`    Exclu: ${situation.estExclu ? "OUI ❌" : "NON ✅"}`);
  }

  // ── Étape 5: Exclure tous les enfants ──
  console.log("\n" + "─".repeat(70));
  console.log("📋 Étape 5: Exclusion de TOUS les enfants");
  console.log("─".repeat(70));

  for (let i = 1; i < eleves.length; i++) {
    await prisma.exclusionEleve.create({
      data: {
        tenantId,
        eleveId: eleves[i].id,
        motif: "NON_PAIEMENT",
        details: "Test simulation - exclusion totale",
        dateDebut: new Date(),
      },
    });
    await prisma.eleve.update({
      where: { id: eleves[i].id },
      data: { statut: "EXCLU" },
    });
    console.log(`  ${eleves[i].prenom} ${eleves[i].nom} exclu`);
  }

  block = await checkUserFinancialBlock(userId, tenantId, ADMIN_CLAIMS);
  console.log(`\nBlocage total: ${block.blocked ? "OUI ❌" : "NON ✅"}`);
  console.log(`Raison: ${block.reason}`);
  console.log(`Message: ${block.messageKey ?? "Aucun"}`);

  // ── Étape 6: Lever une exclusion (revenir à 2 exclus sur 3) ──
  console.log("\n" + "─".repeat(70));
  console.log("📋 Étape 6: Lever l'exclusion du 2ème enfant (retour à 1 sur 3)");
  console.log("─".repeat(70));

  const excl2 = await prisma.exclusionEleve.findFirst({
    where: { eleveId: eleves[1].id, dateFin: null },
  });
  if (excl2) {
    await prisma.exclusionEleve.update({
      where: { id: excl2.id },
      data: { dateFin: new Date(), leveeLe: new Date() },
    });
    await prisma.eleve.update({
      where: { id: eleves[1].id },
      data: { statut: "ACTIF" },
    });
    console.log(`  ${eleves[1].prenom} ${eleves[1].nom} réactivé`);
  }

  const excl3 = await prisma.exclusionEleve.findFirst({
    where: { eleveId: eleves[2].id, dateFin: null },
  });
  if (excl3) {
    await prisma.exclusionEleve.update({
      where: { id: excl3.id },
      data: { dateFin: new Date(), leveeLe: new Date() },
    });
    await prisma.eleve.update({
      where: { id: eleves[2].id },
      data: { statut: "ACTIF" },
    });
    console.log(`  ${eleves[2].prenom} ${eleves[2].nom} réactivé`);
  }

  block = await checkUserFinancialBlock(userId, tenantId, ADMIN_CLAIMS);
  console.log(`\nBlocage total: ${block.blocked ? "OUI ❌" : "NON ✅"}`);
  console.log(`Blocage partiel: ${block.partialBlock ? "OUI ⚠️" : "NON"}`);
  console.log(`Enfants exclus: ${block.excludedEleveIds?.length ?? 0}`);
  console.log(`Message: ${block.messageKey ?? "Aucun"}`);

  for (const e of eleves) {
    const access = await checkEleveAccess(e.id, tenantId);
    console.log(`  ${e.prenom} ${e.nom}: accès=${access.allowed ? "AUTORISÉ ✅" : "BLOQUÉ ❌"}`);
  }

  // ── Résumé ──
  console.log("\n" + "=".repeat(70));
  console.log("RÉSUMÉ DE LA SIMULATION");
  console.log("=".repeat(70));
  console.log(`
✅ État initial (0 enfant exclu): Parent accès normal
⚠️ 1 enfant exclu sur 3: Parent accès PARTIEL (bannière d'avertissement)
   - Enfant exclu: accès BLOQUÉ
   - Enfants non exclus: accès NORMAL
❌ Tous les enfants exclus: Parent accès BLOQUÉ (redirection /acces-bloque)
✅ Après levée d'exclusion: Retour à accès PARTIEL puis NORMAL
`);

  console.log("Simulation terminée. Les données de test restent en base.");
  console.log("Pour nettoyer: supprimer les élèves/parents/factures avec 'Test' ou 'Sim' dans le nom.");
}

simulate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
