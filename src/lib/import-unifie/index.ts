/**
 * Import unifié — étend l'import au-delà des élèves.
 *
 * Types d'import supportés :
 *   — eleves      (existant, délégué à import-eleves.ts)
 *   — enseignants
 *   — classes
 *   — matieres
 *   — parents
 *
 * Chaque type d'import suit le même pattern :
 *   1. Lecture du fichier (Excel/CSV)
 *   2. Construction d'un plan d'import (preview)
 *   3. Application du plan (écriture)
 *
 * L'import unifié ne remplace pas l'import élèves existant qui a une
 * logique riche de dédoublonnage. Il fournit un cadre commun pour les
 * autres types et un point d'entrée unique.
 */

export { type TypeImport, type PlanImport, type LigneImport, type ResultatImport, type FichierLu } from "./types";
export { lireFichier, empreinteFichier } from "./lecture-fichier";
export { analyserEnseignants, type DonneesEnseignant } from "./enseignants";
export { analyserClasses, type DonneesClasse } from "./classes";
export { analyserMatieres, type DonneesMatiere } from "./matieres";
export { analyserParents, type DonneesParent } from "./parents";
export { analyserPersonnelAdmin, type DonneesPersonnelAdmin } from "./personnel-admin";
export { analyserEdtExternes, appliquerImportEdtExternes, type DonneesEdtExterne } from "./edt-externes";
export {
  appliquerImportEnseignants,
  appliquerImportPersonnelAdmin,
  appliquerImportClasses,
  appliquerImportMatieres,
} from "./persistence";
