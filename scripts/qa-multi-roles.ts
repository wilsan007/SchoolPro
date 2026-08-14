/**
 * Ajoute des rôles secondaires aux comptes QA existants pour tester
 * le multi-rôle dans le même tenant.
 *
 *   npx tsx scripts/qa-multi-roles.ts          → ajoute les rôles secondaires
 *   npx tsx scripts/qa-multi-roles.ts --clean  → les retire
 *
 * Prérequis : `npx tsx scripts/qa-comptes-demo.ts` doit avoir été lancé
 * au préalable pour créer les comptes de base.
 *
 * Scénarios testés :
 *   1. prof (TEACHER)      + PARENT     → enseignant qui est aussi parent
 *   2. parent (PARENT)     + TEACHER    → parent qui est aussi enseignant
 *   3. secretary (SECRETARY) + ACCOUNTANT → secrétaire qui fait aussi la comptabilité
 *   4. principal (PRINCIPAL) + TEACHER  → chef d'établissement qui enseigne encore
 *   5. nurse (NURSE)       + PARENT     → infirmière qui est aussi parent
 */

import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const SUFFIXE = "@qa-learnos.test";

interface RoleSecondaire {
  email: string;
  roleSecondaire: Role;
  description: string;
}

const ROLES_SECONDAIRES: RoleSecondaire[] = [
  {
    email: `prof${SUFFIXE}`,
    roleSecondaire: Role.PARENT,
    description: "Enseignant + Parent (cas classique : prof parent d'un élève de l'école)",
  },
  {
    email: `parent${SUFFIXE}`,
    roleSecondaire: Role.TEACHER,
    description: "Parent + Enseignant (parent qui enseigne aussi dans l'école)",
  },
  {
    email: `secretary${SUFFIXE}`,
    roleSecondaire: Role.ACCOUNTANT,
    description: "Secrétaire + Comptable (deux rôles administratifs)",
  },
  {
    email: `principal${SUFFIXE}`,
    roleSecondaire: Role.TEACHER,
    description: "Chef d'établissement + Enseignant (directeur qui enseigne encore)",
  },
  {
    email: `nurse${SUFFIXE}`,
    roleSecondaire: Role.PARENT,
    description: "Infirmière + Parent (personnel de santé parent d'un élève)",
  },
];

async function nettoyer() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-learnos" } });
  if (!tenant) {
    console.log("Tenant demo-learnos absent — rien à nettoyer.");
    return;
  }

  let count = 0;
  for (const { email, roleSecondaire } of ROLES_SECONDAIRES) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;

    // Supprimer l'entrée UserRole
    const deleted = await prisma.userRole.deleteMany({
      where: { userId: user.id, tenantId: tenant.id, role: roleSecondaire },
    });
    count += deleted.count;

    // Si le rôle secondaire est PARENT et qu'un enregistrement Parent a été
    // créé par ce script, le supprimer seulement s'il n'a pas d'enfants
    // (pour ne pas casser les données de demo-learnos).
    if (roleSecondaire === Role.PARENT) {
      const parent = await prisma.parent.findFirst({
        where: { userId: user.id, tenantId: tenant.id },
        include: { _count: { select: { enfants: true } } },
      });
      if (parent && parent._count.enfants === 0) {
        // Vérifier si ce parent a été créé par nous (email match le pattern QA)
        if (parent.email?.endsWith(SUFFIXE) || parent.nom === "QA") {
          await prisma.parent.delete({ where: { id: parent.id } });
          console.log(`  - Enregistrement Parent supprimé pour ${email}`);
        }
      }
    }

    // Si le rôle secondaire est TEACHER et qu'un enregistrement Enseignant
    // a été créé par ce script, le supprimer s'il n'a pas de cours.
    if (roleSecondaire === Role.TEACHER) {
      const enseignant = await prisma.enseignant.findFirst({
        where: { userId: user.id, tenantId: tenant.id },
        include: { _count: { select: { emploiTemps: true } } },
      });
      if (enseignant && enseignant._count.emploiTemps === 0) {
        // Supprimer seulement si le matricule indique qu'il a été créé par nous
        if (enseignant.matricule?.startsWith("QA-MULTI-")) {
          await prisma.enseignantSite.deleteMany({
            where: { enseignantId: enseignant.id },
          });
          await prisma.enseignant.delete({ where: { id: enseignant.id } });
          console.log(`  - Enregistrement Enseignant supprimé pour ${email}`);
        }
      }
    }
  }

  console.log(`${count} rôle(s) secondaire(s) supprimé(s).`);
}

