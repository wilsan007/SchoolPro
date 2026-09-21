/**
 * Démo Ambouli — étape 7 : la facturation vivante de 2026-2027.
 *
 * DEUX DÉFAUTS À CORRIGER
 *
 * 1. Une seule facture par élève, échéance au 30 septembre. Or l'horizon de
 *    démonstration borne les factures sur leur ÉCHÉANCE (cf. `demo-horizon`) :
 *    avant le 30 septembre, aucune famille ne voyait de facture, aucun
 *    comptable n'avait de recouvrement à montrer, et l'écran « mes factures »
 *    du parent était vide à la date réelle comme au 16 août. L'échéance des
 *    frais d'inscription est ramenée au 10 août — ce qu'un établissement
 *    demande réellement : payer avant la rentrée.
 *
 * 2. Aucune mensualité. Une école vit de ses mensualités, pas d'un versement
 *    unique : sans elles, les écrans de caisse, de relance et de trésorerie
 *    n'évoluent pas d'une date à l'autre de la Time Machine. On émet donc les
 *    mensualités d'octobre, novembre et décembre, au tarif du niveau, avec
 *    leurs encaissements et leurs impayés.
 *
 * DÉTERMINISTE ET IDEMPOTENT.
 *
 *   pnpm exec tsx scripts/demo/07-facturation-2026.ts [--dry-run]
 */

import { Prisma, PrismaClient, TypeFacture, StatutFacture } from "@prisma/client";
import { setSeed, pick, chance, randInt } from "../../prisma/seed-ambouli-helpers";
import { insererEnMasse, type Ligne } from "./_ecriture-massive";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");
const TENANT = "tenant-ambouli";
const ANNEE = "2026-2027";

/** Mois facturés du 1er trimestre, avec leur échéance. */
const MENSUALITES = [
  { mois: "10", libelle: "Scolarité octobre 2026", echeance: new Date(2026, 9, 5), emission: new Date(2026, 8, 28) },
  { mois: "11", libelle: "Scolarité novembre 2026", echeance: new Date(2026, 10, 5), emission: new Date(2026, 9, 28) },
  { mois: "12", libelle: "Scolarité décembre 2026", echeance: new Date(2026, 11, 5), emission: new Date(2026, 10, 27) },
];

const METHODES = ["espèces", "waffi", "cac_pay", "dahab_plus", "saba_pay", "virement"];

/** Le niveau tarifaire d'une classe — collège ou lycée. */
function niveauTarifaire(niveau: string): string {
  return ["2nde", "1ere", "Terminale"].includes(niveau) ? "Lycée" : "Collège";
}

async function ecrireParLots<T>(libelle: string, lignes: T[], ecrire: (lot: T[]) => Promise<{ count: number }>) {
  if (lignes.length === 0) return console.log(`${libelle} : rien à écrire`);
  if (DRY) return console.log(`[simulation] ${libelle} : ${lignes.length} ligne(s)`);
  let n = 0;
  for (let i = 0; i < lignes.length; i += 500) {
    const { count } = await ecrire(lignes.slice(i, i + 500));
    n += count;
  }
  console.log(`${libelle} : ${n} écrite(s) sur ${lignes.length} proposée(s)`);
}

