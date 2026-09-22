import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const tenantId = "tenant-ambouli";
const annee = "2026-2027";

console.log("=== Génération des AffectationEnseignant manquantes pour", annee, "===");

// Récupérer tous les créneaux EDT uniques (enseignantId, classeId, matiereId) pour 2026-2027
const edtEntries = await prisma.emploiTemps.findMany({
  where: { tenantId, annee, enseignantId: { not: null } },
  select: { enseignantId: true, classeId: true, matiereId: true },
  distinct: ["enseignantId", "classeId", "matiereId"],
});

console.log(`EDT: ${edtEntries.length} combinaisons uniques (enseignant, classe, matière)`);

let created = 0;
let skipped = 0;

for (const edt of edtEntries) {
  if (!edt.enseignantId) continue;
  
  // Vérifier si l'affectation existe déjà
  const existing = await prisma.affectationEnseignant.findFirst({
    where: {
      enseignantId: edt.enseignantId,
      classeId: edt.classeId,
      matiereId: edt.matiereId,
    },
  });
  
  if (!existing) {
    await prisma.affectationEnseignant.create({
      data: {
        tenantId,
        enseignantId: edt.enseignantId,
        classeId: edt.classeId,
        matiereId: edt.matiereId,
      },
    });
    created++;
  } else {
    skipped++;
  }
}

console.log(`✓ ${created} affectations créées, ${skipped} existaient déjà`);

// Vérification
const total = await prisma.affectationEnseignant.count({
  where: { tenantId, classe: { annee } },
});
console.log(`Total affectations pour ${annee}: ${total}`);

await prisma.$disconnect();