async function main() {
  if (process.argv.includes("--clean")) return nettoyer();

  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-learnos" } });
  if (!tenant) {
    throw new Error("Tenant demo-learnos absent — lancer d'abord scripts/qa-comptes-demo.ts");
  }

  const site = await prisma.site.findFirst({ where: { tenantId: tenant.id } });
  if (!site) throw new Error("Aucun site sur le tenant demo-learnos");

  console.log(`\nTenant : ${tenant.name} — site ${site.nom}\n`);
  console.log("Ajout de rôles secondaires pour tester le multi-rôle :\n");

  for (const { email, roleSecondaire, description } of ROLES_SECONDAIRES) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.warn(`⚠️  ${email} introuvable — lancer d'abord qa-comptes-demo.ts`);
      continue;
    }

    // Vérifier que l'utilisateur a bien une adhésion active à ce tenant
    const userTenant = await prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    });
    if (!userTenant || !userTenant.isActive) {
      console.warn(`⚠️  ${email} n'a pas d'adhésion active à ${tenant.name}`);
      continue;
    }

    // Vérifier si le rôle secondaire existe déjà dans UserRole
    const existingRole = await prisma.userRole.findUnique({
      where: {
        userId_tenantId_role: {
          userId: user.id,
          tenantId: tenant.id,
          role: roleSecondaire,
        },
      },
    });

    if (existingRole && existingRole.isActive) {
      console.log(`  ✓ ${email} possède déjà le rôle ${roleSecondaire}`);
      continue;
    }

    // Créer ou réactiver l'entrée UserRole
    if (existingRole) {
      await prisma.userRole.update({
        where: { id: existingRole.id },
        data: { isActive: true },
      });
    } else {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: roleSecondaire,
          isActive: true,
        },
      });
    }

    // Créer l'enregistrement métier si nécessaire
    if (roleSecondaire === Role.TEACHER || roleSecondaire === Role.CLASS_TEACHER) {
      const existingEnseignant = await prisma.enseignant.findFirst({
        where: { userId: user.id, tenantId: tenant.id },
      });
      if (!existingEnseignant) {
        const enseignant = await prisma.enseignant.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            matricule: `QA-MULTI-${user.email.split("@")[0].toUpperCase()}`,
            specialite: "Mathématiques",
            typeContrat: "CDI",
            dateEntree: new Date(),
          },
        });
        // Rattacher au site
        await prisma.enseignantSite.upsert({
          where: {
            enseignantId_siteId: { enseignantId: enseignant.id, siteId: site.id },
          },
          update: {},
          create: { enseignantId: enseignant.id, siteId: site.id },
        });
        console.log(`  + Enregistrement Enseignant créé pour ${email}`);
      }
    } else if (roleSecondaire === Role.PARENT) {
      const existingParent = await prisma.parent.findFirst({
        where: { userId: user.id, tenantId: tenant.id },
      });
      if (!existingParent) {
        const [prenom, ...rest] = user.name.split(" ");
        const nom = rest.join(" ") || "QA";
        await prisma.parent.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            nom,
            prenom: prenom || "QA",
            email: user.email,
            phone: "+25377000000",
          },
        });
        console.log(`  + Enregistrement Parent créé pour ${email}`);
      }
    }

    console.log(`  ✓ ${email} : ${userTenant.role} + ${roleSecondaire}`);
    console.log(`    → ${description}\n`);
  }

  // Résumé des comptes multi-rôles
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Comptes multi-rôles créés (tous avec mot de passe Demo@2026!) :\n");

  for (const { email, roleSecondaire } of ROLES_SECONDAIRES) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        userRoles: {
          where: { tenantId: tenant.id, isActive: true },
          select: { role: true },
        },
      },
    });
    if (!user) continue;
    const roles = user.userRoles.map((r) => r.role).join(" + ");
    console.log(`  ${email.padEnd(35)} ${roles}`);
  }

  console.log("\nPour tester : connectez-vous avec un de ces comptes,");
  console.log("le dropdown de switch de rôle apparaîtra dans la sidebar.\n");
  console.log("Nettoyage :  npx tsx scripts/qa-multi-roles.ts --clean\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
