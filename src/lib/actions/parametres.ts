// ============================================================
// Barrel de ré-export — parametres
// ============================================================
// Ce fichier était autrefois un monolithe de 2 412 lignes (80 Ko).
// Il a été découpé en sous-modules SRP dans le dossier ./parametres/.
// Chaque sous-module porte "use server" et exporte ses actions.
// Ce barrel conserve l'API publique inchangée pour les consommateurs.

export {
  type EtablissementFormData,
  updateEtablissement,
  getEtablissementData,
} from "./parametres/etablissement";

export {
  type UserFormData,
  getUsersForTenant,
  createUser,
  toggleUserActive,
  deleteUser,
} from "./parametres/utilisateurs";

export {
  type ClasseFormData,
  getClassesForSettings,
  getEnseignantsForClasse,
  createClasse,
  deleteClasse,
} from "./parametres/classes-crud";

export {
  type UpdateClasseFormData,
  updateClasse,
  archiveClasse,
  restoreClasse,
  getArchivedClasses,
  transferClasse,
  mergeClasses,
  splitClasse,
  duplicateClasse,
  getClassesForExport,
} from "./parametres/classes-avancees";

export {
  type MatiereFormData,
  getMatieresForSettings,
  createMatiere,
  deleteMatiere,
} from "./parametres/matieres";

export {
  type ParentFormData,
  getParentsForSettings,
  getElevesForLinking,
  createParent,
  linkParentToEleves,
  unlinkParentFromEleve,
  updateParentPhone,
  deleteParent,
  updateUserPhone,
} from "./parametres/parents";

export {
  getReglesAppreciation,
  getPeriodesForCloture,
} from "./parametres/regles";

export {
  type SiteFormData,
  type DeleteSiteFormData,
  getSitesForSettings,
  createSite,
  updateSite,
  deleteSite,
  restoreSite,
  getDeletedSites,
  assignUserSites,
  getUserSites,
} from "./parametres/sites";

export {
  getAnneesScolaires,
  createAnneeScolaire,
  activateAnneeScolaire,
  deleteAnneeScolaire,
} from "./parametres/annees-scolaires";

export {
  type PromotionPreview,
  niveauSuivant,
  previewPromotion,
  executePromotion,
  copyStructureToNewYear,
} from "./parametres/promotion";

export {
  findDuplicateEleves,
  mergeEleves,
} from "./parametres/fusion-doublons";
