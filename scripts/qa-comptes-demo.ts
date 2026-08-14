/**
 * Comptes de connexion pour le QA manuel des espaces LEARNOS et E2E Playwright.
 *
 *   npx tsx scripts/qa-comptes-demo.ts          → crée / met à jour les comptes
 *   npx tsx scripts/qa-comptes-demo.ts --clean  → les supprime
 *
 * Les comptes se greffent sur le jeu de démonstration existant
 * (`scripts/demo-learnos.ts`) : même tenant, même site, même classe — sinon les
 * espaces `/direction`, `/mon-espace`, `/ma-classe`, `/parent` et `/eleve`
 * s'ouvriraient sur des écrans vides et ne prouveraient rien.
 *
 * Les 13 rôles du système sont couverts : les 5 originaux (admin, prof, pp,
 * parent, eleve) plus les 8 rôles ajoutés (principal, secretary, counselor,
 * nurse, accountant, supervisor, subject_lead, super_admin).
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MOT_DE_PASSE = "Demo@2026!";
const SUFFIXE = "@qa-learnos.test";

/**
 * Comptes élèves dont `tests/e2e/entrainement.spec.ts` dépend : leur
 * rattachement à un élève ne doit pas être repris par ce script.
 */
const PROTEGES = ["amina@demo-learnos.test", "kadidja@demo-learnos.test"];

const COMPTES = [
  { cle: "admin", email: `admin${SUFFIXE}`, name: "QA Direction", role: Role.TENANT_ADMIN },
  { cle: "prof", email: `prof${SUFFIXE}`, name: "QA Enseignant", role: Role.TEACHER },
  { cle: "pp", email: `pp${SUFFIXE}`, name: "QA Prof Principal", role: Role.CLASS_TEACHER },
  { cle: "parent", email: `parent${SUFFIXE}`, name: "QA Parent", role: Role.PARENT },
  { cle: "eleve", email: `eleve${SUFFIXE}`, name: "QA Élève", role: Role.STUDENT },
  // ── Rôles additionnels pour couvrir les 15 espaces dédiés ──
  { cle: "principal", email: `principal${SUFFIXE}`, name: "QA Principal", role: Role.PRINCIPAL },
  { cle: "secretary", email: `secretary${SUFFIXE}`, name: "QA Secrétariat", role: Role.SECRETARY },
  { cle: "counselor", email: `counselor${SUFFIXE}`, name: "QA Conseiller", role: Role.COUNSELOR },
  { cle: "nurse", email: `nurse${SUFFIXE}`, name: "QA Infirmerie", role: Role.NURSE },
  { cle: "accountant", email: `accountant${SUFFIXE}`, name: "QA Comptabilité", role: Role.ACCOUNTANT },
  { cle: "supervisor", email: `supervisor${SUFFIXE}`, name: "QA Surveillant", role: Role.SUPERVISOR },
  { cle: "subject_lead", email: `subject_lead${SUFFIXE}`, name: "QA Coordinateur", role: Role.SUBJECT_LEAD },
  { cle: "site_manager", email: `site_manager${SUFFIXE}`, name: "QA Exploitation", role: Role.SITE_MANAGER },
  { cle: "inspector", email: `inspector${SUFFIXE}`, name: "QA Inspecteur", role: Role.INSPECTOR },
  // SUPER_ADMIN n'a pas de tenant : il est créé sans rattachement.
  { cle: "super_admin", email: `super_admin${SUFFIXE}`, name: "QA Super Admin", role: Role.SUPER_ADMIN },
] as const;

async function nettoyer() {
  const emails = COMPTES.map((c) => c.email);
  // Le lien élève ↔ compte est en SetNull : on le retire explicitement pour que
  // l'élève de démonstration retrouve son état d'origine.
  await prisma.eleve.updateMany({
    where: { user: { email: { in: emails } } },
    data: { userId: null },
  });
  await prisma.parent.deleteMany({ where: { user: { email: { in: emails } } } });
  const { count } = await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`${count} compte(s) QA supprimé(s).`);
}

