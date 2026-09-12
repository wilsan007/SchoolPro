/**
 * EcolPro — Export FEC (Fichier d'Écritures Comptables)
 * ============================================================
 *
 * Génère les écritures comptables au format FEC (norme française)
 * et SYSCOHADA (norme ouest-africaine) à partir des encaissements.
 *
 * Le FEC est un fichier texte plat (extension .txt) avec des tabulations
 * comme séparateurs, encodé en UTF-8.
 *
 * Référence : arrêté du 29 novembre 2013 (art. A.47 A-1 du LPF)
 */

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ============================================================
// TYPES
// ============================================================

export type NormeComptable = "FEC" | "SYSCOHADA";

export interface EcritureComptable {
  /** Date de l'écriture (YYYY-MM-DD) */
  dateEcriture: string;
  /** Code journal (VT: ventes, BQ: banque, CA: caisse) */
  codeJournal: string;
  /** Numéro de compte (classe 4: clients, 5: caisse/banque, 7: produits) */
  compteNumero: string;
  /** Libellé du compte */
  compteLibelle: string;
  /** Référence de la pièce (numéro de facture) */
  pieceRef: string;
  /** Date de la pièce */
  pieceDate: string;
  /** Libellé de l'écriture */
  ecritureLibelle: string;
  /** Débit (en centimes entiers) */
  debit: number;
  /** Crédit (en centimes entiers) */
  credit: number;
}

export interface ExportFecResult {
  /** Contenu du fichier FEC */
  content: string;
  /** Nombre d'écritures générées */
  ecritureCount: number;
  /** Total débit (centimes) */
  totalDebit: number;
  /** Total crédit (centimes) */
  totalCredit: number;
}

// ============================================================
// CONSTANTES — Plan comptable
// ============================================================

const COMPTES = {
  CLIENTS: "411000",
  CAISSE: "571000",
  BANQUE: "521000",
  PRODUITS_SCOLAIRES: "706000",
  PRODUITS_TRANSPORT: "706100",
  PRODUITS_CANTINE: "706200",
  ESCOMPTE: "665000",
  REMISE_DETTES: "758000",
  DEPRECIATION: "681700",
  TVA_COLLECTEE: "443000",
} as const;

const JOURNAUX = {
  VENTES: "VT",
  BANQUE: "BQ",
  CAISSE: "CA",
  OD: "OD",
} as const;

// ============================================================
// GÉNÉRATION DES ÉCRITURES
// ============================================================

/**
 * Génère les écritures comptables pour les encaissements d'un tenant.
 *
 * Pour chaque paiement :
 * - Débit du compte de trésorerie (Caisse 571000 ou Banque 521000)
 * - Crédit du compte clients (411000) pour le montant encaissé
 */
