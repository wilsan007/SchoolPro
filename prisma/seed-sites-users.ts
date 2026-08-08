import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TENANT_ID = "cms8kt0b40001zbi3o63y7c5v";

async function main() {
  console.log("🚀 Configuration des sites et utilisateurs...");

  // 1. Vérifier les sites existants
  const existingSites = await prisma.site.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, nom: true, code: true },
  });
  console.log(`📍 Sites existants: ${existingSites.length}`);
  existingSites.forEach((s) => console.log(`   - ${s.id} | ${s.nom} | ${s.code ?? "N/A"}`));

  // 2. Créer ou récupérer le Site 2 (rattache les données existantes)
  let site2 = existingSites.find((s) => s.nom.toLowerCase().includes("site 2") || s.code === "SITE-02");
  if (!site2) {
    site2 = await prisma.site.create({
      data: {
        tenantId: TENANT_ID,
        nom: "Site 2",
        code: "SITE-02",
        actif: true,
      },
    });
    console.log(`✅ Site 2 créé: ${site2.id}`);

    // Rattacher toutes les classes existantes (sans siteId) au Site 2
    const classesWithoutSite = await prisma.classe.updateMany({
      where: { tenantId: TENANT_ID, siteId: null },
      data: { siteId: site2.id },
    });
    console.log(`✅ ${classesWithoutSite.count} classes rattachées au Site 2`);

    // Rattacher les élèves existants (sans siteId) au Site 2
    const elevesWithoutSite = await prisma.eleve.updateMany({
      where: { tenantId: TENANT_ID, siteId: null },
      data: { siteId: site2.id },
    });
    console.log(`✅ ${elevesWithoutSite.count} élèves rattachés au Site 2`);

    // Rattacher les examens existants (sans siteId) au Site 2
    const examensWithoutSite = await prisma.examen.updateMany({
      where: { tenantId: TENANT_ID, siteId: null },
      data: { siteId: site2.id },
    });
    if (examensWithoutSite.count > 0) {
      console.log(`✅ ${examensWithoutSite.count} examens rattachés au Site 2`);
    }

    // Rattacher les factures existantes (sans siteId) au Site 2
    const facturesWithoutSite = await prisma.facture.updateMany({
      where: { tenantId: TENANT_ID, siteId: null },
      data: { siteId: site2.id },
    });
    if (facturesWithoutSite.count > 0) {
      console.log(`✅ ${facturesWithoutSite.count} factures rattachées au Site 2`);
    }

    // Rattacher les enseignants existants au Site 2 via EnseignantSite
    const enseignantsWithoutSite = await prisma.enseignant.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true },
    });
    for (const ens of enseignantsWithoutSite) {
      await prisma.enseignantSite.upsert({
        where: { enseignantId_siteId: { enseignantId: ens.id, siteId: site2.id } },
        update: {},
        create: { enseignantId: ens.id, siteId: site2.id },
      });
    }
    if (enseignantsWithoutSite.length > 0) {
      console.log(`✅ ${enseignantsWithoutSite.length} enseignants rattachés au Site 2`);
    }
  } else {
    console.log(`ℹ️  Site 2 existe déjà: ${site2.id}`);
  }

  // 3. Créer ou récupérer le Site 1
  let site1 = existingSites.find((s) => s.nom.toLowerCase().includes("site 1") || s.code === "SITE-01");
  if (!site1) {
    site1 = await prisma.site.create({
      data: {
        tenantId: TENANT_ID,
        nom: "Site 1",
        code: "SITE-01",
        actif: true,
      },
    });
    console.log(`✅ Site 1 créé: ${site1.id}`);
  } else {
    console.log(`ℹ️  Site 1 existe déjà: ${site1.id}`);
  }

  // 4. Créer ou récupérer le Site 3
  let site3 = existingSites.find((s) => s.nom.toLowerCase().includes("site 3") || s.code === "SITE-03");
  if (!site3) {
    site3 = await prisma.site.create({
      data: {
        tenantId: TENANT_ID,
        nom: "Site 3",
        code: "SITE-03",
        actif: true,
      },
    });
    console.log(`✅ Site 3 créé: ${site3.id}`);
  } else {
    console.log(`ℹ️  Site 3 existe déjà: ${site3.id}`);
  }

  // 5. Hash du mot de passe par défaut
  const defaultPassword = await bcrypt.hash("EcolPro@2026", 12);

  // 6. Créer Mouna Mohamed — Directrice Site 1 (+ Site 3)
  const mouna = await prisma.user.upsert({
    where: { email: "ahdimounomar@gmail.com" },
    update: {
      tenantId: TENANT_ID,
      siteId: site1.id,
      role: Role.PRINCIPAL,
      name: "Mouna Mohamed",
      firstName: "Mouna",
      lastName: "Mohamed",
      isActive: true,
    },
    create: {
      tenantId: TENANT_ID,
      siteId: site1.id,
      email: "ahdimounomar@gmail.com",
      password: defaultPassword,
      name: "Mouna Mohamed",
      firstName: "Mouna",
      lastName: "Mohamed",
      role: Role.PRINCIPAL,
      isActive: true,
    },
  });
  console.log(`✅ Utilisatrice créée: Mouna Mohamed (${mouna.id})`);

  // Accès Site 1 et Site 3 pour Mouna (PRINCIPAL sur chaque site)
  for (const site of [site1, site3]) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: mouna.id, siteId: site.id } },
      update: { role: Role.PRINCIPAL },
      create: { userId: mouna.id, siteId: site.id, role: Role.PRINCIPAL },
    });
  }
  console.log(`   → Accès: Site 1 (PRINCIPAL), Site 3 (PRINCIPAL)`);

  // 7. Créer Ilyas Aden — Directeur Site 2
  const ilyas = await prisma.user.upsert({
    where: { email: "Ilyasadendjama@gmail.com" },
    update: {
      tenantId: TENANT_ID,
      siteId: site2.id,
      role: Role.PRINCIPAL,
      name: "Ilyas Aden",
      firstName: "Ilyas",
      lastName: "Aden",
      isActive: true,
    },
    create: {
      tenantId: TENANT_ID,
      siteId: site2.id,
      email: "Ilyasadendjama@gmail.com",
      password: defaultPassword,
      name: "Ilyas Aden",
      firstName: "Ilyas",
      lastName: "Aden",
      role: Role.PRINCIPAL,
      isActive: true,
    },
  });
  console.log(`✅ Utilisateur créé: Ilyas Aden (${ilyas.id})`);

  // Accès Site 2 pour Ilyas (PRINCIPAL)
  await prisma.userSite.upsert({
    where: { userId_siteId: { userId: ilyas.id, siteId: site2.id } },
    update: { role: Role.PRINCIPAL },
    create: { userId: ilyas.id, siteId: site2.id, role: Role.PRINCIPAL },
  });
  console.log(`   → Accès: Site 2 (PRINCIPAL)`);

  // 8. Créer Mohamed Abdi Ali — Administrateur principal (tous les sites)
  const mohamed = await prisma.user.upsert({
    where: { email: "Mohamed.abdi.pk12@gmail.com" },
    update: {
      tenantId: TENANT_ID,
      siteId: null, // null = tous les sites
      role: Role.TENANT_ADMIN,
      name: "Mohamed Abdi Ali",
      firstName: "Mohamed",
      lastName: "Abdi Ali",
      isActive: true,
    },
    create: {
      tenantId: TENANT_ID,
      siteId: null,
      email: "Mohamed.abdi.pk12@gmail.com",
      password: defaultPassword,
      name: "Mohamed Abdi Ali",
      firstName: "Mohamed",
      lastName: "Abdi Ali",
      role: Role.TENANT_ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ Utilisateur créé: Mohamed Abdi Ali (${mohamed.id})`);

  // Accès tous les sites pour Mohamed (TENANT_ADMIN sur chaque site)
  for (const site of [site1, site2, site3]) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: mohamed.id, siteId: site.id } },
      update: { role: Role.TENANT_ADMIN },
      create: { userId: mohamed.id, siteId: site.id, role: Role.TENANT_ADMIN },
    });
  }
  console.log(`   → Accès: Site 1 (TENANT_ADMIN), Site 2 (TENANT_ADMIN), Site 3 (TENANT_ADMIN)`);

  // 9. Résumé
  console.log("\n📊 Résumé:");
  console.log("===========");
  console.log(`Sites: ${site1.nom} (${site1.id}), ${site2.nom} (${site2.id}), ${site3.nom} (${site3.id})`);
  console.log(`Mouna Mohamed (ahdimounomar@gmail.com) → PRINCIPAL, Site 1 + Site 3`);
  console.log(`Ilyas Aden (Ilyasadendjama@gmail.com) → PRINCIPAL, Site 2`);
  console.log(`Mohamed Abdi Ali (Mohamed.abdi.pk12@gmail.com) → TENANT_ADMIN, tous les sites`);
  console.log(`\n🔑 Mot de passe par défaut pour tous: EcolPro@2026`);
  console.log("✨ Terminé !");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("❌ Erreur:", e);
    prisma.$disconnect();
    process.exit(1);
  });
