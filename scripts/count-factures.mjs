import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const t0 = Date.now();
const count = await p.facture.count({ where: { tenantId: "tenant-ambouli" } });
const t1 = Date.now();
const withPaiements = await p.facture.findMany({
  where: { tenantId: "tenant-ambouli" },
  select: { _count: { select: { paiements: true } } },
});
const totalPaiements = withPaiements.reduce((s, f) => s + f._count.paiements, 0);
const t2 = Date.now();
console.log(`Factures: ${count} (${t1-t0}ms)`);
console.log(`Total paiements: ${totalPaiements} (${t2-t1}ms)`);
await p.$disconnect();
