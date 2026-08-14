import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage : source .env && npx tsx scripts/diagnostic-sites.ts <email-utilisateur>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      userSites: {
        include: { site: { select: { id: true, nom: true, code: true } } },
      },
      enseignants: {
        include: {
          sites: {
            include: { site: { select: { id: true, nom: true, code: true } } },
          },
        },
      },
      tenant: { select: { name: true } },
    },
  });

  if (!user) {
    console.error(`Utilisateur ${email} introuvable.`);
    process.exit(1);
  }

  console.log("== Utilisateur ==");
  console.log(`  id       : ${user.id}`);
  console.log(`  nom      : ${user.name}`);
  console.log(`  email    : ${user.email}`);
  console.log(`  role     : ${user.role}`);
  console.log(`  tenantId : ${user.tenantId ?? "(aucun)"} (${user.tenant?.name ?? "?"})`);
  console.log(`  user.siteId (site en session) : ${user.siteId ?? "null (tous les sites)"}`);

  console.log("\n== Sites autorises (userSites) ==");
  if (user.userSites.length === 0) {
    console.log("  (aucun)");
  } else {
    for (const us of user.userSites) {
      console.log(`  - ${us.siteId} | ${us.site.nom} ${us.site.code ? `(${us.site.code})` : ""} (role: ${us.role ?? "hérité"})`);
    }
  }

  const enseignant = user.enseignants[0];
  if (enseignant) {
    console.log("\n== Sites enseignant (enseignantSites) ==");
    if (enseignant.sites.length === 0) {
      console.log("  (aucun)");
    } else {
      for (const es of enseignant.sites) {
        console.log(`  - ${es.siteId} | ${es.site.nom} ${es.site.code ? `(${es.site.code})` : ""}`);
      }
    }
  }

  if (!user.tenantId) {
    console.log("\nPas de tenant associe, arret.");
    return;
  }

  const [eleves, classes, sites] = await Promise.all([
    prisma.eleve.groupBy({
      by: ["siteId"],
      where: { tenantId: user.tenantId, deletedAt: null },
      _count: true,
    }),
    prisma.classe.groupBy({
      by: ["siteId"],
      where: { tenantId: user.tenantId },
      _count: true,
    }),
    prisma.site.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, nom: true, code: true },
    }),
  ]);

  const siteMap = new Map(sites.map((s) => [s.id, `${s.nom}${s.code ? ` (${s.code})` : ""}`]));

  console.log("\n== Elèves par siteId (tenant) ==");
  for (const e of eleves) {
    const nom = e.siteId ? siteMap.get(e.siteId) ?? "Site inconnu" : "Sans site";
    console.log(`  ${e.siteId ?? "null"} | ${nom} : ${e._count}`);
  }

  console.log("\n== Classes par siteId (tenant) ==");
  for (const c of classes) {
    const nom = c.siteId ? siteMap.get(c.siteId) ?? "Site inconnu" : "Sans site";
    console.log(`  ${c.siteId ?? "null"} | ${nom} : ${c._count}`);
  }

  console.log("\n== Nombre total ==");
  console.log(`  eleves  : ${eleves.reduce((a, b) => a + b._count, 0)}`);
  console.log(`  classes : ${classes.reduce((a, b) => a + b._count, 0)}`);
  console.log(`  sites   : ${sites.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