export async function genererEcrituresEncaissements(
  tenantId: string,
  anneeLibelle?: string
): Promise<EcritureComptable[]> {
  const annee = anneeLibelle ?? (await getAnneeCouranteLibelle(tenantId));
  if (!annee) return [];

  // Récupérer l'année scolaire pour filtrer par anneeId
  const anneeRecord = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: annee },
    select: { id: true },
  });

  // eslint-disable-next-line ecolpro/require-site-filter -- fonction de bibliothèque, site filtré par l'appelant
  const paiements = await prisma.paiement.findMany({
    where: {
      facture: {
        tenantId,
        ...(anneeRecord ? { anneeId: anneeRecord.id } : {}),
      },
    },
    include: {
      facture: {
        select: {
          numero: true,
          eleve: { select: { nom: true, prenom: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const ecritures: EcritureComptable[] = [];

  for (const p of paiements) {
    const dateStr = p.date.toISOString().split("T")[0];
    const montantCentimes = Math.round(p.montant * 100);
    const eleveNom = p.facture.eleve
      ? `${p.facture.eleve.nom} ${p.facture.eleve.prenom}`
      : "Élève inconnu";
    const libelle = `Encaissement facture ${p.facture.numero} - ${eleveNom}`;

    // Compte de trésorerie (Caisse ou Banque selon le mode)
    const estEspece = p.methode.toLowerCase().includes("espèce") || p.methode.toLowerCase().includes("espece");
    const compteTresorerie = estEspece ? COMPTES.CAISSE : COMPTES.BANQUE;
    const journalTresorerie = estEspece ? JOURNAUX.CAISSE : JOURNAUX.BANQUE;

    // Débit : trésorerie
    ecritures.push({
      dateEcriture: dateStr,
      codeJournal: journalTresorerie,
      compteNumero: compteTresorerie,
      compteLibelle: estEspece ? "Caisse" : "Banque",
      pieceRef: p.facture.numero,
      pieceDate: dateStr,
      ecritureLibelle: libelle,
      debit: montantCentimes,
      credit: 0,
    });

    // Crédit : clients
    ecritures.push({
      dateEcriture: dateStr,
      codeJournal: journalTresorerie,
      compteNumero: COMPTES.CLIENTS,
      compteLibelle: "Clients",
      pieceRef: p.facture.numero,
      pieceDate: dateStr,
      ecritureLibelle: libelle,
      debit: 0,
      credit: montantCentimes,
    });
  }

  return ecritures;
}

/**
 * Génère les écritures pour les remises de dette.
 *
 * Pour chaque remise :
 * - Débit du compte 758000 (Produits divers — remises de dettes)
 * - Crédit du compte 411000 (Clients)
 *
 * Note : Le schéma Facture n'a pas de champ `remise` dédié.
 * Les remises de dette sont identifiées par les factures dont le statut
 * est REMISE_DETTES ou via les notes de crédit. Cette fonction est un
 * placeholder qui devra être adapté quand le modèle de remise de dette
 * sera formalisé dans le schéma.
 */
export async function genererEcrituresRemisesDettes(
  _tenantId: string,
  _anneeLibelle?: string
): Promise<EcritureComptable[]> {
  // TODO: Implémenter quand le modèle de remise de dette sera formalisé
  // Le schéma actuel n'a pas de champ `remise` sur Facture.
  return [];
}

// ============================================================
// FORMATAGE FEC
// ============================================================

/**
 * Formate les écritures au format FEC (fichier texte tabulé).
 */
export function formaterFec(ecritures: EcritureComptable[]): string {
  const HEADER = [
    "JournalCode",
    "JournalLib",
    "EcritureNum",
    "EcritureDate",
    "CompteNum",
    "CompteLib",
    "CompAuxNum",
    "CompAuxLib",
    "PieceRef",
    "PieceDate",
    "EcritureLib",
    "Debit",
    "Credit",
    "EcritureLet",
  ].join("\t");

  const lignes = [HEADER];

  for (let i = 0; i < ecritures.length; i++) {
    const e = ecritures[i];
    const journalLib = getJournalLibelle(e.codeJournal);
    const ligne = [
      e.codeJournal,
      journalLib,
      String(i + 1).padStart(6, "0"),
      e.dateEcriture.replace(/-/g, ""),
      e.compteNumero,
      e.compteLibelle,
      "",
      "",
      e.pieceRef,
      e.pieceDate.replace(/-/g, ""),
      e.ecritureLibelle,
      String(e.debit / 100).replace(".", ","),
      String(e.credit / 100).replace(".", ","),
      "",
    ].join("\t");
    lignes.push(ligne);
  }

  return lignes.join("\n");
}

function getJournalLibelle(code: string): string {
  switch (code) {
    case "VT": return "Journal des ventes";
    case "BQ": return "Journal de banque";
    case "CA": return "Journal de caisse";
    case "OD": return "Opérations diverses";
    default: return code;
  }
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

export async function exporterFec(
  tenantId: string,
  anneeLibelle?: string,
  _norme: NormeComptable = "FEC"
): Promise<ExportFecResult> {
  const [encaissements, remises] = await Promise.all([
    genererEcrituresEncaissements(tenantId, anneeLibelle),
    genererEcrituresRemisesDettes(tenantId, anneeLibelle),
  ]);

  const ecritures = [...encaissements, ...remises];
  const content = formaterFec(ecritures);

  const totalDebit = ecritures.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = ecritures.reduce((sum, e) => sum + e.credit, 0);

  return {
    content,
    ecritureCount: ecritures.length,
    totalDebit,
    totalCredit,
  };
}