async function main() {
  if (process.argv.includes("--clean")) return nettoyer();

  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-learnos" } });
  if (!tenant) throw new Error("Tenant demo-learnos absent — lancer d'abord scripts/demo-learnos.ts");

  const site = await prisma.site.findFirst({ where: { tenantId: tenant.id } });
  if (!site) throw new Error("Aucun site sur le tenant demo-learnos");

  const classe = await prisma.classe.findFirst({ where: { tenantId: tenant.id } });
  if (!classe) throw new Error("Aucune classe sur le tenant demo-learnos");

  // Un élève NON RATTACHÉ en priorité.
  //
  // POURQUOI
  // --------
  // `Eleve.userId` est une relation 1–1 : un seul compte par élève. Ce script
  // prenait le premier élève par matricule, soit toujours `DEMO-el1` — Amina,
  // précisément l'élève que `demo-learnos.ts --eleves` rattache à
  // `amina@demo-learnos.test`. Chaque passage volait donc le lien, en silence,
  // et `tests/e2e/entrainement.spec.ts` tombait ensuite en 404
  // (`ELEVE_INTROUVABLE`) parce qu'`eleveDeSeance()` ne retrouvait plus l'élève
  // depuis le compte d'Amina. Le test accusait l'application ; la cause était ici.
  const eleve =
    (await prisma.eleve.findFirst({
      where: { tenantId: tenant.id, classeId: classe.id, userId: null },
      orderBy: { matricule: "asc" },
    })) ??
    // Repli : tous rattachés. On évite alors ceux dont le compte sert aux tests
    // de bout en bout, sous peine de les casser à nouveau.
    (await prisma.eleve.findFirst({
      where: {
        tenantId: tenant.id,
        classeId: classe.id,
        user: { email: { notIn: PROTEGES } },
      },
      orderBy: { matricule: "asc" },
    }));

  if (!eleve) {
    throw new Error(
      "Aucun élève disponible : tous sont rattachés à un compte servant aux tests " +
        "de bout en bout. Ajoutez un élève à la classe de démonstration, ou " +
        "libérez-en un (`npx tsx scripts/qa-comptes-demo.ts --clean`)."
    );
  }

  // Le rattachement qui suit déplace le compte d'un élève : on le dit.
  const ancien = eleve.userId
    ? await prisma.user.findUnique({ where: { id: eleve.userId }, select: { email: true } })
    : null;
  if (ancien) {
    console.warn(
      `⚠️  ${eleve.prenom} ${eleve.nom} (${eleve.matricule}) était rattaché à ` +
        `${ancien.email} — ce compte perd son élève.`
    );
  }

  const password = await bcrypt.hash(MOT_DE_PASSE, 12);
  const creees: Record<string, string> = {};

  for (const compte of COMPTES) {
    // SUPER_ADMIN n'a pas de tenant : compte plateforme global.
    const isSuperAdmin = compte.role === Role.SUPER_ADMIN;
    const userTenantId = isSuperAdmin ? null : tenant.id;
    const userSiteId = isSuperAdmin ? null : site.id;

    const user = await prisma.user.upsert({
      where: { email: compte.email },
      update: { password, role: compte.role, isActive: true, tenantId: userTenantId, siteId: userSiteId },
      create: {
        email: compte.email,
        name: compte.name,
        password,
        role: compte.role,
        isActive: true,
        tenantId: userTenantId,
        siteId: userSiteId,
      },
    });
    creees[compte.cle] = user.id;

    // Pas de UserTenant / UserSite pour SUPER_ADMIN.
    if (isSuperAdmin) continue;

    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { role: compte.role, isActive: true, isDefault: true },
      create: { userId: user.id, tenantId: tenant.id, role: compte.role, isActive: true, isDefault: true },
    });

    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: user.id, siteId: site.id } },
      update: { role: compte.role },
      create: { userId: user.id, siteId: site.id, role: compte.role },
    });
  }

  // ── Enseignants ────────────────────────────────────────────────
  // `deriveClaims` agrège aussi `EnseignantSite` : sans cette ligne un
  // enseignant se connecte avec un périmètre de sites vide.
  // SUBJECT_LEAD est aussi un enseignant (coordinateur de matière).
  for (const cle of ["prof", "pp", "subject_lead"] as const) {
    const userId = creees[cle];
    const existant = await prisma.enseignant.findFirst({ where: { userId, tenantId: tenant.id } });
    const enseignant =
      existant ??
      (await prisma.enseignant.create({
        data: {
          tenantId: tenant.id,
          userId,
          matricule: `QA-${cle.toUpperCase()}`,
          specialite: "Mathématiques",
          typeContrat: "CDI",
        },
      }));

    await prisma.enseignantSite.upsert({
      where: { enseignantId_siteId: { enseignantId: enseignant.id, siteId: site.id } },
      update: {},
      create: { enseignantId: enseignant.id, siteId: site.id },
    });

    if (cle === "pp") {
      await prisma.classe.update({
        where: { id: classe.id },
        data: { profPrincipalId: enseignant.id },
      });
    }
  }

  // ── Parent ─────────────────────────────────────────────────────
  const parentExistant = await prisma.parent.findFirst({
    where: { userId: creees.parent, tenantId: tenant.id },
  });
  const parent =
    parentExistant ??
    (await prisma.parent.create({
      data: {
        tenantId: tenant.id,
        userId: creees.parent,
        nom: "QA",
        prenom: "Parent",
        email: `parent${SUFFIXE}`,
        phone: "+25377000000",
      },
    }));

  await prisma.eleveParent.upsert({
    where: { eleveId_parentId: { eleveId: eleve.id, parentId: parent.id } },
    update: { isGardien: true },
    create: { eleveId: eleve.id, parentId: parent.id, isGardien: true },
  });

  // ── Élève ──────────────────────────────────────────────────────
  await prisma.eleve.update({
    where: { id: eleve.id },
    data: { userId: creees.eleve },
  });

  console.log(`\nTenant : ${tenant.name} — site ${site.nom} — classe ${classe.nom}`);
  console.log(`Élève rattaché aux comptes parent/élève : ${eleve.prenom} ${eleve.nom} (${eleve.matricule})\n`);
  for (const c of COMPTES) console.log(`  ${c.role.padEnd(13)} ${c.email}`);
  console.log(`\nMot de passe commun : ${MOT_DE_PASSE}`);
  console.log("Suppression :  npx tsx scripts/qa-comptes-demo.ts --clean\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
