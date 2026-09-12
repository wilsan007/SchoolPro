/**
 * EcolPro — Rapprochement Automatique des Relevés Bancaires / Mobile Money
 * ============================================================
 *
 * Parse les exports CSV/Excel des banques locales (BCIMR, CAC Bank) et
 * des opérateurs Mobile Money (Waafi, D-Money) pour pointer automatiquement
 * les paiements en attente.
 *
 * Stratégie de rapprochement :
 * 1. Montant exact (en centimes entiers)
 * 2. Date ± 3 jours
 * 3. Référence client (si présente dans le libellé)
 */

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ============================================================
// TYPES
// ============================================================

export type SourceReleve = "BCIMR" | "CAC_BANK" | "WAAFI" | "D_MONEY" | "AUTRE";

export interface LigneReleve {
  date: Date;
  montantCentimes: number;
  libelle: string;
  reference?: string;
  telephone?: string;
}

export interface ResultatRapprochement {
  rapproches: { paiementId: string; ligneReleveIndex: number; montant: number }[];
  nonTrouves: { ligneReleveIndex: number; montant: number; libelle: string }[];
  paiementsOrphelins: { paiementId: string; montant: number; date: Date }[];
  totalRapproche: number;
  totalNonTrouve: number;
  totalOrphelin: number;
}

// ============================================================
// PARSERS CSV
// ============================================================

export function parseCsvBcimr(csvContent: string): LigneReleve[] {
  const lignes = csvContent.split("\n").filter((l) => l.trim().length > 0);
  const result: LigneReleve[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i].split(";");
    if (cols.length < 4) continue;

    const dateStr = cols[0].trim();
    const libelle = cols[1].trim();
    const debitStr = cols[2].trim().replace(/\s/g, "").replace(",", ".");
    const creditStr = cols[3].trim().replace(/\s/g, "").replace(",", ".");

    const credit = parseFloat(creditStr) || 0;
    const debit = parseFloat(debitStr) || 0;
    const montant = credit - debit;

    if (montant <= 0) continue;

    const date = parseDateFr(dateStr);
    if (!date) continue;

    result.push({
      date,
      montantCentimes: Math.round(montant * 100),
      libelle,
    });
  }

  return result;
}

export function parseCsvCacBank(csvContent: string): LigneReleve[] {
  const lignes = csvContent.split("\n").filter((l) => l.trim().length > 0);
  const result: LigneReleve[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const cols = parseCsvLine(lignes[i]);
    if (cols.length < 3) continue;

    const dateStr = cols[0].trim();
    const libelle = cols[1].trim();
    const montantStr = cols[2].trim().replace(",", ".");

    const montant = parseFloat(montantStr) || 0;
    if (montant <= 0) continue;

    const date = parseDateFr(dateStr);
    if (!date) continue;

    result.push({
      date,
      montantCentimes: Math.round(montant * 100),
      libelle,
    });
  }

  return result;
}

export function parseCsvWaafi(csvContent: string): LigneReleve[] {
  const lignes = csvContent.split("\n").filter((l) => l.trim().length > 0);
  const result: LigneReleve[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const cols = parseCsvLine(lignes[i]);
    if (cols.length < 4) continue;

    const reference = cols[0].trim();
    const dateStr = cols[1].trim();
    const montantStr = cols[2].trim().replace(",", ".");
    const telephone = cols[3].trim();
    const libelle = cols[4]?.trim() ?? "Waafi";

    const montant = parseFloat(montantStr) || 0;
    if (montant <= 0) continue;

    const date = parseDateFr(dateStr);
    if (!date) continue;

    result.push({
      date,
      montantCentimes: Math.round(montant * 100),
      libelle,
      reference,
      telephone,
    });
  }

  return result;
}

export function parseCsvDMoney(csvContent: string): LigneReleve[] {
  const lignes = csvContent.split("\n").filter((l) => l.trim().length > 0);
  const result: LigneReleve[] = [];

  for (let i = 1; i < lignes.length; i++) {
    const cols = parseCsvLine(lignes[i]);
    if (cols.length < 3) continue;

    const dateStr = cols[0].trim();
    const reference = cols[1].trim();
    const montantStr = cols[2].trim().replace(",", ".");
    const telephone = cols[3]?.trim();
    const libelle = cols[4]?.trim() ?? "D-Money";

    const montant = parseFloat(montantStr) || 0;
    if (montant <= 0) continue;

    const date = parseDateFr(dateStr);
    if (!date) continue;

    result.push({
      date,
      montantCentimes: Math.round(montant * 100),
      libelle,
      reference,
      telephone,
    });
  }

  return result;
}