async function main() {
  if (DRY) console.log("=== SIMULATION — aucune écriture ===");
  setSeed(20260810);

  const annee = await prisma.anneesScolaires.findFirst({ where: { tenantId: TENANT, libelle: ANNEE }, select: { id: true } });
  if (!annee) throw new Error(`Année ${ANNEE} introuvable`);

  // --- 1. L'échéance des frais d'inscription ------------------------------
  const echeanceInscription = new Date(2026, 7, 10);
  if (!DRY) {
    const { count } = await prisma.facture.updateMany({
      where: { tenantId: TENANT, anneeId: annee.id, mois: null, echeance: { gt: echeanceInscription } },
      data: { echeance: echeanceInscription },
    });
    console.log(`frais d'inscription : ${count} facture(s) ramenée(s) au 10 août 2026`);
  }

  // --- 2. Les mensualités du trimestre ------------------------------------
  const tarifs = await prisma.tarifNiveau.findMany({
    where: { tenantId: TENANT, annee: ANNEE },
    select: { siteId: true, niveau: true, mensualite: true },
  });
  const tarifDe = new Map(tarifs.map((t) => [`${t.siteId}|${t.niveau}`, t.mensualite]));

  const eleves = await prisma.eleve.findMany({
    where: { tenantId: TENANT, classe: { annee: ANNEE }, deletedAt: null },
    select: { id: true, siteId: true, matricule: true, classe: { select: { niveau: true } } },
  });

  const comptables = (
    await prisma.user.findMany({ where: { tenantId: TENANT, role: { in: ["ACCOUNTANT", "CAISSIER"] } }, select: { id: true } })
  ).map((u) => u.id);

  const factures: Prisma.FactureCreateManyInput[] = [];
  const paiements: Prisma.PaiementCreateManyInput[] = [];
  const relances: Prisma.RelanceCreateManyInput[] = [];

  for (const e of eleves) {
    const montant = tarifDe.get(`${e.siteId}|${niveauTarifaire(e.classe?.niveau ?? "")}`) ?? 18000;

    for (const m of MENSUALITES) {
      const factureId = `fact-2026-${m.mois}-${e.id}`;
      // Le taux de règlement se dégrade au fil du trimestre : c'est ce que
      // vit une école, et c'est ce qui rend l'écran de recouvrement lisible
      // d'une date à l'autre.
      const tauxReglement = m.mois === "10" ? 0.82 : m.mois === "11" ? 0.7 : 0.55;
      const paye = chance(tauxReglement);

      factures.push({
        id: factureId,
        tenantId: TENANT,
        siteId: e.siteId,
        eleveId: e.id,
        anneeId: annee.id,
        numero: `F-${m.mois}26-${e.matricule.slice(-4)}`,
        libelle: m.libelle,
        montant,
        devise: "DJF",
        statut: paye ? StatutFacture.PAYEE : StatutFacture.EN_ATTENTE,
        echeance: m.echeance,
        mois: m.mois,
        type: TypeFacture.MENSUALITE,
        createdById: comptables.length ? pick(comptables) : null,
        createdAt: m.emission,
      });

      if (paye) {
        const date = new Date(m.echeance);
        date.setDate(date.getDate() - randInt(0, 12));
        date.setHours(randInt(8, 16), 0, 0, 0);
        paiements.push({
          id: `pay-2026-${m.mois}-${e.id}`,
          factureId,
          montant,
          devise: "DJF",
          methode: pick(METHODES),
          reference: `REC-${m.mois}26-${e.matricule.slice(-4)}`,
          date,
          dateSaisie: date,
          enregistreParId: comptables.length ? pick(comptables) : null,
        });
        continue;
      }

      // Impayé : la relance part quinze jours après l'échéance, puis un mois.
      const niveaux = chance(0.4) ? 2 : 1;
      for (let n = 1; n <= niveaux; n++) {
        const envoi = new Date(m.echeance);
        envoi.setDate(envoi.getDate() + n * 15);
        relances.push({
          id: `rel-2026-${m.mois}-${e.id}-${n}`,
          tenantId: TENANT,
          factureId,
          niveau: n,
          canal: n === 1 ? "sms" : "whatsapp",
          message:
            n === 1
              ? `Rappel : ${m.libelle} reste due.`
              : `Deuxième relance : ${m.libelle} demeure impayée, merci de régulariser.`,
          envoyeeParId: comptables.length ? pick(comptables) : null,
          envoyeeLe: envoi,
        });
      }
    }
  }

  if (DRY) {
    console.log(`[simulation] mensualités : ${factures.length}`);
    console.log(`[simulation] encaissements : ${paiements.length}`);
    console.log(`[simulation] relances : ${relances.length}`);
  } else {
    const maintenant = new Date();
    await insererEnMasse("factures",
      ["id", "tenantId", "siteId", "eleveId", "anneeId", "numero", "libelle", "montant", "devise", "statut", "echeance", "mois", "type", "createdById", "createdAt", "updatedAt"],
      factures.map((f) => ({ ...f, updatedAt: maintenant })) as unknown as Ligne[], { libelle: "mensualités" });

    await insererEnMasse("paiements",
      ["id", "factureId", "montant", "devise", "methode", "reference", "date", "dateSaisie", "enregistreParId"],
      paiements as unknown as Ligne[], { libelle: "encaissements" });

    await insererEnMasse("relances",
      ["id", "tenantId", "factureId", "niveau", "canal", "message", "envoyeeParId", "envoyeeLe"],
      relances as unknown as Ligne[], { libelle: "relances" });
  }

  // Les mensualités impayées dont l'échéance est passée basculent « en
  // retard » : sans cela, l'indicateur d'impayés reste à zéro alors que les
  // relances partent.
  if (!DRY) {
    for (const m of MENSUALITES) {
      const { count } = await prisma.facture.updateMany({
        where: { tenantId: TENANT, anneeId: annee.id, mois: m.mois, statut: StatutFacture.EN_ATTENTE },
        data: { statut: StatutFacture.EN_RETARD },
      });
      if (count) console.log(`mensualité ${m.mois} : ${count} facture(s) en retard`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
