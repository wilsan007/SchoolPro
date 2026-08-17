/**
 * seed-ambouli-facturation.ts — Factures, échéanciers, paiements, relances, exclusions.
 * 2 ans × 2 sites. Répartition réaliste : ~70% payées, ~20% en retard, ~10% en attente.
 */

import { PrismaClient, StatutFacture } from "@prisma/client";
import { setSeed, randInt, pick, chance, dateStr, addMonths } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";

const METHODES_PAIEMENT = ["espèces", "cac_pay", "dahab_plus", "saba_pay", "faida", "virement"];
const CANAUX_RELANCE = ["sms", "whatsapp", "email", "courrier"];

export async function seedFacturation(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<void> {
  setSeed(20241101);
  console.log("🌱 [5/12] Création de la facturation, paiements, relances, exclusions...");

  let factureCount = 0;
  let paiementCount = 0;
  let relanceCount = 0;
  let echeancierCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    const accountantId = users.accountants[site];

    for (const annee of ["2024-2025", "2025-2026"]) {
      const key = `${site}-${annee}`;
      const siteClasses = classes.classesBySiteYear[key] || [];

      // Collecter tous les élèves du site pour cette année
      const allEleves: { id: string; niveau: string }[] = [];
      for (const cls of siteClasses) {
        const els = classes.elevesByClass[cls.id] || [];
        for (const e of els) allEleves.push({ id: e.id, niveau: cls.niveau });
      }

      const isLycee = (niveau: string) => ["2nde", "1ère", "Terminale"].includes(niveau);
      const anneeDeb = parseInt(annee.split("-")[0]);

      for (const el of allEleves) {
        const niveauType = isLycee(el.niveau) ? "lycee" : "coll";
        const tarifKey = `${niveauType === "lycee" ? "lycee" : "coll"}-${site}-${annee}`;
        const tarifId = ref.tarifs[tarifKey];
        const tarif = await prisma.tarifNiveau.findUnique({ where: { id: tarifId } });
        if (!tarif) continue;

        // Facture de scolarité (annuelle, avec échéancier)
        const montantTotal = tarif.mensualite * tarif.nbMois + tarif.fraisInscription;
        const numeroFact = `FAC-${site.toUpperCase()}-${annee.replace(/-/g, "")}-${String(factureCount + 1).padStart(5, "0")}`;

        // Statut : 70% payée, 20% en retard, 10% en attente
        const statutRoll = chance(0.7) ? StatutFacture.PAYEE : chance(0.66) ? StatutFacture.EN_RETARD : StatutFacture.EN_ATTENTE;
        const statut = statutRoll as StatutFacture;

        const facture = await prisma.facture.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            eleveId: el.id,
            numero: numeroFact,
            libelle: `Scolarité ${annee}`,
            montant: montantTotal,
            devise: "DJF",
            statut,
            echeance: dateStr(anneeDeb, 10, 15),
            createdById: accountantId,
          },
        });
        factureCount++;

        // Échéancier (10 mensualités)
        const echeancier = await prisma.echeancier.create({
          data: {
            factureId: facture.id,
            nbEcheances: 10,
            intervalleJours: 30,
            datePremiereEcheance: dateStr(anneeDeb, 10, 5),
            statut: statut === StatutFacture.PAYEE ? "COMPLETE" : "ACTIF",
          },
        });
        echeancierCount++;

        // 10 échéances
        for (let i = 0; i < 10; i++) {
          const dateEch = addMonths(dateStr(anneeDeb, 10, 5), i);
          const echeanceStatut = statut === StatutFacture.PAYEE ? "PAYEE"
            : i < 7 ? "PAYEE"
            : i === 7 && statut === StatutFacture.EN_RETARD ? "EN_RETARD"
            : "EN_ATTENTE";

          let paiementId: string | undefined;
          let payeeLe: Date | undefined;

          if (echeanceStatut === "PAYEE") {
            const paiement = await prisma.paiement.create({
              data: {
                factureId: facture.id,
                montant: tarif.mensualite,
                devise: "DJF",
                methode: pick(METHODES_PAIEMENT),
                reference: `PAY-${numeroFact}-${i + 1}`,
                date: dateEch,
                enregistreParId: accountantId,
              },
            });
            paiementCount++;
            paiementId = paiement.id;
            payeeLe = dateEch;
          }

          await prisma.echeancePaiement.create({
            data: {
              echeancierId: echeancier.id,
              factureId: facture.id,
              numero: i + 1,
              montant: tarif.mensualite,
              devise: "DJF",
              dateEcheance: dateEch,
              statut: echeanceStatut,
              paiementId,
              payeeLe,
            },
          });
        }

        // Facture de cantine (optionnelle, ~40% des élèves)
        if (chance(0.4) && tarif.fraisCantine) {
          const montantCantine = tarif.fraisCantine * 10;
          const facCantine = await prisma.facture.create({
            data: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              eleveId: el.id,
              numero: `FAC-CANT-${site.toUpperCase()}-${annee.replace(/-/g, "")}-${String(factureCount + 1).padStart(5, "0")}`,
              libelle: `Cantine ${annee}`,
              montant: montantCantine,
              devise: "DJF",
              statut: chance(0.8) ? StatutFacture.PAYEE : StatutFacture.EN_ATTENTE,
              echeance: dateStr(anneeDeb, 11, 1),
              createdById: accountantId,
            },
          });
          factureCount++;
          if (facCantine.statut === StatutFacture.PAYEE) {
            await prisma.paiement.create({
              data: {
                factureId: facCantine.id,
                montant: montantCantine,
                devise: "DJF",
                methode: pick(METHODES_PAIEMENT),
                reference: `PAY-${facCantine.numero}`,
                date: dateStr(anneeDeb, 11, 10),
                enregistreParId: accountantId,
              },
            });
            paiementCount++;
          }
        }

        // Relances pour factures en retard
        if (statut === StatutFacture.EN_RETARD) {
          const nbRelances = randInt(1, 3);
          for (let r = 0; r < nbRelances; r++) {
            await prisma.relance.create({
              data: {
                tenantId: ref.tenantId,
                factureId: facture.id,
                niveau: r + 1,
                canal: pick(CANAUX_RELANCE),
                message: `Relance niveau ${r + 1} : votre facture ${numeroFact} est en retard de paiement. Merci de régulariser dans les plus brefs délais.`,
                envoyeeParId: accountantId,
                envoyeeLe: addMonths(dateStr(anneeDeb, 10, 15), 2 + r),
              },
            });
            relanceCount++;
          }
        }
      }
    }
  }

  // Exclusions pour non-paiement (2-3 cas)
  for (const site of ["ambouli", "arhiba"] as const) {
    const key = `${site}-2025-2026`;
    const siteClasses = classes.classesBySiteYear[key] || [];
    const allEleves: string[] = [];
    for (const cls of siteClasses) {
      for (const e of classes.elevesByClass[cls.id] || []) allEleves.push(e.id);
    }
    const exclusions = allEleves.slice(0, 3);
    for (const eleveId of exclusions) {
      await prisma.exclusionEleve.create({
        data: {
          tenantId: ref.tenantId,
          eleveId,
          motif: "NON_PAIEMENT_REPETE",
          details: "Factures impayées malgré 3 relances",
          dateDebut: dateStr(2025, 11, 15),
          dateFin: dateStr(2025, 12, 1),
          decideeParId: users.principals[`${site}-coll`],
        },
      });
    }
  }

  console.log(`  ✅ Factures: ${factureCount}`);
  console.log(`  ✅ Échéanciers: ${echeancierCount} (10 échéances chacun)`);
  console.log(`  ✅ Paiements: ${paiementCount}`);
  console.log(`  ✅ Relances: ${relanceCount}`);
  console.log(`  ✅ Exclusions: 6 (3 par site)`);
}
