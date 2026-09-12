/**
 * EcolPro — Table des chemins d'accès au site par modèle
 * ==============================================================
 *
 * Comment atteindre le site depuis chaque modèle.
 *
 * Seuls 14 modèles portent une colonne `siteId`. Pour tous les autres, filtrer
 * sur `siteId` produit une erreur Prisma « Unknown argument ». Tant que le
 * filtrage était fail-open, ces routes recevaient un fragment vide et l'erreur
 * restait invisible ; dès que les utilisateurs ont un périmètre réel, elle
 * remonte en 500. D'où cette table : le chemin est décidé une fois, ici, et
 * `site-scope.model.test.ts` vérifie chaque entrée contre le schéma Prisma.
 *
 *  - `"column"`    → le modèle porte `siteId`
 *  - `"tenant"`    → donnée de référence partagée par tous les sites (pas de filtrage)
 *  - `{ one }`     → relation vers-un portant `siteId` (ex. Note → eleve)
 *  - `{ many }`    → relation vers-plusieurs portant `siteId` (ex. Enseignant → sites)
 */

export type SitePath =
  | "column"
  | "tenant"
  | { one: string }
  | { many: string }
  /**
   * Chaîne de relations à-un menant à un modèle qui porte réellement
   * `siteId` (ex: `ficheRH -> enseignant -> user.siteId`, deux sauts).
   * `{ one: string }` suppose que la cible immédiate porte `siteId` ; ce
   * n'est pas toujours le cas (`FicheRH` et `Enseignant` n'ont pas de
   * colonne `siteId` propre), d'où cette variante multi-sauts.
   */
  | { chain: string[] };

