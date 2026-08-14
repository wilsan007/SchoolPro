/**
 * Comptes de connexion pour le QA manuel des espaces LEARNOS.
 *
 *   npx tsx scripts/qa-comptes-demo.ts          → crée / met à jour les comptes
 *   npx tsx scripts/qa-comptes-demo.ts --clean  → les supprime
 *
 * Les comptes se greffent sur le jeu de démonstration existant
 * (`scripts/demo-learnos.ts`) : même tenant, même site, même classe — sinon les
 * espaces `/direction`, `/mon-espace`, `/ma-classe`, `/parent` et `/eleve`
 * s'ouvriraient sur des écrans vides et ne prouveraient rien.
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MOT_DE_PASSE = "Demo@2026!";
const SUFFIXE = "@qa-learnos.test";

const COMPTES = [
  { cle: "admin", email: `admin${SUFFIXE}`, name: "QA Direction", role: Role.TENANT_ADMIN },
  { cle: "prof", email: `prof${SUFFIXE}`, name: "QA Enseignant", role: Role.TEACHER },
  { cle: "pp", email: `pp${SUFFIXE}`, name: "QA Prof Principal", role: Role.CLASS_TEACHER },
  { cle: "parent", email: `parent${SUFFIXE}`, name: "QA Parent", role: Role.PARENT },
  { cle: "eleve", email: `eleve${SUFFIXE}`, name: "QA Élève", role: Role.STUDENT },
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

  const eleve = await prisma.eleve.findFirst({
    where: { tenantId: tenant.id, classeId: classe.id },
    orderBy: { matricule: "asc" },
  });
  if (!eleve) throw new Error("Aucun élève dans la classe de démonstration");

  const password = await bcrypt.hash(MOT_DE_PASSE, 12);
  const creees: Record<string, string> = {};

  for (const compte of COMPTES) {
    const user = await prisma.user.upsert({
      where: { email: compte.email },
      update: { password, role: compte.role, isActive: true, tenantId: tenant.id, siteId: site.id },
      create: {
        email: compte.email,
        name: compte.name,
        password,
        role: compte.role,
        isActive: true,
        tenantId: tenant.id,
        siteId: site.id,
      },
    });
    creees[compte.cle] = user.id;

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
  for (const cle of ["prof", "pp"] as const) {
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
