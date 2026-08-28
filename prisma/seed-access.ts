import { PrismaClient, PlanType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Création des comptes d'accès...");

  const seedPassword = process.env.SEED_PASSWORD ?? "Demo@2026!";
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  // --- Super Admin (global, non lié à un tenant) ---
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@ecolpro.app" },
    update: {},
    create: {
      email: "superadmin@ecolpro.app",
      password: passwordHash,
      name: "Mariam",
      firstName: "Mariam",
      lastName: "Admin",
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });

  console.log(`✅ Super Admin créé: ${superAdmin.email}`);

  // --- Tenant de démonstration ---
  const tenant = await prisma.tenant.upsert({
    where: { slug: "lycee-demo" },
    update: {},
    create: {
      name: "Lycée de Démonstration EcolPro",
      slug: "lycee-demo",
      plan: PlanType.PRO,
      country: "SN",
      city: "Dakar",
      currentYear: "2025-2026",
      notationMax: 20,
      langue: "fr",
      timezone: "Africa/Dakar",
      currency: "XOF",
      primaryColor: "#16a34a",
    },
  });

  console.log(`✅ Tenant créé: ${tenant.name}`);

  // --- Directeur (TENANT_ADMIN) ---
  const directeur = await prisma.user.upsert({
    where: { email: "admin@lycee-demo.ecolpro.app" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@lycee-demo.ecolpro.app",
      password: passwordHash,
      name: "Ilyas Aden",
      firstName: "Ilyas",
      lastName: "Aden",
      role: Role.TENANT_ADMIN,
      isActive: true,
    },
  });

  console.log(`✅ Directeur créé: ${directeur.email}`);

  // --- UserTenant pour le directeur (obligatoire pour le switcher) ---
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: directeur.id, tenantId: tenant.id } },
    update: {},
    create: {
      userId: directeur.id,
      tenantId: tenant.id,
      role: Role.TENANT_ADMIN,
      isActive: true,
      isDefault: true,
    },
  });

  console.log("✅ UserTenant créé pour le directeur");

  console.log("\n🎉 Comptes d'accès créés avec succès !");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 Super Admin:  superadmin@ecolpro.app");
  console.log("📧 Directeur:    admin@lycee-demo.ecolpro.app");
  console.log("🔑 Mot de passe: Demo@2026!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
