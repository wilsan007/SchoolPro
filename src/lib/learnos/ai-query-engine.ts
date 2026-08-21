/**
 * EcolPro — Moteur de requêtes IA sécurisé
 * ==========================================
 *
 * Permet à l'IA d'interroger la base de données en générant des requêtes
 * Prisma structurées (JSON), jamais de SQL brut.
 *
 * GARDE-FOU DE SÉCURITÉ :
 *   1. Le tenantId est injecté automatiquement sur CHAQUE requête.
 *      L'IA ne peut pas le contourner, même si elle essaie.
 *   2. Pour les parents, un filtre personnel (eleveId de leurs enfants)
 *      est injecté automatiquement.
 *   3. Aucune écriture possible — findMany et count uniquement.
 *   4. Limite de 100 résultats par requête.
 *   5. Seuls les modèles autorisés pour le rôle sont accessibles.
 *
 * Le flux :
 *   1. L'IA reçoit la description du schéma (modèles + champs autorisés)
 *   2. L'IA génère une requête JSON : { model, where?, select?, take?, orderBy? }
 *   3. L'exécuteur valide le modèle, injecte les filtres de sécurité,
 *      et exécute via Prisma.
 *   4. Les résultats sont renvoyés à l'IA pour formulation.
 */

import prisma from "@/lib/prisma";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { siteFilterForModel, personalScopeFilter } from "@/lib/site-scope";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface AiQueryRequest {
  /** Nom du modèle Prisma à interroger (ex: "note", "eleve", "absence"). */
  model: string;
  /** Filtre Prisma where (sans tenantId — injecté automatiquement). */
  where?: Record<string, unknown>;
  /** Champs à sélectionner. Si absent, sélection par défaut. */
  select?: Record<string, boolean>;
  /** Nombre de résultats (max 100, défaut 50). */
  take?: number;
  /** Tri Prisma. */
  orderBy?: Record<string, "asc" | "desc">;
  /** Compter au lieu de lister. */
  count?: boolean;
  /** Inclure des relations. */
  include?: Record<string, boolean | Record<string, unknown>>;
}

export interface AiQueryResult {
  /** Données retournées (lignes ou compte). */
  data: unknown;
  /** Nom du modèle interrogé. */
  model: string;
  /** Nombre de résultats. */
  total: number;
  /** True si la requête a été refusée. */
  refused: boolean;
  /** Motif du refus le cas échéant. */
  reason?: string;
}

// ------------------------------------------------------------
// Permissions par rôle
// ------------------------------------------------------------

type RoleCategory = "admin" | "parent" | "teacher" | "student";

/**
 * Modèles accessibles à chaque catégorie de rôle.
 *
 * ADMIN : tous les modèles métiers (pas les modèles d'auth/infra).
 * PARENT : uniquement les données de ses enfants.
 * TEACHER : ses classes, ses notes, ses absences, son programme.
 * STUDENT : ses propres données.
 */
const ADMIN_MODELS = new Set([
  // Effectifs
  "eleve", "classe", "parent", "eleveParent", "enseignant",
  // Scolarité
  "note", "evaluation", "bulletin", "bulletinMatiere",
  "absence", "passageInfirmerie", "ficheSanitaire",
  "examen", "sessionExamen",
  // Finances
  "facture", "echeancePaiement", "echeancier", "paiement", "tarifNiveau", "relance",
  "remiseCaisse", "budget", "depense",
  // Vie scolaire
  "incident", "sanction", "evenement", "exclusionEleve",
  // Organisation
  "matiere", "salle", "emploiTemps", "structure", "site",
  "anneesScolaires", "periode", "evenementCalendaire",
  // RH
  "ficheRh", "bulletinPaie",
  // LEARNOS — intelligence pédagogique
  "recommandation", "learningEvidence", "studentLearningProfile",
  "studentIntervention", "predictionDifficulte", "planProgression",
  "etapePlan", "chapitre", "competence", "planificationChapitre",
  "planificationCompetence", "patternPedagogique", "calibrationSeuil",
  "journalApprentissage", "aiDecisionLog",
  // Cours & devoirs
  "cours", "devoir",
  // Communication
  "notification", "conversation",
  // Mentorat
  "mentorat", "objectifMentorat", "seanceMentorat",
  // Admissions & alumni
  "candidature", "alumni", "parcoursScolaire",
  // Autres
  "document", "tache",
]);

