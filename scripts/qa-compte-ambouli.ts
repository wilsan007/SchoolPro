/**
 * Compte QA sur le tenant de démonstration riche (`tenant-ambouli`).
 *
 *   npx tsx scripts/qa-compte-ambouli.ts          → crée / met à jour le compte
 *   npx tsx scripts/qa-compte-ambouli.ts --clean  → le supprime
 *
 * POURQUOI
 * --------
 * `scripts/qa-comptes-demo.ts` pose les comptes QA sur `demo-learnos`, dont le
 * jeu de données est resté sur une année scolaire close : aucune classe de
 * l'année courante, aucun emploi du temps. Les parcours qui dépendent de
 * données réelles (appel par créneau, feuille de présence, bulletins, stats de
 * retards) ne prouvent donc rien là-bas.
 *
 * Ce compte se greffe sur `tenant-ambouli`, le jeu complet (132 classes,
 * 3 697 élèves, 3 411 créneaux d'EDT), et porte le mot de passe QA commun —
 * le compte de démonstration humain (`admin@cite-ambouli.dj`), lui, garde son
 * mot de passe hors du dépôt.
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TENANT_ID = "tenant-ambouli";
const EMAIL = "admin-ambouli@qa-learnos.test";
const MOT_DE_PASSE = "Demo@2026!";

async function main() {
  const clean = process.argv.includes("--clean");

  if (clean) {
    const supprime = await prisma.user.deleteMany({ where: { email: EMAIL } });
    console.log(supprime.count > 0 ? `Supprimé : ${EMAIL}` : `Rien à supprimer (${EMAIL})`);
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`Tenant ${TENANT_ID} introuvable — lancer d'abord les scripts de démo.`);

  const sites = await prisma.site.findMany({ where: { tenantId: TENANT_ID }, select: { id: true, nom: true } });
  if (sites.length === 0) throw new Error(`Aucun site sur ${TENANT_ID}.`);

  const password = await bcrypt.hash(MOT_DE_PASSE, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password, role: Role.TENANT_ADMIN, isActive: true, tenantId: TENANT_ID, siteId: sites[0].id },
    create: {
      email: EMAIL,
      name: "QA Direction Ambouli",
      password,
      role: Role.TENANT_ADMIN,
      isActive: true,
      tenantId: TENANT_ID,
      siteId: sites[0].id,
    },
  });

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: TENANT_ID } },
    update: { role: Role.TENANT_ADMIN, isActive: true, isDefault: true },
    create: { userId: user.id, tenantId: TENANT_ID, role: Role.TENANT_ADMIN, isActive: true, isDefault: true },
  });

  // Les deux sites : sans UserSite, le périmètre de sites est vide et toutes
  // les listes filtrées par site reviennent à zéro ligne.
  for (const site of sites) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: user.id, siteId: site.id } },
      update: { role: Role.TENANT_ADMIN },
      create: { userId: user.id, siteId: site.id, role: Role.TENANT_ADMIN },
    });
  }

  console.log(`Compte QA prêt : ${EMAIL} sur ${tenant.name} (${sites.length} site(s))`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
