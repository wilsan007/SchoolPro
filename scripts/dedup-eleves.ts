/**
 * Dédoublonnage des fiches élèves — archivage réversible.
 *
 * Les réimports successifs d'un même fichier Excel ont créé plusieurs fiches
 * pour un même élève (l'import ne dédoublonne que sur le matricule, et en
 * génère un nouveau quand le fichier n'en fournit pas — voir
 * src/app/api/import/eleves/route.ts).
 *
 * Ce script applique exactement la même opération que la suppression depuis
 * l'interface (`deleteEleve`) : soft delete. Rien n'est effacé, tout est
 * restaurable via `restoreEleve`.
 *
 *   npx tsx scripts/dedup-eleves.ts            → simulation (aucune écriture)
 *   npx tsx scripts/dedup-eleves.ts --execute  → archivage effectif
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

/** Identité d'un élève : ce sur quoi l'import aurait dû dédoublonner. */
const identite = (e: { nom: string; prenom: string; dateNaissance: Date }) =>
  `${e.nom.trim().toLowerCase()}|${e.prenom.trim().toLowerCase()}|${e.dateNaissance
    .toISOString()
    .slice(0, 10)}`;

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalArchive = 0;

  for (const tenant of tenants) {
    const eleves = await prisma.eleve.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        dateNaissance: true,
        createdAt: true,
        classe: { select: { nom: true } },
        _count: {
          select: { notes: true, absences: true, factures: true, bulletins: true, parents: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const groupes = new Map<string, typeof eleves>();
    for (const e of eleves) {
      const k = identite(e);
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k)!.push(e);
    }

    const doublons = [...groupes.values()].filter((v) => v.length > 1);
    if (doublons.length === 0) continue;

    console.log(`\n=== ${tenant.name} ===`);

    /** Richesse en données liées : on ne sacrifie jamais la fiche la mieux remplie. */
    const donnees = (e: (typeof eleves)[0]) =>
      e._count.notes + e._count.absences + e._count.factures + e._count.bulletins + e._count.parents;

    const aArchiver: { id: string; matricule: string; nom: string; prenom: string; garde: string }[] = [];

    for (const fiches of doublons) {
      const trie = [...fiches].sort(
        (a, b) => donnees(b) - donnees(a) || +a.createdAt - +b.createdAt
      );
      const garder = trie[0];

      for (const e of trie.slice(1)) {
        // Garde-fou : ne jamais archiver une fiche porteuse de données.
        if (donnees(e) > 0) {
          console.log(`  ⚠ IGNORÉ ${e.matricule} (${e.prenom} ${e.nom}) — porte des données liées`);
          continue;
        }
        aArchiver.push({
          id: e.id,
          matricule: e.matricule,
          nom: e.nom,
          prenom: e.prenom,
          garde: garder.matricule,
        });
      }

      console.log(
        `  ${garder.prenom} ${garder.nom} — conserve ${garder.matricule} (${garder.classe?.nom ?? "—"}), archive ${trie.length - 1}`
      );
    }

    if (!EXECUTE) {
      console.log(`  → SIMULATION : ${aArchiver.length} fiches seraient archivées`);
      totalArchive += aArchiver.length;
      continue;
    }

    // Archivage : mêmes champs que `deleteEleve`.
    const now = new Date();
    for (let i = 0; i < aArchiver.length; i += 50) {
      const lot = aArchiver.slice(i, i + 50);
      await prisma.eleve.updateMany({
        where: { id: { in: lot.map((e) => e.id) } },
        data: { deletedAt: now, statut: "ABANDONNE", userId: null },
      });
    }

    await prisma.auditLog.createMany({
      data: aArchiver.map((e) => ({
        tenantId: tenant.id,
        userId: null,
        action: "eleve.delete",
        verdict: "ALLOWED" as const,
        resource: "eleve",
        resourceId: e.id,
        reason: `Dédoublonnage : fiche en double de ${e.garde}`,
        metadata: { nom: e.nom, prenom: e.prenom, matricule: e.matricule, conservee: e.garde },
      })),
    });

    console.log(`  → ${aArchiver.length} fiches archivées, ${aArchiver.length} entrées d'audit écrites`);
    totalArchive += aArchiver.length;

    const restant = await prisma.eleve.count({ where: { tenantId: tenant.id, deletedAt: null } });
    console.log(`  → effectif après nettoyage : ${restant}`);
  }

  console.log(
    `\n${EXECUTE ? "ARCHIVÉ" : "SIMULATION"} : ${totalArchive} fiches${EXECUTE ? "" : " seraient archivées"}.`
  );
  if (!EXECUTE) console.log("Relancer avec --execute pour appliquer.");
}

main().finally(() => prisma.$disconnect());