const PARENT_MODELS = new Set([
  "eleve",           // ses enfants uniquement (filtre auto)
  "note",            // notes de ses enfants
  "absence",         // absences de ses enfants
  "bulletin",        // bulletins de ses enfants
  "evaluation",      // évaluations des classes de ses enfants
  "facture",         // factures liées à ses enfants
  "examen",          // examens à venir
  "sessionExamen",   // sessions d'examens
  "incident",        // incidents de ses enfants
  "passageInfirmerie", // passages infirmerie de ses enfants
]);

const TEACHER_MODELS = new Set([
  "classe", "matiere", "note", "evaluation", "absence",
  "eleve", "emploiTemps", "salle", "examen", "sessionExamen",
  "incident", "devoir", "planLecon", "seancePedagogique",
]);

const STUDENT_MODELS = new Set([
  "eleve", "note", "absence", "bulletin", "evaluation",
  "examen", "sessionExamen", "incident",
]);

function getRoleCategory(role: string): RoleCategory {
  if (["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"].includes(role)) return "admin";
  if (role === "PARENT") return "parent";
  if (["ENSEIGNANT", "TEACHER"].includes(role)) return "teacher";
  if (["STUDENT", "ELEVE"].includes(role)) return "student";
  return "parent"; // fail-closed : le moins de permissions
}

function getAllowedModels(role: string): Set<string> {
  const cat = getRoleCategory(role);
  switch (cat) {
    case "admin": return ADMIN_MODELS;
    case "parent": return PARENT_MODELS;
    case "teacher": return TEACHER_MODELS;
    case "student": return STUDENT_MODELS;
  }
}

// ------------------------------------------------------------
// Relations vers Eleve pour le filtrage parent/élève
// ------------------------------------------------------------

/**
 * Pour chaque modèle, comment atteindre `Eleve` (pour injecter le filtre
 * parent → ses enfants). null = le modèle EST Eleve.
 */
const ELEVE_RELATION: Record<string, string | null> = {
  eleve: null,
  note: "eleve",
  absence: "eleve",
  bulletin: "eleve",
  evaluation: "classe",   // évaluation → classe → élèves (approximatif)
  facture: "eleve",
  incident: "eleve",
  passageInfirmerie: "eleve",
  examen: null,            // pas de lien direct élève
  sessionExamen: null,
};

// ------------------------------------------------------------
// Schéma exposé à l'IA
// ------------------------------------------------------------

/**
 * Description compacte des modèles et de leurs champs, pour le prompt LLM.
 * Seuls les champs les plus utiles sont exposés (pas les 114 modèles complets).
 */
