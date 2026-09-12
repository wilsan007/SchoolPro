import { type MappingColonnes } from "@/lib/column-inference";

export type TypeImport = "eleves" | "enseignants" | "classes" | "matieres" | "parents" | "edt-externes" | "personnel-admin";

export interface PlanImport<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  type: TypeImport;
  empreinte: string;
  totalLignes: number;
  lignesValides: number;
  lignesErreurs: number;
  lignes: LigneImport<T>[];
  /** Mapping de colonnes inféré par analyse du header + des données. */
  mappingColonnes?: MappingColonnes;
  /** En-têtes du fichier source (pour l'UI de remapping). */
  headers?: string[];
}

export interface LigneImport<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  numero: number;
  action: "CREER" | "METTRE_A_JOUR" | "IGNORER" | "ERREUR";
  donnees: T;
  message?: string;
  existe?: boolean;
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  ignores: number;
  erreurs: number;
}

/** Résultat de la lecture d'un fichier : headers + lignes. */
export interface FichierLu {
  headers: string[];
  rows: Record<string, string>[];
}