export const SITE_PATHS: Record<string, SitePath> = {
  // --- colonne siteId directe ---
  alumni: "column",
  candidature: "column",
  inscriptionHistorique: { one: "candidature" },
  classe: "column",
  cours: "column",
  eleve: "column",
  evenement: "column",
  examen: "column",
  facture: "column",
  itemInventaire: "column",
  notification: "column",
  salle: "column",
  user: "column",
  enseignantSite: "column",
  userSite: "column",
  // Ces trois modèles portent désormais `siteId` (matière/structure/dispo
  // propres à un site, `null` = partagé entre tous les sites).
  matiere: "column",
  structure: "column",
  disponibiliteEnseignant: "column",
  indisponibiliteEnseignant: "column",
  // Journal de suppression d'un site : rattaché au site qu'il décrit.
  siteDeletionLog: "column",
  // Grille tarifaire : `null` = tarif commun à tous les sites du tenant.
  tarifNiveau: "column",
  // Une conversation porte `siteId` (`null` = conversation hors site, par
  // exemple un échange direct entre deux personnes).
  conversation: "column",

  // --- rattachement via l'élève ---
  absence: { one: "eleve" },
  bulletin: { one: "eleve" },
  bulletinHistorique: { chain: ["bulletin", "eleve"] },
  note: { one: "eleve" },
  incident: { one: "eleve" },
  dispenseMatiere: { one: "eleve" },
  parcoursScolaire: { one: "eleve" },
  eleveParent: { one: "eleve" },
  exclusionEleve: { one: "eleve" },
  // `ProgressionEleve.eleveId` est un simple champ optionnel, sans relation :
  // le rattachement passe par le cours.
  progressionEleve: { one: "cours" },

  // --- rattachement via la classe ---
  evaluation: { one: "classe" },
  emploiTemps: { one: "classe" },

  // --- rattachement via la facture / l'examen ---
  paiement: { one: "facture" },
  relance: { one: "facture" },
  sessionExamen: { one: "examen" },

  // --- rattachement via la conversation ---
  message: { one: "conversation" },
  conversationParticipant: { one: "conversation" },

  // --- rattachement via l'utilisateur (personnel) ---
  parent: { one: "user" },
  // FicheRH n'a pas de colonne siteId propre : Enseignant non plus (il est
  // multi-site via EnseignantSite). Le seul chemin direct vers une colonne
  // siteId est FicheRH -> Enseignant -> User.siteId.
  ficheRH: { chain: ["enseignant", "user"] },

  // --- rattachement via une relation vers-plusieurs ---
  // Un enseignant est rattaché à ses sites par EnseignantSite.
  enseignant: { many: "sites" },

  // --- rattachement indirect ---
  // Incident et Bulletin n'ont pas de siteId propre (seul Eleve en a un).
  sanction: { chain: ["incident", "eleve"] },
  bulletinMatiere: { chain: ["bulletin", "eleve"] },
  contenuCours: { one: "cours" },
  absencePersonnel: { chain: ["enseignant", "user"] },
  congePersonnel: { chain: ["enseignant", "user"] },
  bulletinPaie: { chain: ["ficheRH", "enseignant", "user"] },

  // --- LEARNOS (docs/learnos-integration-plan.md) — toutes portent siteId ---
  chapitre: "column",
  competence: "column",
  learningEvidence: "column",
  studentLearningProfile: "column",
  studentIntervention: "column",
  aiDecisionLog: "column",
  learnosEvent: "column",
  evaluationCompetence: "column",
  seuilsRecommandation: "column",
  recommandation: "column",
  planProgression: "column",
  planificationChapitre: "column",
  kpiSnapshot: "column",
  // EtapePlan n'a pas de siteId : son rattachement passe par le plan.
  etapePlan: { one: "plan" },
  question: "column",
  feuilleExercices: "column",
  // Ni l'exercice servi ni la réponse ne portent de siteId : ils appartiennent
  // à la feuille, qui appartient à l'élève. Un siteId propre pourrait diverger
  // du sien si l'élève change de site en cours d'année.
  exerciceAssigne: { one: "feuille" },
  exerciceReponse: { chain: ["exercice", "feuille"] },
  alerteParent: "column",
  echangeParent: "column",

  // --- Infirmerie & santé ---
  passageInfirmerie: "column",
  ficheSanitaire: "column",

  // --- Cahier de textes / devoirs ---
  devoir: "column",

  // --- Remplacements de cours ---
  remplacementCours: "column",

  // --- Entretiens conseiller ---
  entretienConseiller: "column",

  // --- données de référence, partagées par tous les sites du tenant ---
  // Les préférences d'une famille suivent la famille, pas l'établissement :
  // un enfant qui change de site ne remet pas à zéro le consentement de ses
  // parents. Le modèle ne porte donc pas de `siteId`.
  preferencesParent: "tenant",
  periode: "tenant",
  anneesScolaires: "tenant",
  evenementCalendaire: "tenant",
  planificationCompetence: "column",
  patternPedagogique: "column",
  predictionDifficulte: "column",
  calibrationSeuil: "column",
  journalApprentissage: "column",
  reglesAppreciation: "tenant",
  document: "tenant",
  tenant: "tenant",
  site: "tenant",
  userTenant: "tenant",
  userRole: "tenant",
  deviceToken: "tenant",
  // Le journal d'audit est transverse : il trace aussi les actions menées
  // hors périmètre de site (connexion, changement de tenant).
  auditLog: "tenant",
  // Journal des emails transactionnels (Resend) : transverse au tenant.
  // Un email n'appartient pas à un site — il est envoyé à un destinataire
  // dans le contexte d'un établissement, pas d'un campus.
  emailLog: "tenant",
  // Cache technique d'appels LLM — aucune donnée nominative, aucune notion de site.
  aiCache: "tenant",
  account: "tenant",
  session: "tenant",
  verificationToken: "tenant",

  // --- Gouvernance (niveau tenant, pas de siteId) ---
  conseil: "tenant",
  membreConseil: "tenant",
  réunion: "tenant",
  résolution: "tenant",

  // --- Mentorat (niveau tenant, pas de siteId) ---
  mentorat: "tenant",
  objectifMentorat: "tenant",
  seanceMentorat: "tenant",

  // --- Journal de Progression Pédagogique (JPP) ---
  // SeancePedagogique porte un siteId propre. SeanceCompetence n'en a pas :
  // son rattachement passe par la séance.
  seancePedagogique: "column",
  seanceCompetence: { one: "seance" },
  seanceCommentaire: { one: "seance" },

  // --- Modules activables (niveau tenant, pas de siteId) ---
  module: "tenant",
  moduleActivation: "tenant",

  // --- Échéancier de paiement (rattaché à la facture qui porte siteId) ---
  echeancier: { one: "facture" },
  echeancePaiement: { chain: ["echeancier", "facture"] },

  // --- Demandes de lien parent/élève (niveau tenant, pas de siteId) ---
  demandeLienParent: "tenant",

  // --- Budget & dépenses (portent siteId, null = global tous sites) ---
  budget: "column",
  depense: "column",
  // Remise de caisse : porte siteId, null = remise globale (tous sites)
  remiseCaisse: "column",

  // --- Plans de leçon & grilles d'évaluation IA (portent siteId) ---
  planLecon: "column",
  rubriqueEvaluation: "column",

  // --- Tâches du personnel (portent siteId, null = global) ---
  tache: "column",

  // --- Historique de classe (rattaché à l'élève) ---
  historiqueClasse: { one: "eleve" },

  // --- Sync config (niveau tenant, unique par tenant) ---
  syncConfig: "tenant",

  // --- Calendrier officiel (global, pas de tenantId) ---
  calendrierOfficiel: "tenant",

  // --- Permissions utilisateur (niveau tenant, pas de siteId) ---
  userPermission: "tenant",

  // --- Affectation enseignant (rattaché à la classe qui porte siteId) ---
  affectationEnseignant: { one: "classe" },

  // --- Fournitures scolaires (portent siteId) ---
  demandeFourniture: "column",
  listeFournitureClasse: "column",
  listeFournitureItem: "tenant",

  // --- Campagne de réinscription (niveau tenant, pas de siteId) ---
  campagneReinscription: "tenant",
  invitationReinscription: { one: "eleve" },

  // --- Impersonation (global, pas de tenantId ni siteId) ---
  impersonationGrant: "tenant",

  // --- LEARNOS dead-letter queue (porte siteId optionnel) ---
  learnosEventDeadletter: "column",

  // --- Rate limit counter (global, pas de tenantId ni siteId) ---
  rateLimitCounter: "tenant",

  // --- Tâche cron execution (global, pas de tenantId ni siteId) ---
  tacheCronExecution: "tenant",
};