const SCHEMA_DESCRIPTION = `
MODELES PRINCIPAUX (nom Prisma en minuscule) :

eleve : id, nom, prenom, matricule, dateNaissance, sexe, statut, classeId, siteId
  → relation: classe (Classe), notes (Note[]), absences (Absence[]), parents (EleveParent[])

classe : id, nom, niveau, tenantId, siteId
  → relation: eleves (Eleve[]), matieres (Matiere[])

note : id, valeur, noteMax, coefficient, date, type, periodeId, eleveId, classeId, matiereId, tenantId
  → type: CONTROLE | DEVOIR | EXAMEN | INTERROGATION | PROJET | ORAL | TP
  → relation: eleve (Eleve), matiere (Matiere), classe (Classe), periode (Periode)

absence : id, dateDebut, dateFin, motif, justifiee, statut, eleveId, classeId, tenantId
  → statut: JUSTIFIEE | INJUSTIFIEE | EN_ATTENTE
  → relation: eleve (Eleve), classe (Classe)

evaluation : id, titre, type, date, duree, coefficient, classeId, matiereId, periodeId, statut, tenantId
  → statut: PLANIFIE | EN_COURS | TERMINE
  → relation: classe (Classe), matiere (Matiere), notes (Note[])

bulletin : id, eleveId, periodeId, moyenneGenerale, rang, appreciation, isPublie, tenantId
  → relation: eleve (Eleve), periode (Periode), matieres (BulletinMatiere[])

bulletinMatiere : id, bulletinId, matiereId, moyenneEleve, moyenneClasse, rang, appreciation, coefficient
  → relation: bulletin (Bulletin), matiere (Matiere)

examen : id, intitule, statut, dateDebut, dateFin, siteId, tenantId
  → statut: PROGRAMME | EN_COURS | TERMINE | ANNULE
  → relation: sessions (SessionExamen[])

sessionExamen : id, examId, matiereNom, date, heureDebut, heureFin, salle, niveau

facture : id, numero, montant, statut, eleveId, dateEmission, tenantId, siteId
  → statut: IMPAYE | PARTIEL | PAYE | ANNULE
  → relation: eleve (Eleve), echeances (EcheancePaiement[])

echeancePaiement : id, factureId, montant, dateEcheance, statut, montantPaye

paiement : id, factureId, montant, datePaiement, methode

incident : id, date, type, description, gravite, eleveId, classeId, tenantId
  → gravite: MINEUR | MODERE | GRAVE
  → relation: eleve (Eleve)

passageInfirmerie : id, date, motif, eleveId, tenantId

periode : id, nom, numero, dateDebut, dateFin, statut, anneeId
  → statut: OUVERT | CLOTUREE
  → relation: annee (AnneesScolaires), notes (Note[])
  → ATTENTION: pas de tenantId direct. Filtrer par annee: { annee: { tenantId: 'xxx' } } ou par anneeId.

anneesScolaires : id, libelle, dateDebut, dateFin, isCurrent, tenantId

matiere : id, nom, code, coefficient, couleur, tenantId
  → relation: classe (Classe)

enseignant : id, userId, tenantId
  → relation: user (User), matieres (Matiere[])

parent : id, userId, telephone, tenantId
  → relation: eleves (EleveParent[])

eleveParent : id, eleveId, parentId, isGardien, typeLien

site : id, nom, adresse, tenantId

recommandation : id, eleveId, statut, type, resolueLe, priorite, tenantId
  → statut: OBLIGATOIRE | CONSEILLEE | RESOLUE
  → type: REMEDIATION | APPROFONDISSEMENT | SOUTIEN | REORIENTATION

notification : id, type, message, lu, userId, tenantId

tache : id, titre, description, statut, priorite, echeance, tenantId

budget : id, annee, categorie, montantPrevu, montantDepense, devise, siteId, tenantId

depense : id, budgetId, montant, date, description, siteId, tenantId

remiseCaisse : id, caissierId, montantDeclare, dateRemise, statut, siteId, tenantId
  → statut: EN_ATTENTE | CONFIRME | REJETEE

candidature : id, nom, prenom, statut, annee, classeVoulue, tenantId
  → statut: SOUMISE | EN_EXAMEN | ADMIS | REFUSE | INSCRIT | ANNULE

alumni : id, nom, prenom, anneeDiplome, filiere, tenantId

--- MODÈLES LEARNOS (intelligence pédagogique) ---

learningEvidence : id, eleveId, competenceId, chapitreId, type, signal, confidence, date, tenantId
  → type: NOTE | EVALUATION | OBSERVATION | AUTO_EVALUATION
  → signal: MAITRISE | FRAGILE | CRITIQUE | NON_EVALUE

studentLearningProfile : id, eleveId, niveauMaitriseGlobal, tendance, tenantId
  → tendance: PROGRESSION | STABLE | REGRESSION

studentIntervention : id, eleveId, type, statut, dateDebut, dateFin, masteryBefore, masteryAfter, tenantId
  → type: REMEDIATION | SOUTIEN | APPROFONDISSEMENT
  → statut: PLANIFIEE | EN_COURS | TERMINEE | ANNULEE

predictionDifficulte : id, eleveId, chapitreId, niveauRisque, verifiee, tenantId
  → niveauRisque: FAIBLE | MODERE | ELEVE

planProgression : id, eleveId, type, statut, tenantId
  → type: REMEDIATION | APPROFONDISSEMENT
  → statut: PROPOSE | VALIDE | EN_COURS | TERMINE | REJETE

etapePlan : id, planId, description, statut, dateCompletion
  → statut: A_FAIRE | EN_COURS | TERMINE

chapitre : id, matiereId, nom, niveau, ordre, tenantId
  → relation: matiere (Matiere), competences (Competence[])

competence : id, chapitreId, nom, description, ordre, tenantId
  → relation: chapitre (Chapitre)

planificationChapitre : id, chapitreId, classeId, anneeId, dateDebut, dateFin, tenantId

patternPedagogique : id, niveau, matiereId, moyenneHistorique, tauxEchec, tenantId

calibrationSeuil : id, niveau, matiereId, seuilAlerte, seuilCritique, tenantId

journalApprentissage : id, action, details, tenantId, createdAt

cours : id, titre, description, niveau, statut, matiereNom, auteurNom, siteId, tenantId
  → statut: BROUILLON | PUBLIE | ARCHIVE

devoir : id, titre, classeId, matiereId, dateDonne, dateRendu, statut, tenantId
  → statut: A_FAIRE | RENDU | CORRIGE

ficheRh : id, enseignantId, statut, dateEmbauche, tenantId

bulletinPaie : id, ficheRhId, mois, annee, montantBrut, montantNet, tenantId

document : id, nom, type, eleveId, url, tenantId

parcoursScolaire : id, eleveId, annee, classeNom, resultat, tenantId
`;

