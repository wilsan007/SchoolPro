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

export * from "./import-unifie/index";