/**
 * Modèles "column" où `siteId: null` signifie "partagé entre tous les sites"
 * (donnée de référence). Pour ces modèles, un filtrage par site inclut les
 * enregistrements `null`.
 *
 * Pour tous les autres modèles "column" (eleve, classe, facture, etc.),
 * `siteId: null` signifie "non assigné" et ne doit PAS apparaître quand
 * on filtre par site.
 */
export const SHARED_NULL_MODELS = new Set([
  "matiere",
  "structure",
  "disponibiliteEnseignant",
  "indisponibiliteEnseignant",
  // Tarif applicable à tous les sites faute de site précisé.
  "tarifNiveau",
  // Une conversation sans site n'est pas « non assignée » : c'est un échange
  // qui ne relève d'aucun site (message direct). L'exclure du filtre ferait
  // disparaître les conversations personnelles de tout compte site-scopé.
  "conversation",
  // Référentiel pédagogique LEARNOS. Chapitres et compétences décrivent le
  // programme national : il est le même sur tous les campus, comme les
  // matières auxquelles ils se rattachent. Les traiter comme « non assignés »
  // revenait à réserver le curriculum au site qui le portait — l'annexe
  // n'affichait alors aucun chapitre. Les seuils, la planification annuelle et
  // les grilles d'évaluation suivent la même logique : ils sont arrêtés au
  // niveau de l'établissement, pas du campus.
  "chapitre",
  "competence",
  "seuilsRecommandation",
  "planificationChapitre",
  "planificationCompetence",
  "rubriqueEvaluation",
  // Journal technique des décisions IA : transverse au tenant.
  "aiDecisionLog",
  // Journal des emails transactionnels (Resend) : transverse au tenant.
  // Un email n'appartient pas à un site — il est envoyé à un destinataire
  // dans le contexte d'un établissement, pas d'un campus.
  "emailLog",
]);