/**
 * Retourne la description du schéma pour le prompt LLM, filtrée par rôle.
 */
export function getSchemaForRole(role: string): string {
  const allowed = getAllowedModels(role);
  // Pour les parents, on ne montre que les modèles autorisés
  if (getRoleCategory(role) === "admin") {
    return SCHEMA_DESCRIPTION;
  }
  // Pour les autres rôles, filtrer la description
  const lines = SCHEMA_DESCRIPTION.split("\n").filter((line) => {
    const match = line.match(/^(\w+) :/);
    if (!match) return true; // garder les lignes non-modèle (en-têtes, relations)
    return allowed.has(match[1]);
  });
  return lines.join("\n");
}

// ------------------------------------------------------------
// Modèles sans tenantId direct — filtrage via relation
// ------------------------------------------------------------

/**
 * Certains modèles n'ont pas de colonne `tenantId` directe : le tenant
 * s'obtient via une relation. Pour ces modèles, injecter `tenantId` dans le
 * `where` provoque une erreur Prisma "Unknown argument `tenantId`".
 *
 * On liste ici ces modèles avec le chemin de relation à utiliser pour le
 * filtrage tenant.
 */
const TENANT_VIA_RELATION: Record<string, Record<string, unknown>> = {
  periode: { annee: { tenantId: "__TENANT__" } },
  evenementCalendaire: { annee: { tenantId: "__TENANT__" } },
  bulletinMatiere: { bulletin: { tenantId: "__TENANT__" } },
  etapePlan: { plan: { tenantId: "__TENANT__" } },
  sessionExamen: { examen: { tenantId: "__TENANT__" } },
  echeancePaiement: { facture: { tenantId: "__TENANT__" } },
  paiement: { facture: { tenantId: "__TENANT__" } },
  planificationCompetence: { planificationChapitre: { tenantId: "__TENANT__" } },
  seanceCompetence: { seance: { tenantId: "__TENANT__" } },
  eleveParent: { eleve: { tenantId: "__TENANT__" } },
  conversationParticipant: { conversation: { tenantId: "__TENANT__" } },
  message: { conversation: { tenantId: "__TENANT__" } },
  contenuCours: { cours: { tenantId: "__TENANT__" } },
  progressionEleve: { cours: { tenantId: "__TENANT__" } },
  historiqueClasse: { classe: { tenantId: "__TENANT__" } },
  evaluationCompetence: { evaluation: { tenantId: "__TENANT__" } },
  membreConseil: { conseil: { tenantId: "__TENANT__" } },
  resolution: { reunion: { tenantId: "__TENANT__" } },
  userSite: { site: { tenantId: "__TENANT__" } },
  enseignantSite: { site: { tenantId: "__TENANT__" } },
};

