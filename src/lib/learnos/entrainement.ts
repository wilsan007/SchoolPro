/**
 * EcolPro / LEARNOS — Entraînement autonome
 * =========================================
 *
 * L'élève travaille seul, sur des exercices choisis par le sélecteur, corrigés
 * immédiatement, sans qu'un enseignant n'intervienne. Ce module tient la
 * séance : il révèle les étapes une à une, corrige chaque réponse, et convertit
 * la séance terminée en preuve d'apprentissage.
 *
 * AUCUN APPEL DE MODÈLE PENDANT LA SÉANCE
 * ---------------------------------------
 * La correction est une comparaison — égalité numérique à tolérance près, ou
 * identifiant de proposition. Trois raisons, dans cet ordre :
 *
 *  1. **Le retour doit être instantané.** Un élève qui attend deux secondes
 *     après chaque étape abandonne avant la fin de l'exercice.
 *  2. **Le coût suit les clics.** Un LLM par réponse, c'est un appel toutes les
 *     dix secondes et par élève : le dispositif ne survit pas au trimestre.
 *  3. **La même copie doit valoir la même chose deux fois.** Un modèle qui
 *     corrige diverge d'une exécution à l'autre, et une contestation devient
 *     indéfendable.
 *
 * L'IA rédige les énoncés **en amont**, dans la banque (`Question.origine`).
 * Rien ici n'en dépend : sans banque générée, l'entraînement tourne sur les
 * questions saisies à la main.
 *
 * CE QUE L'ÉLÈVE NE DOIT JAMAIS RECEVOIR
 * --------------------------------------
 * `Question.structure` contient les réponses attendues. Il ne sort d'ici que
 * par `vueEleve`, qui les retire et ne révèle que les étapes déjà atteintes.
 * Envoyer l'exercice entier au client pour économiser des allers-retours
 * reviendrait à publier le corrigé dans l'onglet réseau.
 *
 * LA TRICHE EST UN PROBLÈME DE CONFIANCE, PAS DE NOTE
 * ---------------------------------------------------
 * Un élève qui copie ne produit pas un score *faux*, il produit un score *dont
 * on ne sait pas ce qu'il vaut*. On ne rabote donc jamais `masterySignal` : on
 * baisse `confidence` (cf. `AUTO_ENTRAINEMENT` dans `FIABILITE_PAR_TYPE`), et
 * le jumeau d'apprentissage refuse de conclure « acquis » sur ces seules
 * preuves. Ni surveillance, ni suspicion : la triche reste possible et sans
 * effet mesurable, ce qui la rend inutile.
 *
 * RIEN N'EST ÉCRIT EN CLAIR
 * -------------------------
 * Comme le sélecteur et les recommandations, les motifs voyagent en clés de
 * traduction (`learnos.regles.exercice_*`) et non en phrases françaises.
 */

// Structure d'une question — schéma et lecture défensive
export {
  type FormatEtape,
  SEPARATEUR,
  type OptionEtape,
  type PaireEtape,
  type EtapeQuestion,
  type StructureQuestion,
  parseStructure,
} from "./entrainement/structure-question";

// Correction — déterministe, sans base de données
export {
  TENTATIVES_MAX,
  creditTentative,
  type Correction,
  corrigerEtape,
} from "./entrainement/correction";

// Déroulé d'une séance
export {
  type EtapeFaite,
  DUREE_MIN_ETAPE_MS,
  FACTEUR_QUESTION_NON_RELUE,
  type FiabiliteSeance,
  fiabiliteSeance,
  erreurDominante,
} from "./entrainement/deroule-seance";

// Projection destinée à l'élève
export {
  type EtapeVue,
  type ExerciceVue,
  type SeanceVue,
  detokeniser,
  vueEleve,
} from "./entrainement/vue-eleve";

// Accès base — périmètre
export {
  eleveDeSeance,
  chargerSeance,
  ouvrirSeance,
} from "./entrainement/acces-base";

// Soumission d'une étape
export {
  type ResultatEtape,
  ErreurSeance,
  soumettreEtape,
} from "./entrainement/soumission-etape";

// Conversion en preuve d'apprentissage
export { evidenceTypeDeFeuille } from "./entrainement/preuve-apprentissage";
