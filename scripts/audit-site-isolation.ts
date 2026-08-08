/**
 * Audit de provisionnement de l'isolation par site.
 *
 *   npx tsx scripts/audit-site-isolation.ts
 *
 * À exécuter AVANT de déployer le durcissement de l'isolation. Le filtrage est
 * désormais fail-closed : dans un établissement multi-sites, un compte du
 * personnel sans aucun rattachement de site ne voit plus rien (auparavant, il
 * voyait l'ensemble de l'établissement — c'était précisément la fuite).
 *
 * Ce script liste :
 *   1. les comptes qui perdront l'accès faute de rattachement ;
 *   2. les données non rattachées à un site, visibles depuis tous les sites ;
 *   3. les incohérences : siteId pointant vers un autre établissement.
 *
 * Lecture seule — aucune écriture.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_WIDE_ROLES = ["TENANT_ADMIN", "SUPER_ADMIN"];
const RELATION_SCOPED_ROLES = ["PARENT", "STUDENT"];

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, _count: { select: { sites: true } } },
    orderBy: { name: "asc" },
  });

  let totalBlocked = 0;
  let totalOrphanRefs = 0;

  for (const tenant of tenants) {
    const siteCount = tenant._count.sites;
    const header = `\n=== ${tenant.name} (${tenant.id}) — ${siteCount} site(s) ===`;
    console.log(header);

    if (siteCount === 0) {
      console.log("  Mono-site : l'isolation par site ne s'applique pas.");
      continue;
    }

    const sites = await prisma.site.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, nom: true, actif: true },
    });
    const siteIds = new Set(sites.map((s) => s.id));

    // ---- 1. Comptes qui perdront l'accès --------------------------------
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId: tenant.id }, { userTenants: { some: { tenantId: tenant.id, isActive: true } } }],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        siteId: true,
        userTenants: { where: { tenantId: tenant.id, isActive: true }, select: { role: true } },
        userSites: { where: { site: { tenantId: tenant.id } }, select: { siteId: true } },
        enseignants: {
          where: { tenantId: tenant.id },
          select: { sites: { where: { site: { tenantId: tenant.id } }, select: { siteId: true } } },
        },
      },
    });

    const blocked: { email: string; name: string; role: string }[] = [];
    const badSiteRef: { email: string; siteId: string }[] = [];

    for (const u of users) {
      const effectiveRole = u.userTenants[0]?.role ?? u.role;

      // siteId incohérent : désigne un site d'un autre établissement.
      if (u.siteId && !siteIds.has(u.siteId)) {
        badSiteRef.push({ email: u.email, siteId: u.siteId });
      }

      if (TENANT_WIDE_ROLES.includes(effectiveRole)) continue;
      if (RELATION_SCOPED_ROLES.includes(effectiveRole)) continue;

      const attached =
        u.userSites.length > 0 || u.enseignants.some((e) => e.sites.length > 0);

      if (!attached) {
        blocked.push({ email: u.email, name: u.name, role: effectiveRole });
      }
    }

    if (blocked.length === 0) {
      console.log("  ✓ Tous les comptes du personnel sont rattachés à au moins un site.");
    } else {
      totalBlocked += blocked.length;
      console.log(
        `  ⚠ ${blocked.length} compte(s) sans rattachement de site — ils ne verront plus aucune donnée :`
      );
      for (const b of blocked) {
        console.log(`      ${b.role.padEnd(14)} ${b.email}  (${b.name})`);
      }
      console.log("    → créer une ligne UserSite (ou EnseignantSite) pour chacun.");
    }

    if (badSiteRef.length > 0) {
      totalOrphanRefs += badSiteRef.length;
      console.log(`  ⚠ ${badSiteRef.length} compte(s) avec un siteId hors de cet établissement :`);
      for (const b of badSiteRef) {
        console.log(`      ${b.email} → siteId=${b.siteId}`);
      }
      console.log("    → ces siteId sont désormais ignorés à la connexion (retour sur null).");
    }

    // ---- 2. Données non rattachées à un site ---------------------------
    // `siteId: null` signifie « partagé entre tous les sites » : ces
    // enregistrements restent visibles depuis n'importe quel site.
    const [eleves, classes, factures, examens, notifications, inventaire] = await Promise.all([
      prisma.eleve.count({ where: { tenantId: tenant.id, siteId: null } }),
      prisma.classe.count({ where: { tenantId: tenant.id, siteId: null } }),
      prisma.facture.count({ where: { tenantId: tenant.id, siteId: null } }),
      prisma.examen.count({ where: { tenantId: tenant.id, siteId: null } }),
      prisma.notification.count({ where: { tenantId: tenant.id, siteId: null } }),
      prisma.itemInventaire.count({ where: { tenantId: tenant.id, siteId: null } }),
    ]);

    const shared = { eleves, classes, factures, examens, notifications, inventaire };
    const sharedTotal = Object.values(shared).reduce((a, b) => a + b, 0);

    if (sharedTotal > 0) {
      console.log(`  ℹ ${sharedTotal} enregistrement(s) sans site — visibles depuis TOUS les sites :`);
      for (const [model, count] of Object.entries(shared)) {
        if (count > 0) console.log(`      ${model.padEnd(14)} ${count}`);
      }
      console.log("    → si ce n'est pas voulu, leur affecter un siteId.");
    } else {
      console.log("  ✓ Aucune donnée orpheline de site.");
    }
  }

  console.log("\n---------------------------------------------");
  console.log(`Comptes à rattacher avant déploiement : ${totalBlocked}`);
  console.log(`Références de site incohérentes       : ${totalOrphanRefs}`);
  if (totalBlocked > 0) {
    console.log("\nDéployer en l'état est SANS RISQUE de fuite, mais ces comptes");
    console.log("verront un périmètre vide jusqu'à leur rattachement.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