/**
 * Remplace les marqueurs "__TENANT__" par le vrai tenantId dans un filtre
 * relationnel profond.
 */
function injectTenantInRelation(
  filter: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value === "__TENANT__") {
      result[key] = tenantId;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = injectTenantInRelation(value as Record<string, unknown>, tenantId);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ------------------------------------------------------------
// Exécuteur de requête sécurisé
// ------------------------------------------------------------

const MAX_RESULTS = 100;
const DEFAULT_TAKE = 50;

export async function executeAiQuery(
  query: AiQueryRequest,
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string; role: string }
): Promise<AiQueryResult> {
  const { model, select, take, orderBy, count, include } = query;
  let where = query.where ?? {};

  // 1. Valider le modèle
  const allowedModels = getAllowedModels(claims.role);
  const modelLower = model.toLowerCase();
  if (!allowedModels.has(modelLower)) {
    return {
      data: null,
      model: modelLower,
      total: 0,
      refused: true,
      reason: `Le modèle "${modelLower}" n'est pas accessible à votre rôle (${claims.role}).`,
    };
  }

  // 2. Construire le filtre de sécurité
  //    a) tenantId injecté systématiquement — soit directement (si le modèle
  //       a une colonne tenantId), soit via une relation (cf. TENANT_VIA_RELATION)
  //    b) filtre de site pour les admins non-super
  //    c) filtre personnel pour les parents/élèves
  const securityWhere: Record<string, unknown> = {};

  // Injection du tenantId : direct ou via relation
  if (TENANT_VIA_RELATION[modelLower]) {
    const relationFilter = injectTenantInRelation(TENANT_VIA_RELATION[modelLower], tenantId);
    Object.assign(securityWhere, relationFilter);
  } else {
    // La plupart des modèles ont un tenantId direct.
    securityWhere.tenantId = tenantId;
  }

  // Filtre site (sauf pour parent/élève qui sont filtrés par relation)
  const cat = getRoleCategory(claims.role);
  if (cat === "admin" || cat === "teacher") {
    try {
      const siteFilter = siteFilterForModel(modelLower as keyof typeof siteFilterForModel, claims);
      if (Object.keys(siteFilter).length > 0) {
        Object.assign(securityWhere, siteFilter);
      }
    } catch {
      // Modèle sans siteId — pas de filtre site
    }
  }

  // Filtre personnel pour les parents/élèves
  if (cat === "parent" || cat === "student") {
    const relation = ELEVE_RELATION[modelLower];
    const personalFilter = personalScopeFilter(claims, relation);
    if (Object.keys(personalFilter).length > 0) {
      // Fusionner avec AND pour ne pas écraser
      if (securityWhere.AND) {
        securityWhere.AND = [...(securityWhere.AND as unknown[]), personalFilter];
      } else {
        Object.assign(securityWhere, personalFilter);
      }
    }
  }

  // 3. Fusionner le where de l'IA avec le where de sécurité
  //    Le where de sécurité est encapsulé dans AND pour ne pas être contourné.
  //    On retire aussi `tenantId` du where de l'IA : l'IA peut le mettre par
  //    habitude, mais pour les modèles sans colonne tenantId (periode, etc.),
  //    cela provoque une erreur Prisma. Le tenant est déjà injecté via
  //    securityWhere (direct ou via relation).
  if (where && typeof where === "object" && "tenantId" in where) {
    const { tenantId: _omit, ...restWhere } = where;
    where = restWhere as Record<string, unknown>;
  }
  const finalWhere = {
    AND: [securityWhere, where],
  };

  // 4. Limiter les résultats
  const finalTake = Math.min(take ?? DEFAULT_TAKE, MAX_RESULTS);

  // 5. Exécuter
  try {
    const modelDelegate = (prisma as unknown as Record<string, {
      findMany: (args: unknown) => Promise<unknown[]>;
      count: (args: unknown) => Promise<number>;
      aggregate: (args: unknown) => Promise<unknown>;
      groupBy: (args: unknown) => Promise<unknown[]>;
    }>)[modelLower];

    if (!modelDelegate) {
      return {
        data: null,
        model: modelLower,
        total: 0,
        refused: true,
        reason: `Modèle "${modelLower}" inconnu.`,
      };
    }

    if (count) {
      const total = await modelDelegate.count({ where: finalWhere });
      return { data: { count: total }, model: modelLower, total, refused: false };
    }

    // Sélection par défaut : champs scalaires principaux si aucun select
    const args: Record<string, unknown> = {
      where: finalWhere,
      take: finalTake,
    };
    if (orderBy) args.orderBy = orderBy;
    if (select) args.select = select;
    if (include) args.include = include;

    const rows = await modelDelegate.findMany(args);
    return {
      data: rows,
      model: modelLower,
      total: rows.length,
      refused: false,
    };
  } catch (error) {
    return {
      data: null,
      model: modelLower,
      total: 0,
      refused: true,
      reason: `Erreur d'exécution: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ------------------------------------------------------------
// Outil LLM pour la fonction de requête
// ------------------------------------------------------------

import type { AiToolDefinition } from "@/lib/ai/provider";

export const OUTIL_REQUETE_DB: AiToolDefinition = {
  type: "function",
  function: {
    name: "interroger_db",
    description:
      "Interroge la base de données de l'établissement. Tu génères une requête structurée " +
      "(modèle + filtres + sélection) et le système l'exécute SÉCURISÉMENT avec les filtres " +
      "de tenant et de périmètre appliqués automatiquement. " +
      "Tu peux appeler cet outil plusieurs fois pour des requêtes différentes. " +
      "Pour compter, utilise count: true. " +
      "Pour trier, utilise orderBy. " +
      "NE JAMAIS inclure tenantId dans where — il est injecté automatiquement.",
    parameters: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Nom du modèle Prisma en minuscule (ex: 'note', 'eleve', 'absence', 'examen').",
        },
        where: {
          type: "object",
          description:
            "Filtre Prisma where. NE PAS inclure tenantId (injecté auto). " +
            "Ex: { periodeId: 'xxx', valeur: { gte: 10 } } ou { statut: 'TERMINE' }.",
        },
        select: {
          type: "object",
          description: "Champs à sélectionner. Ex: { id: true, nom: true, valeur: true }.",
        },
        include: {
          type: "object",
          description: "Relations à inclure. Ex: { eleve: true, matiere: true }.",
        },
        take: {
          type: "number",
          description: "Nombre de résultats (max 100, défaut 50).",
        },
        orderBy: {
          type: "object",
          description: "Tri. Ex: { date: 'desc' } ou { valeur: 'asc' }.",
        },
        count: {
          type: "boolean",
          description: "Si true, compte les lignes au lieu de les lister.",
        },
      },
      required: ["model"],
    },
  },
};
