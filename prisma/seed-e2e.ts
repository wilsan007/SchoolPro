import { PrismaClient, PlanType, Role, Sexe, StatutEleve, LienParente } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Constantes — toutes les données E2E utilisent des IDs déterministes pour
// garantir l'idempotence via upsert.
// ---------------------------------------------------------------------------

const TENANT_SLUG = "e2e-test";
const SITE_CODE = "SITE-E2E";
const SITE_ID = "site-e2e-01";
const CLASSE_ID = "classe-e2e-6eme-a";
const MATIERE_ID = "mat-e2e-math";
const ANNEE_ID = "annee-e2e-2025-2026";
const PERIODE_ID = "per-e2e-t1";

const PASSWORD = "E2E-Test-2026!";

// Emails déterministes par rôle
const emailFor = (role: string) => `e2e-${role.toLowerCase()}@ecolpro.app`;

async function main() {
  console.log("🌱 Seed E2E — 13 rôles SchoolPro/EcolPro");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // -------------------------------------------------------------------------
  // 1. Tenant de test
  // -------------------------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      name: "Établissement E2E Test",
      slug: TENANT_SLUG,
      plan: PlanType.PRO,
      country: "SN",
      city: "Dakar",
      currentYear: "2025-2026",
      notationMax: 20,
      langue: "fr",
      timezone: "Africa/Dakar",
      currency: "XOF",
      primaryColor: "#2563eb",
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // -------------------------------------------------------------------------
  // 2. Site rattaché au tenant
  // -------------------------------------------------------------------------
  const site = await prisma.site.upsert({
    where: { id: SITE_ID },
    update: { tenantId: tenant.id, nom: "Campus E2E", code: SITE_CODE, actif: true },
    create: {
      id: SITE_ID,
      tenantId: tenant.id,
      nom: "Campus E2E",
      code: SITE_CODE,
      actif: true,
    },
  });
  console.log(`✅ Site: ${site.nom} (${site.id})`);

  // -------------------------------------------------------------------------
  // 3. Année scolaire + période
  // -------------------------------------------------------------------------
  const annee = await prisma.anneesScolaires.upsert({
    where: { id: ANNEE_ID },
    update: {},
    create: {
      id: ANNEE_ID,
      tenantId: tenant.id,
      libelle: "2025-2026",
      dateDebut: new Date("2025-10-01"),
      dateFin: new Date("2026-07-31"),
      isCurrent: true,
    },
  });

  await prisma.periode.upsert({
    where: { id: PERIODE_ID },
    update: {},
    create: {
      id: PERIODE_ID,
      anneeId: annee.id,
      nom: "1er Trimestre",
      numero: 1,
      dateDebut: new Date("2025-10-01"),
      dateFin: new Date("2026-01-10"),
      isCurrent: true,
    },
  });
  console.log("✅ Année scolaire + période");

  // -------------------------------------------------------------------------
  // 4. Matière
  // -------------------------------------------------------------------------
  const matiere = await prisma.matiere.upsert({
    where: { id: MATIERE_ID },
    update: {},
    create: {
      id: MATIERE_ID,
      tenantId: tenant.id,
      siteId: site.id,
      nom: "Mathématiques",
      code: "MATH-E2E",
      coefficient: 5,
      couleur: "#3b82f6",
    },
  });
  console.log(`✅ Matière: ${matiere.nom} (${matiere.id})`);

  // -------------------------------------------------------------------------
  // Helper : créer / récupérer un User par email (upsert)
  // -------------------------------------------------------------------------
  async function upsertUser(opts: {
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId?: string | null;
    siteId?: string | null;
  }) {
    return prisma.user.upsert({
      where: { email: opts.email },
      update: {},
      create: {
        email: opts.email,
        password: passwordHash,
        name: opts.name,
        firstName: opts.firstName,
        lastName: opts.lastName,
        role: opts.role,
        isActive: true,
        tenantId: opts.tenantId ?? null,
        siteId: opts.siteId ?? null,
      },
    });
  }

  // Helper : créer / récupérer un Enseignant lié à un user (pas de contrainte
  // unique sur userId → on utilise findFirst + create).
  async function upsertEnseignant(userId: string, tenantId: string, specialite: string) {
    const existing = await prisma.enseignant.findFirst({
      where: { userId, tenantId },
    });
    if (existing) return existing;
    return prisma.enseignant.create({
      data: { tenantId, userId, specialite, typeContrat: "CDI" },
    });
  }

  // Helper : créer / récupérer un Parent lié à un user.
  async function upsertParent(userId: string, tenantId: string, nom: string, prenom: string, email: string) {
    const existing = await prisma.parent.findFirst({
      where: { userId, tenantId },
    });
    if (existing) return existing;
    return prisma.parent.create({
      data: { tenantId, userId, nom, prenom, email, phone: "+221 77 000 00 00" },
    });
  }

  // Helper : UserTenant (switcher multi-tenant)
  async function linkUserTenant(userId: string, tenantId: string, role: Role) {
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: {},
      create: { userId, tenantId, role, isActive: true, isDefault: true },
    });
  }

  // Helper : UserSite (accès multi-site)
  async function linkUserSite(userId: string, siteId: string, role: Role) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId, siteId } },
      update: {},
      create: { userId, siteId, role },
    });
  }

  // Helper : EnseignantSite
  async function linkEnseignantSite(enseignantId: string, siteId: string) {
    await prisma.enseignantSite.upsert({
      where: { enseignantId_siteId: { enseignantId, siteId } },
      update: {},
      create: { enseignantId, siteId },
    });
  }

  // =========================================================================
  // RÔLE 1 — SUPER_ADMIN (global, pas de tenant)
  // =========================================================================
  const superAdmin = await upsertUser({
    email: emailFor("SUPER_ADMIN"),
    name: "Super Admin E2E",
    firstName: "Super",
    lastName: "Admin",
    role: Role.SUPER_ADMIN,
    tenantId: null,
    siteId: null,
  });
  console.log(`✅ SUPER_ADMIN: ${superAdmin.email}`);

  // =========================================================================
  // RÔLE 2 — TENANT_ADMIN
  // =========================================================================
  const tenantAdmin = await upsertUser({
    email: emailFor("TENANT_ADMIN"),
    name: "Tenant Admin E2E",
    firstName: "Tenant",
    lastName: "Admin",
    role: Role.TENANT_ADMIN,
    tenantId: tenant.id,
    siteId: null, // tous les sites
  });
  await linkUserTenant(tenantAdmin.id, tenant.id, Role.TENANT_ADMIN);
  await linkUserSite(tenantAdmin.id, site.id, Role.TENANT_ADMIN);
  console.log(`✅ TENANT_ADMIN: ${tenantAdmin.email}`);

  // =========================================================================
  // RÔLE 3 — PRINCIPAL
  // =========================================================================
  const principal = await upsertUser({
    email: emailFor("PRINCIPAL"),
    name: "Principal E2E",
    firstName: "Principal",
    lastName: "E2E",
    role: Role.PRINCIPAL,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(principal.id, tenant.id, Role.PRINCIPAL);
  await linkUserSite(principal.id, site.id, Role.PRINCIPAL);
  console.log(`✅ PRINCIPAL: ${principal.email}`);

  // =========================================================================
  // RÔLE 4 — SECRETARY
  // =========================================================================
  const secretary = await upsertUser({
    email: emailFor("SECRETARY"),
    name: "Secrétaire E2E",
    firstName: "Secrétaire",
    lastName: "E2E",
    role: Role.SECRETARY,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(secretary.id, tenant.id, Role.SECRETARY);
  await linkUserSite(secretary.id, site.id, Role.SECRETARY);
  console.log(`✅ SECRETARY: ${secretary.email}`);

  // =========================================================================
  // RÔLE 5 — TEACHER
  // =========================================================================
  const teacher = await upsertUser({
    email: emailFor("TEACHER"),
    name: "Enseignant E2E",
    firstName: "Enseignant",
    lastName: "E2E",
    role: Role.TEACHER,
    tenantId: tenant.id,
    siteId: site.id,
  });
  const teacherEns = await upsertEnseignant(teacher.id, tenant.id, "Mathématiques");
  await linkEnseignantSite(teacherEns.id, site.id);
  await linkUserTenant(teacher.id, tenant.id, Role.TEACHER);
  await linkUserSite(teacher.id, site.id, Role.TEACHER);
  console.log(`✅ TEACHER: ${teacher.email}`);

  // =========================================================================
  // RÔLE 6 — CLASS_TEACHER (professeur principal d'une classe)
  // =========================================================================
  const classTeacher = await upsertUser({
    email: emailFor("CLASS_TEACHER"),
    name: "Prof Principal E2E",
    firstName: "Prof",
    lastName: "Principal",
    role: Role.CLASS_TEACHER,
    tenantId: tenant.id,
    siteId: site.id,
  });
  const classTeacherEns = await upsertEnseignant(classTeacher.id, tenant.id, "Français");
  await linkEnseignantSite(classTeacherEns.id, site.id);
  await linkUserTenant(classTeacher.id, tenant.id, Role.CLASS_TEACHER);
  await linkUserSite(classTeacher.id, site.id, Role.CLASS_TEACHER);

  // Classe avec ce prof principal
  const classe = await prisma.classe.upsert({
    where: { id: CLASSE_ID },
    update: { profPrincipalId: classTeacherEns.id },
    create: {
      id: CLASSE_ID,
      tenantId: tenant.id,
      siteId: site.id,
      nom: "6ème A E2E",
      niveau: "6ème",
      filiere: "Général",
      effectifMax: 40,
      annee: "2025-2026",
      profPrincipalId: classTeacherEns.id,
    },
  });
  console.log(`✅ CLASS_TEACHER: ${classTeacher.email} (classe: ${classe.nom})`);

  // =========================================================================
  // RÔLE 7 — COUNSELOR
  // =========================================================================
  const counselor = await upsertUser({
    email: emailFor("COUNSELOR"),
    name: "Conseiller E2E",
    firstName: "Conseiller",
    lastName: "E2E",
    role: Role.COUNSELOR,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(counselor.id, tenant.id, Role.COUNSELOR);
  await linkUserSite(counselor.id, site.id, Role.COUNSELOR);
  console.log(`✅ COUNSELOR: ${counselor.email}`);

  // =========================================================================
  // RÔLE 8 — NURSE
  // =========================================================================
  const nurse = await upsertUser({
    email: emailFor("NURSE"),
    name: "Infirmier E2E",
    firstName: "Infirmier",
    lastName: "E2E",
    role: Role.NURSE,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(nurse.id, tenant.id, Role.NURSE);
  await linkUserSite(nurse.id, site.id, Role.NURSE);
  console.log(`✅ NURSE: ${nurse.email}`);

  // =========================================================================
  // RÔLE 9 — ACCOUNTANT
  // =========================================================================
  const accountant = await upsertUser({
    email: emailFor("ACCOUNTANT"),
    name: "Comptable E2E",
    firstName: "Comptable",
    lastName: "E2E",
    role: Role.ACCOUNTANT,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(accountant.id, tenant.id, Role.ACCOUNTANT);
  await linkUserSite(accountant.id, site.id, Role.ACCOUNTANT);
  console.log(`✅ ACCOUNTANT: ${accountant.email}`);

  // =========================================================================
  // RÔLE 10 — SUPERVISOR
  // =========================================================================
  const supervisor = await upsertUser({
    email: emailFor("SUPERVISOR"),
    name: "Surveillant E2E",
    firstName: "Surveillant",
    lastName: "E2E",
    role: Role.SUPERVISOR,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(supervisor.id, tenant.id, Role.SUPERVISOR);
  await linkUserSite(supervisor.id, site.id, Role.SUPERVISOR);
  console.log(`✅ SUPERVISOR: ${supervisor.email}`);

  // =========================================================================
  // RÔLE 11 — SUBJECT_LEAD (coordinateur de matière)
  // NB: le modèle Matiere n'a pas de champ coordinateurId ; on crée donc
  // l'enseignant + la matière. Le lien est logique (role SUBJECT_LEAD).
  // =========================================================================
  const subjectLead = await upsertUser({
    email: emailFor("SUBJECT_LEAD"),
    name: "Coord Matière E2E",
    firstName: "Coord",
    lastName: "Matière",
    role: Role.SUBJECT_LEAD,
    tenantId: tenant.id,
    siteId: site.id,
  });
  const subjectLeadEns = await upsertEnseignant(subjectLead.id, tenant.id, "Mathématiques");
  await linkEnseignantSite(subjectLeadEns.id, site.id);
  await linkUserTenant(subjectLead.id, tenant.id, Role.SUBJECT_LEAD);
  await linkUserSite(subjectLead.id, site.id, Role.SUBJECT_LEAD);
  console.log(`✅ SUBJECT_LEAD: ${subjectLead.email}`);

  // =========================================================================
  // Élèves dans la classe (3-5 élèves) — certains seront liés au PARENT et
  // un aura un compte STUDENT.
  // =========================================================================
  const eleveSeed = [
    { nom: "E2E", prenom: "Alice", matricule: "E2E-0001", sexe: Sexe.F, dateNaissance: new Date("2014-03-15") },
    { nom: "E2E", prenom: "Boubacar", matricule: "E2E-0002", sexe: Sexe.M, dateNaissance: new Date("2014-07-22") },
    { nom: "E2E", prenom: "Camara", matricule: "E2E-0003", sexe: Sexe.F, dateNaissance: new Date("2013-11-08") },
    { nom: "E2E", prenom: "Diallo", matricule: "E2E-0004", sexe: Sexe.M, dateNaissance: new Date("2014-01-30") },
    { nom: "E2E", prenom: "Eve", matricule: "E2E-0005", sexe: Sexe.F, dateNaissance: new Date("2014-05-12") },
  ];

  const eleves = await Promise.all(
    eleveSeed.map((e) =>
      prisma.eleve.upsert({
        where: { tenantId_matricule: { tenantId: tenant.id, matricule: e.matricule } },
        update: { siteId: site.id, classeId: classe.id },
        create: {
          tenantId: tenant.id,
          siteId: site.id,
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
  console.log(`✅ ${eleves.length} élèves créés dans ${classe.nom}`);

  // =========================================================================
  // RÔLE 12 — PARENT (lié à 2 élèves)
  // =========================================================================
  const parentUser = await upsertUser({
    email: emailFor("PARENT"),
    name: "Parent E2E",
    firstName: "Parent",
    lastName: "E2E",
    role: Role.PARENT,
    tenantId: tenant.id,
    siteId: site.id,
  });
  const parent = await upsertParent(parentUser.id, tenant.id, "E2E", "Parent", parentUser.email);
  await linkUserTenant(parentUser.id, tenant.id, Role.PARENT);
  await linkUserSite(parentUser.id, site.id, Role.PARENT);

  // Lier le parent aux 2 premiers élèves
  await prisma.eleveParent.upsert({
    where: { eleveId_parentId: { eleveId: eleves[0].id, parentId: parent.id } },
    update: {},
    create: { eleveId: eleves[0].id, parentId: parent.id, lien: LienParente.PERE, isGardien: true },
  });
  await prisma.eleveParent.upsert({
    where: { eleveId_parentId: { eleveId: eleves[1].id, parentId: parent.id } },
    update: {},
    create: { eleveId: eleves[1].id, parentId: parent.id, lien: LienParente.PERE, isGardien: true },
  });
  console.log(`✅ PARENT: ${parentUser.email} (lié à ${eleves[0].prenom} & ${eleves[1].prenom})`);

  // =========================================================================
  // RÔLE 13 — STUDENT (élève avec compte de connexion)
  // =========================================================================
  const studentUser = await upsertUser({
    email: emailFor("STUDENT"),
    name: "Élève E2E",
    firstName: "Élève",
    lastName: "E2E",
    role: Role.STUDENT,
    tenantId: tenant.id,
    siteId: site.id,
  });
  await linkUserTenant(studentUser.id, tenant.id, Role.STUDENT);
  await linkUserSite(studentUser.id, site.id, Role.STUDENT);

  // Lier le compte user au 3ème élève (userId @unique sur Eleve)
  const studentEleve = await prisma.eleve.upsert({
    where: { tenantId_matricule: { tenantId: tenant.id, matricule: "E2E-STUDENT" } },
    update: { userId: studentUser.id, siteId: site.id, classeId: classe.id },
    create: {
      tenantId: tenant.id,
      siteId: site.id,
      matricule: "E2E-STUDENT",
      nom: "E2E",
      prenom: "Student",
      sexe: Sexe.M,
      dateNaissance: new Date("2014-09-01"),
      classeId: classe.id,
      statut: StatutEleve.ACTIF,
      regime: "externe",
      nationalite: "SN",
      anneeInscription: "2025-2026",
      userId: studentUser.id,
    },
  });
  console.log(`✅ STUDENT: ${studentUser.email} (élève: ${studentEleve.prenom} ${studentEleve.nom})`);

  // -------------------------------------------------------------------------
  // Résumé
  // -------------------------------------------------------------------------
  console.log("\n🎉 Seed E2E terminé avec succès !");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 Comptes (tous avec mot de passe: E2E-Test-2026!) :");
  console.log("   superadmin   → e2e-super_admin@ecolpro.app");
  console.log("   tenant_admin → e2e-tenant_admin@ecolpro.app");
  console.log("   principal    → e2e-principal@ecolpro.app");
  console.log("   secretary    → e2e-secretary@ecolpro.app");
  console.log("   teacher      → e2e-teacher@ecolpro.app");
  console.log("   class_teacher→ e2e-class_teacher@ecolpro.app");
  console.log("   counselor    → e2e-counselor@ecolpro.app");
  console.log("   nurse        → e2e-nurse@ecolpro.app");
  console.log("   accountant   → e2e-accountant@ecolpro.app");
  console.log("   supervisor   → e2e-supervisor@ecolpro.app");
  console.log("   subject_lead → e2e-subject_lead@ecolpro.app");
  console.log("   parent       → e2e-parent@ecolpro.app");
  console.log("   student      → e2e-student@ecolpro.app");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed E2E:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
