import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Helpers pour le module d'inscription du secrétariat.
 * Opère sur le modèle Candidature étendu (dossier d'inscription formel).
 */

export type TypeDoc = "PHOTO" | "ACTE_NAISSANCE" | "PIECE_PARENT" | "BULLETIN_SCOLAIRE";

export const TYPES_DOC: TypeDoc[] = [
  "PHOTO",
  "ACTE_NAISSANCE",
  "PIECE_PARENT",
  "BULLETIN_SCOLAIRE",
];

export interface PieceDoc {
  url: string;
  nom: string;
  taille: number;
  mimeType: string;
  ajouteLe: string; // ISO
  ajouteParId?: string;
}

export type DocumentsInscription = Partial<Record<TypeDoc, PieceDoc>>;

/**
 * Vérifie quelles pièces obligatoires manquent parmi les 4 types requis.
 */
export function piecesManquantes(docs: DocumentsInscription | null): TypeDoc[] {
  if (!docs) return [...TYPES_DOC];
  return TYPES_DOC.filter((t) => !docs[t]);
}

/**
 * Détermine le statut du dossier à partir des pièces présentes :
 *  - INCOMPLET : au moins une pièce obligatoire manque
 *  - COMPLETE  : les 4 pièces sont présentes (le passage à VALIDE/CLOS
 *                reste une décision manuelle de la direction)
 */
export function statutSelonPieces(docs: DocumentsInscription | null): "INCOMPLET" | "COMPLETE" {
  return piecesManquantes(docs).length === 0 ? "COMPLETE" : "INCOMPLET";
}

/**
 * Ajoute une entrée d'historique d'audit sur un dossier d'inscription.
 * Non-bloquante : un échec de log ne doit pas faire échouer l'action.
 */
export async function logInscription(
  tx: Prisma.TransactionClient | typeof prisma,
  params: {
    tenantId: string;
    candidatureId: string;
    type: string;
    description: string;
    auteurId?: string | null;
    auteurNom?: string | null;
    donnees?: Prisma.InputJsonValue;
  }
): Promise<void> {
  try {
    await tx.inscriptionHistorique.create({
      data: {
        tenantId: params.tenantId,
        candidatureId: params.candidatureId,
        type: params.type as never,
        description: params.description,
        auteurId: params.auteurId ?? null,
        auteurNom: params.auteurNom ?? null,
        donnees: params.donnees ?? undefined,
      },
    });
  } catch (e) {
    console.error("[logInscription] échec (non-bloquant):", e);
  }
}