// ============================================================
// RAPPROCHEMENT
// ============================================================

const TOLERANCE_JOURS = 3;

/**
 * Tente de rapprocher les lignes d'un relevé avec les paiements en attente.
 *
 * Note : Le schéma Paiement n'a pas de champ `rapproche`.
 * Le rapprochement est donc effectué en mémoire et les résultats
 * sont retournés pour traitement ultérieur (marquage en base via
 * un champ dédié à ajouter dans une migration additive future).
 */
export async function rapprocher(
  tenantId: string,
  lignesReleve: LigneReleve[],
  anneeLibelle?: string
): Promise<ResultatRapprochement> {
  const annee = anneeLibelle ?? (await getAnneeCouranteLibelle(tenantId));
  if (!annee) {
    return {
      rapproches: [],
      nonTrouves: [],
      paiementsOrphelins: [],
      totalRapproche: 0,
      totalNonTrouve: 0,
      totalOrphelin: 0,
    };
  }

  const anneeRecord = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: annee },
    select: { id: true },
  });

  // Récupérer les paiements de l'année
  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const paiements = await prisma.paiement.findMany({
    where: {
      facture: {
        tenantId,
        ...(anneeRecord ? { anneeId: anneeRecord.id } : {}),
      },
    },
    include: {
      facture: { select: { numero: true, eleve: { select: { nom: true, prenom: true } } } },
    },
    orderBy: { date: "asc" },
  });

  const rapproches: ResultatRapprochement["rapproches"] = [];
  const nonTrouves: ResultatRapprochement["nonTrouves"] = [];
  const paiementsUtilises = new Set<string>();

  for (let i = 0; i < lignesReleve.length; i++) {
    const ligne = lignesReleve[i];
    let trouve = false;

    for (const p of paiements) {
      if (paiementsUtilises.has(p.id)) continue;

      const montantPaiementCentimes = Math.round(p.montant * 100);

      // 1. Montant exact
      if (montantPaiementCentimes !== ligne.montantCentimes) continue;

      // 2. Date ± TOLERANCE_JOURS
      const diffJours = Math.abs(
        (p.date.getTime() - ligne.date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffJours > TOLERANCE_JOURS) continue;

      // 3. Référence (si présente dans le libellé)
      if (ligne.reference || ligne.libelle) {
        const refMatch =
          !ligne.reference ||
          p.facture.numero.includes(ligne.reference) ||
          (ligne.libelle && ligne.libelle.includes(p.facture.numero));
        if (!refMatch && ligne.reference) continue;
      }

      rapproches.push({
        paiementId: p.id,
        ligneReleveIndex: i,
        montant: p.montant,
      });
      paiementsUtilises.add(p.id);
      trouve = true;
      break;
    }

    if (!trouve) {
      nonTrouves.push({
        ligneReleveIndex: i,
        montant: ligne.montantCentimes / 100,
        libelle: ligne.libelle,
      });
    }
  }

  const paiementsOrphelins = paiements
    .filter((p) => !paiementsUtilises.has(p.id))
    .map((p) => ({
      paiementId: p.id,
      montant: p.montant,
      date: p.date,
    }));

  return {
    rapproches,
    nonTrouves,
    paiementsOrphelins,
    totalRapproche: rapproches.length,
    totalNonTrouve: nonTrouves.length,
    totalOrphelin: paiementsOrphelins.length,
  };
}

/**
 * Marque les paiements rapprochés comme pointés en base.
 *
 * Note : Le champ `rapproche` n'existe pas encore sur le modèle Paiement.
 * Cette fonction est un placeholder qui devra être activé après l'ajout
 * du champ via une migration additive.
 */
export async function validerRapprochement(
  _tenantId: string,
  _paiementIds: string[]
): Promise<void> {
  // TODO: Activer après migration additive ajoutant le champ `rapproche` sur Paiement
  // await prisma.paiement.updateMany({
  //   where: { id: { in: paiementIds }, facture: { tenantId } },
  //   data: { rapproche: true },
  // });
}

// ============================================================
// UTILITAIRES
// ============================================================

function parseDateFr(dateStr: string): Date | null {
  const parts = dateStr.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (parts) {
    const [, d, m, y] = parts;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  const iso = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
