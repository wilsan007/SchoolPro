/**
 * Pièces justificatives requises pour l'admission.
 *
 * 3 pièces OBLIGATOIRES : acte_naissance, photo_identite, carte_identite_parent
 * 2 pièces OPTIONNELLES : bulletin_precedent, certificat_transfert
 */

export interface PieceJustificative {
  id: string;
  nom: string;
  obligatoire: boolean;
}

export const PIECES_OBLIGATOIRES: PieceJustificative[] = [
  { id: "acte_naissance", nom: "Acte de naissance", obligatoire: true },
  { id: "photo_identite", nom: "Photo d'identité", obligatoire: true },
  { id: "carte_identite_parent", nom: "Carte d'identité du parent", obligatoire: true },
];

export const PIECES_OPTIONNELLES: PieceJustificative[] = [
  { id: "bulletin_precedent", nom: "Bulletin scolaire précédent", obligatoire: false },
  { id: "certificat_transfert", nom: "Certificat de transfert", obligatoire: false },
];

export const TOUTES_LES_PIECES: PieceJustificative[] = [
  ...PIECES_OBLIGATOIRES,
  ...PIECES_OPTIONNELLES,
];

export interface DocumentInscription {
  type: string;
  url: string;
  nom?: string;
  taille?: number;
  ajouteLe?: string;
  ajouteParId?: string;
}

/**
 * Fusionne les documents existants avec les nouveaux (dédoublonnage par nom).
 */
export function fusionnerDocuments(
  existants: DocumentInscription[] | null | undefined,
  nouveaux: DocumentInscription[] | null | undefined
): DocumentInscription[] {
  const tous = [...(existants ?? []), ...(nouveaux ?? [])];
  const vus = new Set<string>();
  return tous.filter((doc) => {
    const key = doc.nom ?? doc.url;
    if (vus.has(key)) return false;
    vus.add(key);
    return true;
  });
}

/**
 * Vérifie que toutes les pièces obligatoires sont présentes dans la liste
 * de documents fournis.
 */
export function piecesRequisesPresentes(
  documents: DocumentInscription[] | null | undefined
): boolean {
  if (!documents || documents.length === 0) return false;
  const typesFournis = new Set(documents.map((d) => d.type));
  return PIECES_OBLIGATOIRES.every((p) => typesFournis.has(p.id));
}

/**
 * Retourne la liste des pièces obligatoires manquantes.
 */
export function piecesManquantes(
  documents: DocumentInscription[] | null | undefined
): PieceJustificative[] {
  if (!documents) return PIECES_OBLIGATOIRES;
  const typesFournis = new Set(documents.map((d) => d.type));
  return PIECES_OBLIGATOIRES.filter((p) => !typesFournis.has(p.id));
}
