/**
 * Remplit `Eleve.identiteKey` pour les fiches existantes.
 *
 * À exécuter AVANT d'activer la contrainte `@@unique([tenantId, identiteKey])`,
 * sinon la contrainte échoue au premier doublon rencontré.
 *
 * Règles appliquées :
 *   • fiche archivée (`deletedAt` non nul) → `identiteKey` reste NULL, ce qui
 *     libère la place : PostgreSQL considère les NULL comme distincts ;
 *   • homonyme légitime (même nom, prénom ET date qu'une fiche déjà traitée)
 *     → suffixe « #2 », « #3 »… pour ne pas bloquer une inscription réelle ;
 *   • fiche sans date de naissance exploitable → NULL, faute de clé fiable.
 *
 *   npx tsx scripts/backfill-identite.ts            → simulation
 *   npx tsx scripts/backfill-identite.ts --execute  → écriture
 */
import { PrismaClient } from "@prisma/client";
import { identityKey } from "../src/lib/eleve-identity";

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let total = 0;
  let homonymes = 0;

  for (const tenant of tenants) {
    const eleves = await prisma.eleve.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true, nom: true, prenom: true, dateNaissance: true, matricule: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (eleves.length === 0) continue;

    const prises = new Map<string, string>();
    const aEcrire: { id: string; cle: string }[] = [];

    for (const e of eleves) {
      const base = identityKey(e);
      // Clé incomplète (date absente) : on n'invente rien.
      if (base.endsWith("|")) continue;

      let cle = base;
      let rang = 1;
      while (prises.has(cle)) {
        rang++;
        cle = `${base}#${rang}`;
        homonymes++;
        console.log(`  homonyme : ${e.prenom} ${e.nom} (${e.matricule}) → suffixe #${rang}`);
      }
      prises.set(cle, e.id);
      aEcrire.push({ id: e.id, cle });
    }

    console.log(`${tenant.name} : ${aEcrire.length}/${eleves.length} fiches à clefer`);
    total += aEcrire.length;

    if (!EXECUTE) continue;

    for (let i = 0; i < aEcrire.length; i += 50) {
      await Promise.all(
        aEcrire.slice(i, i + 50).map((x) =>
          prisma.eleve.update({ where: { id: x.id }, data: { identiteKey: x.cle } })
        )
      );
    }
  }

  console.log(
    `\n${EXECUTE ? "ÉCRIT" : "SIMULATION"} : ${total} clés${EXECUTE ? "" : " seraient écrites"}, ${homonymes} homonyme(s) suffixé(s).`
  );
  if (!EXECUTE) console.log("Relancer avec --execute pour appliquer.");
}

main().finally(() => prisma.$disconnect());
