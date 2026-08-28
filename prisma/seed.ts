import { PrismaClient, PlanType, Role, Sexe, StatutEleve } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding EcolPro database...");

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

  // --- Utilisateurs ---
  // Mot de passe de seed : utiliser SEED_PASSWORD env var en production,
  // fallback sur une valeur de démonstration pour le dev local uniquement.
  const seedPassword = process.env.SEED_PASSWORD ?? "Demo@2026!";
  if (!process.env.SEED_PASSWORD && process.env.NODE_ENV === "production") {
    console.warn("⚠️  SEED_PASSWORD non configuré — mot de passe de démonstration utilisé en production !");
  }
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@lycee-demo.ecolpro.app" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@lycee-demo.ecolpro.app",
      password: passwordHash,
      name: "Mamadou Diallo",
      firstName: "Mamadou",
      lastName: "Diallo",
      role: Role.TENANT_ADMIN,
    },
  });

  const enseignantUser = await prisma.user.upsert({
    where: { email: "enseignant@lycee-demo.ecolpro.app" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "enseignant@lycee-demo.ecolpro.app",
      password: passwordHash,
      name: "Fatou Ndiaye",
      firstName: "Fatou",
      lastName: "Ndiaye",
      role: Role.TEACHER,
    },
  });

  const parentUser = await prisma.user.upsert({
    where: { email: "parent@lycee-demo.ecolpro.app" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "parent@lycee-demo.ecolpro.app",
      password: passwordHash,
      name: "Oumar Sow",
      firstName: "Oumar",
      lastName: "Sow",
      role: Role.PARENT,
    },
  });

  console.log("✅ Utilisateurs créés");

  // --- Enseignant ---
  const existingEnseignant = await prisma.enseignant.findFirst({
    where: { userId: enseignantUser.id, tenantId: tenant.id },
  });
  const enseignant = existingEnseignant ?? await prisma.enseignant.create({
      data: {
        tenantId: tenant.id,
        userId: enseignantUser.id,
        specialite: "Mathématiques",
        typeContrat: "CDI",
      },
  });

  // --- Matières ---
  const matieres = await Promise.all([
    prisma.matiere.upsert({
      where: { id: "mat-math-demo" },
      update: {},
      create: {
        id: "mat-math-demo",
        tenantId: tenant.id,
        nom: "Mathématiques",
        code: "MATH",
        coefficient: 5,
        couleur: "#3b82f6",
      },
    }),
    prisma.matiere.upsert({
      where: { id: "mat-fr-demo" },
      update: {},
      create: {
        id: "mat-fr-demo",
        tenantId: tenant.id,
        nom: "Français",
        code: "FR",
        coefficient: 4,
        couleur: "#ef4444",
      },
    }),
    prisma.matiere.upsert({
      where: { id: "mat-ang-demo" },
      update: {},
      create: {
        id: "mat-ang-demo",
        tenantId: tenant.id,
        nom: "Anglais",
        code: "ANG",
        coefficient: 3,
        couleur: "#f59e0b",
      },
    }),
    prisma.matiere.upsert({
      where: { id: "mat-sci-demo" },
      update: {},
      create: {
        id: "mat-sci-demo",
        tenantId: tenant.id,
        nom: "Sciences Physiques",
        code: "SCI",
        coefficient: 4,
        couleur: "#8b5cf6",
      },
    }),
    prisma.matiere.upsert({
      where: { id: "mat-svt-demo" },
      update: {},
      create: {
        id: "mat-svt-demo",
        tenantId: tenant.id,
        nom: "SVT",
        code: "SVT",
        coefficient: 3,
        couleur: "#10b981",
      },
    }),
    prisma.matiere.upsert({
      where: { id: "mat-hist-demo" },
      update: {},
      create: {
        id: "mat-hist-demo",
        tenantId: tenant.id,
        nom: "Histoire-Géographie",
        code: "HIST",
        coefficient: 3,
        couleur: "#f97316",
      },
    }),
  ]);

  console.log("✅ Matières créées");

  // --- Années & Périodes ---
  const annee = await prisma.anneesScolaires.upsert({
    where: { id: "annee-2025-2026-demo" },
    update: {},
    create: {
      id: "annee-2025-2026-demo",
      tenantId: tenant.id,
      libelle: "2025-2026",
      dateDebut: new Date("2025-10-01"),
      dateFin: new Date("2026-07-31"),
      isCurrent: true,
    },
  });

  const periodes = await Promise.all([
    prisma.periode.upsert({
      where: { id: "per-t1-demo" },
      update: {},
      create: {
        id: "per-t1-demo",
        anneeId: annee.id,
        nom: "1er Trimestre",
        numero: 1,
        dateDebut: new Date("2025-10-01"),
        dateFin: new Date("2026-01-10"),
        isCurrent: false,
      },
    }),
    prisma.periode.upsert({
      where: { id: "per-t2-demo" },
      update: {},
      create: {
        id: "per-t2-demo",
        anneeId: annee.id,
        nom: "2ème Trimestre",
        numero: 2,
        dateDebut: new Date("2026-01-12"),
        dateFin: new Date("2026-04-10"),
        isCurrent: true,
      },
    }),
    prisma.periode.upsert({
      where: { id: "per-t3-demo" },
      update: {},
      create: {
        id: "per-t3-demo",
        anneeId: annee.id,
        nom: "3ème Trimestre",
        numero: 3,
        dateDebut: new Date("2026-04-20"),
        dateFin: new Date("2026-07-15"),
        isCurrent: false,
      },
    }),
  ]);

  console.log("✅ Périodes créées");

  // --- Classes ---
  const classe = await prisma.classe.upsert({
    where: { id: "classe-tle-a-demo" },
    update: {},
    create: {
      id: "classe-tle-a-demo",
      tenantId: tenant.id,
      nom: "Terminale A1",
      niveau: "Terminale",
      filiere: "Littéraire",
      effectifMax: 40,
      annee: "2025-2026",
      profPrincipalId: enseignant.id,
    },
  });

  console.log("✅ Classe créée");

  // --- Parent ---
  const existingParent = await prisma.parent.findFirst({
    where: { userId: parentUser.id, tenantId: tenant.id },
  });
  const parent = existingParent ?? await prisma.parent.create({
    data: {
      tenantId: tenant.id,
      userId: parentUser.id,
      nom: "Sow",
      prenom: "Oumar",
      email: "parent@lycee-demo.ecolpro.app",
      phone: "+221 77 123 45 67",
      profession: "Commerçant",
    },
  });

  // --- Élèves ---
  const eleveData = [
    { nom: "Sow", prenom: "Aminata", matricule: "2026-0001", sexe: Sexe.F, dateNaissance: new Date("2007-03-15") },
    { nom: "Diop", prenom: "Ibrahima", matricule: "2026-0002", sexe: Sexe.M, dateNaissance: new Date("2007-07-22") },
    { nom: "Fall", prenom: "Mariama", matricule: "2026-0003", sexe: Sexe.F, dateNaissance: new Date("2006-11-08") },
    { nom: "Ba", prenom: "Ousmane", matricule: "2026-0004", sexe: Sexe.M, dateNaissance: new Date("2007-01-30") },
    { nom: "Camara", prenom: "Aissatou", matricule: "2026-0005", sexe: Sexe.F, dateNaissance: new Date("2007-05-12") },
    { nom: "Ndiaye", prenom: "Moussa", matricule: "2026-0006", sexe: Sexe.M, dateNaissance: new Date("2006-09-18") },
    { nom: "Mbaye", prenom: "Rokhaya", matricule: "2026-0007", sexe: Sexe.F, dateNaissance: new Date("2007-02-25") },
    { nom: "Diouf", prenom: "Serigne", matricule: "2026-0008", sexe: Sexe.M, dateNaissance: new Date("2007-08-04") },
    { nom: "Gueye", prenom: "Ndéye", matricule: "2026-0009", sexe: Sexe.F, dateNaissance: new Date("2006-12-19") },
    { nom: "Toure", prenom: "Lamine", matricule: "2026-0010", sexe: Sexe.M, dateNaissance: new Date("2007-04-07") },
  ];

  const eleves = await Promise.all(
    eleveData.map((e) =>
      prisma.eleve.upsert({
        where: { tenantId_matricule: { tenantId: tenant.id, matricule: e.matricule } },
        update: {},
        create: {
          tenantId: tenant.id,
          ...e,
          classeId: classe.id,
          statut: StatutEleve.ACTIF,
          regime: "externe",
          nationalite: "SN",
          anneeInscription: "2025-2026",
        },
      })
    )
  );

  // Lier le premier élève au parent de démo
  await prisma.eleveParent.upsert({
    where: { eleveId_parentId: { eleveId: eleves[0].id, parentId: parent.id } },
    update: {},
    create: {
      eleveId: eleves[0].id,
      parentId: parent.id,
      lien: "PERE",
      isGardien: true,
    },
  });

  console.log(`✅ ${eleves.length} élèves créés`);

  console.log("\n🎉 Seed terminé avec succès !");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 Admin:       admin@lycee-demo.ecolpro.app");
  console.log("📧 Enseignant:  enseignant@lycee-demo.ecolpro.app");
  console.log("📧 Parent:      parent@lycee-demo.ecolpro.app");
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
