/**
 * EcolPro / LEARNOS — Chatbot directeur : analyse de données en langage naturel
 * ==============================================================================
 *
 * Permet au directeur, principal ou tenant-admin de poser des questions en
 * langage naturel sur les données de l'établissement. Inspiré de PowerBuddy
 * for Data Analysis, avec un garde-fou LEARNOS fondamental :
 *
 *   - L'IA **ne génère jamais de SQL**. Elle choisit un **outil fermé** parmi
 *     une liste fixe, et les données viennent de requêtes Prisma codées en dur.
 *   - L'IA ne fait que **formuler la conclusion** à partir des données.
 *   - Si la question ne correspond à aucun outil → réponse bornée qui le signale.
 *
 * POURQUOI PAS DE SQL LIBRE ?
 * ---------------------------
 *   1. **Sécurité** : un SQL libre pourrait lire des données hors périmètre
 *      (autre tenant, autre site) ou faire des écritures destructrices.
 *   2. **Reproductibilité** : deux directeurs posant la même question doivent
 *      avoir la même réponse. Un SQL généré par IA peut varier.
 *   3. **Coût** : les outils fermés sont des requêtes déterministes — gratuites.
 *      L'IA ne coûte que pour l'identification de l'intention + la formulation.
 *
 * LE PÉRIMÈTRE EST VERROUILLÉ
 * ---------------------------
 *   - Le chatbot ne répond qu'aux questions qui correspondent à un outil.
 *   - Hors périmètre → message clair : "Je ne peux répondre qu'aux questions
 *     sur l'établissement (effectifs, notes, absences, finances, programme,
 *     intelligence, risque, équité, climat, alumni, etc.)."
 *   - Aucune question sur un élève nommé, aucune donnée hors tenant/site.
 */

import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition, AiMessage } from "@/lib/ai/provider";
import prisma from "@/lib/prisma";
import { siteFilterForModel, siteFilterForRelation, type SessionSiteClaims } from "@/lib/site-scope";
import { semaineScolaire } from "@/lib/learnos/planification";
import { executeAiQuery, getSchemaForRole } from "@/lib/learnos/ai-query-engine";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// --- Nouvelles bibliothèques d'intelligence (outils fermés étendus) ---

import { tableauIntelligenceDirecteur, calculerISP, calculerIVF, calculerICS } from "@/lib/learnos/direction-intelligence";
import { calculerRisqueDecrochage } from "@/lib/learnos/risque-decrochage";
import { simulerRemediation } from "@/lib/learnos/simulation-remediation";
import {
  analyserEfficacitePlans,
  analyserEfficaciteEnseignants,
  comparerTypesIntervention,
  mesurerAdoptionIA,
} from "@/lib/learnos/efficacite-pedagogique";
import { identifierNoeudsCritiques, validerPrerequisEmpiriquement } from "@/lib/learnos/graphe-curriculum";
import {
  calculerRisqueFamilles,
  calculerCoutParEleve,
  analyserDepassementsBudget,
  analyserEfficaciteRelances,
  calculerDelaiPaiement,
  calculerTauxAdmission,
} from "@/lib/learnos/finance-intelligence";
import {
  analyserCorrelationEngagement,
  analyserQuestionsFrequentes,
  analyserImpactAlertePaiement,
  analyserTauxValidationLien,
} from "@/lib/learnos/engagement-parental";
import {
  calculerTauxCouverture,
  identifierCreneauxOrphelins,
  prioriserRemplacements,
  identifierSallesGoulot,
} from "@/lib/learnos/couverture-remplacements";
import { calculerCourbeOubli, genererAlerteVacances } from "@/lib/learnos/courbe-oubli";
import {
  analyserBesoinsSpeciauxInterventions,
  analyserEquiteInterSite,
  analyserRepresentationGenre,
  comparerInternesExternes,
} from "@/lib/learnos/equite-inclusion";
import {
  analyserEcartGenre,
  comparerBoursiers,
  analyserEfficaciteRedoublement,
  analyserMotifsTransfert,
  calculerProbabiliteDiplomation,
  predireRemplissageClasses,
} from "@/lib/learnos/trajectoires-cohortes";
import { clustererEleves, apparierTutorat } from "@/lib/learnos/clustering-eleves";
import {
  analyserCorrelationInfirmerie,
  identifierHotspotsIncidents,
  analyserEfficaciteEntretiens,
  analyserNotificationParents,
} from "@/lib/learnos/climat-bien-etre";
import {
  analyserReussiteSuperieure,
  analyserInsertionParFiliere,
  analyserReseauAlumni,
} from "@/lib/learnos/alumni-intelligence";

const VERSION_PROMPT = "chatbot-direction-v2";

/**
 * Feature flag global pour l'assistant d'analyse de la direction.
 *
 * Quand `false` :
 *   - l'entrée de menu est masquée (voir `Sidebar.tsx`),
 *   - la page `/chatbot-direction` redirige vers `/direction`,
 *   - l'API `/api/learnos/chatbot-direction` renvoie un 503 contrôlé,
 *   - aucun appel LLM n'est émis, aucun coût n'est engagé.
 *
 * La matrice de permissions (`ROUTE_RULES`) et tout le code des outils fermés
 * sont préservés pour une réactivation propre : il suffit de repasser ce flag
 * à `true` et de décommenter l'entrée du menu dans `Sidebar.tsx`.
 *
 * Le catalogue de questions fermées est en cours d'enrichissement pour couvrir
 * l'ensemble des domaines de gestion de l'établissement (RH, admissions,
 * examens, sanctions, orientation, inventaire, communication, historique
 * multi-annuel, alertes précoces, etc.).
 */
export const CHATBOT_DIRECTION_ACTIF = false;

// ---------------------------------------------------------------------------
// Outils fermés — l'IA ne peut rien d'autre que ces appels
// ---------------------------------------------------------------------------

const OUTIL_EFFECTIFS: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_effectifs",
    description:
      "Analyse les effectifs : nombre d'élèves par classe, par site, par niveau. " +
      "Répond aux questions comme 'Combien d'élèves ?' ou 'Effectifs par classe'.",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["total", "par_classe", "par_niveau", "par_site"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_NOTES: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_notes",
    description:
      "Analyse les notes et résultats : moyennes par matière, par classe, " +
      "évolution entre périodes/trimestres (combien d'élèves ont progressé, " +
      "régressé ou sont stables), élèves en difficulté. " +
      "Répond aux questions comme 'Moyennes en maths ?', 'Qui est en difficulté ?', " +
      "'Combien d'élèves ont progressé par rapport au 1er trimestre ?', " +
      "'Évolution des résultats entre les trimestres ?', " +
      "'Combien d'élèves ont baissé entre le T1 et le T2 ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["moyenne_par_matiere", "moyenne_par_classe", "eleves_en_difficulte", "evolution"],
          description:
            "Dimension d'analyse. " +
            "'evolution' = compare la 1ère et la dernière période de l'année courante : " +
            "compte les élèves en progression (delta > +0.5), en baisse (delta < -0.5), " +
            "et stables. Retourne aussi les pourcentages et la répartition par classe.",
        },
        matiere: { type: "string", description: "Nom de la matière (optionnel)." },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_ABSENCES: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_absences",
    description:
      "Analyse l'assiduité : taux d'absentéisme par classe, par site, " +
      "élèves à risque d'absentéisme chronique. " +
      "Répond aux questions comme 'Taux d'absentéisme ?' ou 'Qui manque trop ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["taux_global", "par_classe", "eleves_chroniques"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_PROGRAMME: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_programme",
    description:
      "Analyse l'avancement du programme : couverture, chapitres en retard, " +
      "prédictions de difficulté. " +
      "Répond aux questions comme 'Où en est le programme ?' ou 'Quels retards ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["couverture_globale", "retards", "predictions_difficulte"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_FINANCES: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_finances",
    description:
      "Analyse les finances : impayés par classe, montants en attente. " +
      "Répond aux questions comme 'Impayés ?' ou 'Qui n'a pas payé ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["impayes_total", "impayes_par_classe"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_SITES: AiToolDefinition = {
  type: "function",
  function: {
    name: "comparer_sites",
    description:
      "Compare les sites/campus : effectifs, moyennes, absentéisme entre sites. " +
      "Répond aux questions comme 'Comparer les sites ?' ou 'Quel site a les meilleurs résultats ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["effectifs", "moyennes", "absenteisme"],
          description: "Dimension de comparaison demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

// ---------------------------------------------------------------------------
// Outils fermés étendus — 14 nouveaux outils appuyés sur les bibliothèques
// d'intelligence LEARNOS. Chacun expose un ensemble fixe de dimensions.
// ---------------------------------------------------------------------------

const OUTIL_INTELLIGENCE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_intelligence",
    description:
      "Indices composites de santé de l'établissement (ISP, IEIS, IVF, ICS, ROI, IRO). " +
      "Répond aux questions comme 'Quelle est la santé de l'établissement ?' ou 'Indice pédagogique ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["indices_complets", "isp", "ivf", "ics"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_RISQUE_DECROCHAGE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_risque_decrochage",
    description:
      "Score de risque de décrochage multi-dimensionnel : synthèse, élèves à risque élevé, décrochage silencieux. " +
      "Répond aux questions comme 'Qui risque de décrocher ?' ou 'Décrochage silencieux ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["synthese", "eleves_risque_eleve", "decrochage_silencieux"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_SIMULATION_REMEDIATION: AiToolDefinition = {
  type: "function",
  function: {
    name: "simuler_remediation",
    description:
      "Simulation contre-factuelle de remédiations : scénarios priorisés par ROI, impact total. " +
      "Répond aux questions comme 'Quelle remédiation prioriser ?' ou 'Impact des remédiations ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["scenarios_priorises", "impact_total"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_EFFICACITE_PEDAGOGIQUE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_efficacite_pedagogique",
    description:
      "Efficacité des plans de progression, progression des enseignants, types d'intervention, adoption de l'IA. " +
      "Répond aux questions comme 'Efficacité des plans ?' ou 'Adoption de l'IA ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["efficacite_plans", "progression_enseignants", "types_intervention", "adoption_ia"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_GRAPHE_CURRICULUM: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_graphe_curriculum",
    description:
      "Analyse du graphe curriculum : nœuds critiques, validation empirique des prérequis. " +
      "Répond aux questions comme 'Quelles compétences sont critiques ?' ou 'Les prérequis sont-ils validés ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["noeuds_critiques", "validation_prerequis"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_FINANCE_INTELLIGENCE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_finance_intelligence",
    description:
      "Intelligence financière avancée : risque des familles, coût par élève, dépassements de budget, " +
      "efficacité des relances, délai de paiement, taux d'admission. " +
      "Répond aux questions comme 'Risque financier des familles ?' ou 'Coût par élève ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["risque_familles", "cout_par_eleve", "depassements_budget", "efficacite_relances", "delai_paiement", "taux_admission"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_ENGAGEMENT_PARENTAL: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_engagement_parental",
    description:
      "Engagement parental comme prédicteur : corrélation avec la mastery, questions fréquentes, " +
      "impact des alertes de paiement, validation du lien parent-élève. " +
      "Répond aux questions comme 'Engagement des parents ?' ou 'Impact des alertes paiement ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["correlation_mastery", "questions_frequentes", "impact_alertes", "validation_lien"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_COUVERTURE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_couverture",
    description:
      "Couverture des remplacements et salles : taux de couverture, créneaux orphelins, priorisation, salles goulot. " +
      "Répond aux questions comme 'Taux de couverture des remplacements ?' ou 'Créneaux orphelins ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["taux_couverture", "creneaux_orphelins", "priorisation", "salles_goulot"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_COURBE_OUBLI: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_courbe_oubli",
    description:
      "Décroissance de la mastery et alerte vacances : demi-vie de l'oubli, alerte de révision avant les vacances. " +
      "Répond aux questions comme 'Demi-vie de l'oubli ?' ou 'Alerte vacances ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["demi_vie", "alerte_vacances"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_EQUITE: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_equite",
    description:
      "Équité et inclusion : besoins spéciaux, équité inter-site, représentation de genre, internes vs externes. " +
      "Répond aux questions comme 'Équité entre sites ?' ou 'Représentation de genre ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["besoins_speciaux", "equite_inter_site", "representation_genre", "internes_externes"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_TRAJECTOIRES: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_trajectoires",
    description:
      "Trajectoires et cohortes : écart de genre, boursiers, redoublement, motifs de transfert, diplomation, remplissage des classes. " +
      "Répond aux questions comme 'Écart de genre ?' ou 'Taux de diplomation ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["ecart_genre", "boursiers", "redoublement", "motifs_transfert", "diplomation", "remplissage_classes"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_CLUSTERING: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_clustering",
    description:
      "Clustering d'élèves et tutorat : groupes d'élèves similaires, appariement de tutorat. " +
      "Répond aux questions comme 'Groupes d'élèves ?' ou 'Tutorat ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["clusters", "tutorat"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_CLIMAT: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_climat",
    description:
      "Climat et bien-être : corrélation infirmerie, hotspots d'incidents, efficacité des entretiens, notification des parents. " +
      "Répond aux questions comme 'Climat scolaire ?' ou 'Hotspots d'incidents ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["correlation_infirmerie", "hotspots_incidents", "efficacite_entretiens", "notification_parents"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

const OUTIL_ALUMNI: AiToolDefinition = {
  type: "function",
  function: {
    name: "analyser_alumni",
    description:
      "Post-diplôme et insertion : réussite dans le supérieur, insertion par filière, réseau alumni. " +
      "Répond aux questions comme 'Réussite dans le supérieur ?' ou 'Insertion des diplômés ?'",
    parameters: {
      type: "object",
      properties: {
        dimension: {
          type: "string",
          enum: ["reussite_superieure", "insertion_par_filiere", "reseau_alumni"],
          description: "Dimension d'analyse demandée.",
        },
      },
      required: ["dimension"],
    },
  },
};

/**
 * Outil de requête libre sur la base de données.
 *
 * Contrairement aux outils fermés ci-dessus (qui exposent des dimensions
 * prédéfinies), cet outil permet à l'IA de construire SA PROPRE requête
 * Prisma structurée (JSON) pour répondre à des questions non couvertes par
 * les outils fermés.
 *
 * SÉCURITÉ :
 *   - Le tenantId est injecté automatiquement sur CHAQUE requête.
 *   - Le filtre de site est injecté automatiquement.
 *   - Aucune écriture possible (findMany et count uniquement).
 *   - Limite de 100 résultats par requête.
 *   - Seuls les modèles autorisés pour le rôle admin sont accessibles.
 *
 * L'IA peut appeler cet outil PLUSIEURS FOIS pour des requêtes différentes
 * (ex: d'abord récupérer les périodes, puis les notes de chaque période,
 * puis calculer l'évolution).
 */
const OUTIL_REQUETE_DB: AiToolDefinition = {
  type: "function",
  function: {
    name: "interroger_db",
    description:
      "Interroge directement la base de données de l'établissement en générant " +
      "une requête Prisma structurée. Utilise cet outil quand la question ne " +
      "correspond à AUCUN des autres outils fermés, ou quand tu as besoin de " +
      "données brutes pour faire un calcul personnalisé. " +
      "Tu peux appeler cet outil plusieurs fois pour des requêtes différentes. " +
      "Pour compter, utilise count: true. Pour trier, utilise orderBy. " +
      "NE JAMAIS inclure tenantId dans where — il est injecté automatiquement. " +
      "EXEMPLES : " +
      "• 'Combien d'élèves ont une moyenne > 12 au T2 ?' → model='note', where={periodeId:'xxx', valeur:{gte:12}}, count=true " +
      "• 'Liste des notes d'une classe pour une période' → model='note', where={classeId:'xxx', periodeId:'xxx'} " +
      "• 'Bulletins publiés ce trimestre' → model='bulletin', where={isPublie:true, periodeId:'xxx'} " +
      "• 'Évolution d'un élève entre 2 périodes' → 2 requêtes : model='note' where={eleveId:'xxx', periodeId:'T1'} puis where={eleveId:'xxx', periodeId:'T2'}",
    parameters: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description:
            "Nom du modèle Prisma en minuscule. Modèles disponibles : " +
            "eleve, classe, note, absence, evaluation, bulletin, bulletinMatiere, " +
            "periode, anneesScolaires, matiere, enseignant, parent, eleveParent, " +
            "facture, echeancePaiement, paiement, incident, sanction, " +
            "passageInfirmerie, examen, sessionExamen, salle, emploiTemps, " +
            "recommandation, learningEvidence, studentLearningProfile, " +
            "studentIntervention, predictionDifficulte, planProgression, " +
            "etapePlan, chapitre, competence, planificationChapitre, " +
            "planificationCompetence, patternPedagogique, calibrationSeuil, " +
            "journalApprentissage, cours, devoir, ficheRh, bulletinPaie, " +
            "budget, depense, remiseCaisse, candidature, alumni, " +
            "notification, conversation, document, parcoursScolaire.",
        },
        where: {
          type: "object",
          description:
            "Filtre Prisma where. NE PAS inclure tenantId (injecté auto). " +
            "Ex: { periodeId: 'xxx', valeur: { gte: 10 } } ou { statut: 'ACTIF' }. " +
            "Pour comparer des champs : { valeur: { gte: 10, lte: 20 } }. " +
            "Pour filtrer par relation : { eleve: { classeId: 'xxx' } }.",
        },
        select: {
          type: "object",
          description:
            "Champs à sélectionner. Ex: { id: true, nom: true, valeur: true }. " +
            "Si absent, retourne les champs scalaires principaux.",
        },
        include: {
          type: "object",
          description:
            "Relations à inclure. Ex: { eleve: true, matiere: true, periode: true }.",
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

/** Tous les outils disponibles — l'IA ne peut rien d'autre. */
const OUTILS = [
  OUTIL_EFFECTIFS,
  OUTIL_NOTES,
  OUTIL_ABSENCES,
  OUTIL_PROGRAMME,
  OUTIL_FINANCES,
  OUTIL_SITES,
  OUTIL_INTELLIGENCE,
  OUTIL_RISQUE_DECROCHAGE,
  OUTIL_SIMULATION_REMEDIATION,
  OUTIL_EFFICACITE_PEDAGOGIQUE,
  OUTIL_GRAPHE_CURRICULUM,
  OUTIL_FINANCE_INTELLIGENCE,
  OUTIL_ENGAGEMENT_PARENTAL,
  OUTIL_COUVERTURE,
  OUTIL_COURBE_OUBLI,
  OUTIL_EQUITE,
  OUTIL_TRAJECTOIRES,
  OUTIL_CLUSTERING,
  OUTIL_CLIMAT,
  OUTIL_ALUMNI,
  // Outil de requête libre — permet à l'IA d'interroger la DB directement
  // pour les questions non couvertes par les outils fermés ci-dessus.
  OUTIL_REQUETE_DB,
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReponseChatbot {
  /** Texte de la réponse, formulé par l'IA à partir des données. */
  texte: string;
  /** Outil qui a été appelé (pour traçabilité). */
  outilAppele: string;
  /** Données brutes retournées par l'outil (pour affichage optionnel). */
  donnees: unknown;
  /** `true` si la question était hors périmètre. */
  horsPerimetre: boolean;
  /** Modèle utilisé. */
  modele: string;
  /** `true` si la réponse vient du cache. */
  cached: boolean;
}

/** Un échange précédent dans la conversation, pour garder le contexte. */
export interface TourConversation {
  role: "user" | "assistant";
  content: string;
}

const CONSIGNE_SYSTEME = `Tu es un assistant analytique pour le directeur d'un établissement scolaire francophone.

TON RÔLE :
- Tu analyses les données de l'établissement et tu formules des conclusions claires.
- Tu réponds en appelant un des outils fournis. Jamais de texte libre sans données.
- Si la question ne correspond à aucun outil fermé, utilise l'outil "interroger_db" pour interroger directement la base de données.

STRATÉGIE D'OUTILS :
- Les outils fermés (analyser_effectifs, analyser_notes, analyser_absences, etc.) couvrent les analyses courantes avec des calculs optimisés. Utilise-les en priorité quand la question correspond.
- L'outil "interroger_db" te permet de construire des requêtes personnalisées pour les questions non couvertes. Tu peux l'appeler plusieurs fois (ex: récupérer les périodes, puis les notes de chaque période, puis comparer).
- Si une question nécessite des données que tu n'as pas encore (ex: l'ID d'une période), utilise "interroger_db" pour les récupérer d'abord, puis fais ton analyse.
- Tu PEUX combiner plusieurs appels d'outils dans une même réponse pour fournir une analyse complète.

RÈGLES STRICTES :
- Tu ne nommes JAMAIS un élève individuellement. Tu parles de groupes ou de statistiques.
- Tes conclusions sont factuelles : "La 6ème B a 23% d'absentéisme" et non "c'est inquiétant".
- Tu donnes le chiffre, puis une brève interprétation, puis une piste d'action si pertinent.
- Réponse en 3 à 8 lignes maximum : le directeur n'a pas de temps à perdre.
- Pas de Markdown : texte brut.
- INTERDIT : N'écris JAMAIS la syntaxe d'appel d'outil dans ta réponse (pas de <function=...>, pas de JSON, pas de balises). Les outils sont appelés via le mécanisme natif, pas dans le texte.
- INTERDIT : N'invente JAMAIS un chiffre. Si les données ne contiennent pas l'information, dis "Je n'ai pas cette donnée pour le moment."
- Tu réponds en français clair et professionnel.`;

const CONSIGNE_FORMULATION = `Tu es un assistant analytique pour le directeur d'un établissement scolaire francophone.

Tu reçois les DONNÉES BRUTES d'une requête. Ta tâche est UNIQUEMENT de formuler une réponse claire à partir de ces données.

RÈGLES STRICTES :
- Utilise UNIQUEMENT les chiffres et informations présents dans les données fournies. N'invente JAMAIS un nombre.
- Si les données contiennent un message "en cours de développement", dis-le honnêtement.
- Réponds en français clair et professionnel, en 3 à 8 lignes maximum.
- Pas de Markdown : texte brut uniquement.
- INTERDIT : N'écris JAMAIS <function=...>, de JSON, de balises ou de syntaxe technique dans ta réponse.
- INTERDIT : N'ajoute JAMAIS "Piste d'action :", "Réponse :", "La réponse est :" ou tout préfixe artificiel.
- Réponds directement avec le contenu utile, comme dans une conversation naturelle.
- Si la question fait référence à une conversation précédente, utilise le contexte fourni pour répondre de manière cohérente.`;

/** Nettoie une réponse de toute syntaxe technique qui aurait fuité. */
function nettoyerReponse(texte: string): string {
  let nettoye = texte;
  // Retirer les balises <function=...>...</function> ou <function=.../>
  nettoye = nettoye.replace(/<function[= ][^>]*>[\s\S]*?<\/function>/gi, "");
  nettoye = nettoye.replace(/<function[= ][^>]*\/>/gi, "");
  // Retirer les blocs JSON qui ressemblent à des appels d'outil
  nettoye = nettoye.replace(/\{[\s]*"name"[\s]*:[\s]*"[^"]*"[\s\S]*?\}/g, "");
  // Retirer les préfixes artificiels
  nettoye = nettoye.replace(/^(Réponse\s*:\s*|La réponse est\s*:\s*|Piste d'action\s*:\s*)/i, "");
  // Retirer les expressions parasites courantes
  nettoye = nettoye.replace(/Piste d'action\s*:/gi, "");
  // Nettoyer les espaces et lignes vides excédentaires
  nettoye = nettoye.replace(/\n{3,}/g, "\n\n").trim();
  return nettoye;
}

/** Limite l'historique aux derniers tours pour rester dans le contexte du modèle. */
const MAX_TOURS_HISTORIQUE = 6;

/**
 * Traite une question du directeur et renvoie une réponse analytique.
 *
 * Le flux est :
 *   1. L'IA identifie l'intention → choisit un ou plusieurs outils.
 *   2. Les outils sont exécutés (requêtes Prisma déterministes, filtrées par
 *      tenant + site, OU requêtes libres via interroger_db avec injection
 *      automatique des filtres de sécurité).
 *   3. Si l'IA a encore besoin de données, elle peut enchaîner plusieurs tours
 *      d'appels d'outils (jusqu'à MAX_TOOL_ROUNDS).
 *   4. L'IA formule la conclusion en texte clair, nettoyé de toute syntaxe.
 *
 * Si l'IA ne choisit aucun outil → hors périmètre → réponse bornée.
 */
const MAX_TOOL_ROUNDS = 8;

export async function poserQuestion(
  tenantId: string,
  claims: SessionSiteClaims,
  question: string,
  actorId: string,
  historique: TourConversation[] = [],
  maintenant: Date = new Date(),
  tenantNom: string = "Établissement",
  anneeCourante?: string | null
): Promise<ReponseChatbot> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  // Construire les messages avec l'historique récent pour le contexte.
  const toursRecents = historique.slice(-MAX_TOURS_HISTORIQUE);

  // Inclure le schéma DB et le nom du tenant dans le contexte.
  const schemaDb = getSchemaForRole(claims.role ?? "TENANT_ADMIN");
  const systemPromptAvecContexte = CONSIGNE_SYSTEME +
    "\n\nCONTEXTE DE L'ÉTABLISSEMENT :\n" +
    "- Nom de l'établissement : " + tenantNom + "\n" +
    "- Tenant ID : " + tenantId + "\n" +
    "- Date actuelle (simulation) : " + maintenant.toISOString().slice(0, 10) + "\n" +
    "\nSCHÉMA DE LA BASE DE DONNÉES :\n" + schemaDb;

  const messages: AiMessage[] = [
    { role: "system", content: systemPromptAvecContexte },
    ...toursRecents.map((t) => ({ role: t.role, content: t.content }) as AiMessage),
    { role: "user", content: question },
  ];

  let dernierOutil = "aucun";
  let dernieresDonnees: unknown = null;
  let texteFormule: string | null = null;
  let dernierModele = "unknown";
  let dernierCache = false;

  // Boucle d'appels d'outils : l'IA peut enchaîner plusieurs requêtes
  // (ex: récupérer les périodes, puis les notes de chaque période, puis comparer).
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resultat = await routeAi(
      {
        complexity: "simple",
        promptVersion: VERSION_PROMPT,
        action: "chatbot.direction.identifier",
        tenantId,
        siteId: claims.siteId ?? null,
        actorId,
      },
      messages,
      {
        tools: OUTILS,
        temperature: 0.1,
        maxTokens: 600,
      }
    );

    dernierModele = resultat.meta.modelName;
    dernierCache = resultat.meta.cached;

    // Si l'IA n'a appelé aucun outil → soit réponse texte, soit hors périmètre.
    if (resultat.toolCalls.length === 0) {
      const texteBrut = resultat.content?.trim();
      if (texteBrut && texteBrut.length > 10 && !texteBrut.includes("<function")) {
        texteFormule = texteBrut;
        break;
      }
      // Hors périmètre : l'IA n'a ni appelé d'outil ni produit de texte utile.
      return {
        texte:
          "Je n'ai pas de données pour répondre à cette question. " +
          "Je peux analyser : effectifs, notes et résultats (incluant l'évolution " +
          "entre trimestres), absences, avancement du programme, finances, " +
          "comparaison entre sites, indices de santé (ISP, IVF, ICS), risque de " +
          "décrochage, efficacité pédagogique, graphe curriculum, équité, " +
          "trajectoires, clustering, climat, alumni, et toute autre donnée " +
          "présente dans la base. Reformulez votre question.",
        outilAppele: dernierOutil,
        donnees: dernieresDonnees,
        horsPerimetre: true,
        modele: dernierModele,
        cached: dernierCache,
      };
    }

    // Ajouter le message assistant avec les tool_calls au contexte.
    messages.push({
      role: "assistant",
      content: resultat.content,
      tool_calls: resultat.toolCalls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    // Exécuter chaque outil appelé.
    let tousOutilsExecutes = true;
    for (const appel of resultat.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(appel.arguments);
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: appel.id,
          content: JSON.stringify({ erreur: "Arguments invalides" }),
        });
        tousOutilsExecutes = false;
        continue;
      }

      let donnees: unknown;
      if (appel.name === "interroger_db") {
        // Requête libre via ai-query-engine (sécurisée).
        const result = await executeAiQuery(
          {
            model: (args.model as string) ?? "",
            where: args.where as Record<string, unknown> | undefined,
            select: args.select as Record<string, boolean> | undefined,
            include: args.include as Record<string, boolean | Record<string, unknown>> | undefined,
            take: args.take as number | undefined,
            orderBy: args.orderBy as Record<string, "asc" | "desc"> | undefined,
            count: args.count as boolean | undefined,
          },
          tenantId,
          { ...claims, userId: actorId, id: actorId, role: claims.role ?? "TENANT_ADMIN" }
        );
        donnees = result.refused
          ? { erreur: result.reason }
          : result.data;
      } else {
        // Outil fermé existant.
        donnees = await executerOutil(tenantId, claims, appel.name, args, maintenant, annee);
      }

      dernierOutil = appel.name;
      dernieresDonnees = donnees;

      messages.push({
        role: "tool",
        tool_call_id: appel.id,
        content: JSON.stringify(donnees),
      });
    }

    // Si l'IA a appelé des outils mais n'a plus besoin de données supplémentaires,
    // elle produira du texte au prochain tour. On continue la boucle.
  }

  // Étape finale : formuler la réponse à partir de toutes les données collectées.
  if (texteFormule === null) {
    // L'IA a utilisé tous ses tours d'outils : on lui demande de formuler.
    const messagesFormulation: AiMessage[] = [
      { role: "system", content: CONSIGNE_FORMULATION },
      ...toursRecents.map((t) => ({ role: t.role, content: t.content }) as AiMessage),
      { role: "user", content: question },
      ...messages.slice(2), // Inclure tous les appels d'outils et réponses.
    ];

    const resultatFormulation = await routeAi(
      {
        complexity: "simple",
        promptVersion: VERSION_PROMPT,
        action: "chatbot.direction.formuler",
        tenantId,
        siteId: claims.siteId ?? null,
        actorId,
      },
      messagesFormulation,
      {
        temperature: 0.3,
        maxTokens: 500,
      }
    );

    texteFormule = resultatFormulation.content?.trim() ?? "Analyse terminée. Consultez les données ci-dessus.";
    dernierModele = resultatFormulation.meta.modelName;
    dernierCache = resultatFormulation.meta.cached;
  }

  return {
    texte: nettoyerReponse(texteFormule),
    outilAppele: dernierOutil,
    donnees: dernieresDonnees,
    horsPerimetre: false,
    modele: dernierModele,
    cached: dernierCache,
  };
}

// ---------------------------------------------------------------------------
// Exécution des outils — requêtes Prisma déterministes, filtrées par site
// ---------------------------------------------------------------------------

async function executerOutil(
  tenantId: string,
  claims: SessionSiteClaims,
  nomOutil: string,
  args: Record<string, unknown>,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<unknown> {
  switch (nomOutil) {
    case "analyser_effectifs":
      return analyserEffectifs(tenantId, claims, args.dimension as string, anneeCourante);
    case "analyser_notes":
      return analyserNotes(tenantId, claims, args.dimension as string, args.matiere as string | undefined, anneeCourante);
    case "analyser_absences":
      return analyserAbsences(tenantId, claims, args.dimension as string, maintenant, anneeCourante);
    case "analyser_programme":
      return analyserProgramme(tenantId, claims, args.dimension as string, maintenant);
    case "analyser_finances":
      return analyserFinances(tenantId, claims, args.dimension as string);
    case "comparer_sites":
      return comparerSites(tenantId, claims, args.dimension as string);
    case "analyser_intelligence":
      return analyserIntelligence(tenantId, claims, args.dimension as string);
    case "analyser_risque_decrochage":
      return analyserRisqueDecrochage(tenantId, claims, args.dimension as string);
    case "simuler_remediation":
      return simulerRemediationOutil(tenantId, claims, args.dimension as string);
    case "analyser_efficacite_pedagogique":
      return analyserEfficacitePedagogique(tenantId, claims, args.dimension as string);
    case "analyser_graphe_curriculum":
      return analyserGrapheCurriculum(tenantId, claims, args.dimension as string);
    case "analyser_finance_intelligence":
      return analyserFinanceIntelligence(tenantId, claims, args.dimension as string);
    case "analyser_engagement_parental":
      return analyserEngagementParental(tenantId, claims, args.dimension as string);
    case "analyser_couverture":
      return analyserCouverture(tenantId, claims, args.dimension as string);
    case "analyser_courbe_oubli":
      return analyserCourbeOubli(tenantId, claims, args.dimension as string);
    case "analyser_equite":
      return analyserEquite(tenantId, claims, args.dimension as string);
    case "analyser_trajectoires":
      return analyserTrajectoires(tenantId, claims, args.dimension as string);
    case "analyser_clustering":
      return analyserClustering(tenantId, claims, args.dimension as string);
    case "analyser_climat":
      return analyserClimat(tenantId, claims, args.dimension as string);
    case "analyser_alumni":
      return analyserAlumni(tenantId, claims, args.dimension as string);
    default:
      return { erreur: "Outil inconnu" };
  }
}

async function analyserEffectifs(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "total") {
    const total = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });
    return { total, dimension: "total" };
  }

  if (dimension === "par_classe") {
    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        _count: { select: { eleves: { where: { statut: "ACTIF", deletedAt: null } } } },
      },
      orderBy: { niveau: "asc" },
    });
    return {
      dimension: "par_classe",
      classes: classes.map((c) => ({ classe: c.nom, niveau: c.niveau, effectif: c._count.eleves })),
    };
  }

  if (dimension === "par_niveau") {
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
      select: { classe: { select: { niveau: true } } },
    });
    const parNiveau = new Map<string, number>();
    for (const e of eleves) {
      const n = e.classe?.niveau ?? "Non assigné";
      parNiveau.set(n, (parNiveau.get(n) ?? 0) + 1);
    }
    return {
      dimension: "par_niveau",
      niveaux: [...parNiveau.entries()].map(([niveau, effectif]) => ({ niveau, effectif })),
    };
  }

  if (dimension === "par_site") {
    const sites = await prisma.site.findMany({
      where: { tenantId },
      select: {
        id: true,
        nom: true,
        _count: { select: { eleves: { where: { statut: "ACTIF", deletedAt: null } } } },
      },
    });
    return {
      dimension: "par_site",
      sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    };
  }

  return { erreur: "Dimension non reconnue" };
}

async function analyserNotes(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  matiereNom?: string,
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "moyenne_par_matiere") {
    const where = {
      tenantId,
      ...(annee ? { classe: { annee: annee } } : {}),
      ...siteFilterForRelation(claims, "classe"),
      ...(matiereNom ? { matiere: { nom: { contains: matiereNom, mode: "insensitive" as const } } } : {}),
    };
    const notes = await prisma.note.findMany({
      where,
      select: { valeur: true, noteMax: true, matiere: { select: { nom: true } } },
    });
    const parMatiere = new Map<string, { somme: number; count: number }>();
    for (const n of notes) {
      const key = n.matiere.nom;
      const normalized = (n.valeur / n.noteMax) * 20;
      const existing = parMatiere.get(key) ?? { somme: 0, count: 0 };
      existing.somme += normalized;
      existing.count++;
      parMatiere.set(key, existing);
    }
    return {
      dimension: "moyenne_par_matiere",
      matieres: [...parMatiere.entries()].map(([matiere, { somme, count }]) => ({
        matiere,
        moyenne: count > 0 ? Math.round((somme / count) * 100) / 100 : null,
        nombreNotes: count,
      })),
    };
  }

  if (dimension === "eleves_en_difficulte") {
    const recommandations = await prisma.recommandation.findMany({
      where: {
        tenantId,
        statut: "OBLIGATOIRE",
        resolueLe: null,
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("recommandation", claims),
      },
      select: { eleveId: true },
      distinct: ["eleveId"],
    });
    return {
      dimension: "eleves_en_difficulte",
      nombreEleves: recommandations.length,
    };
  }

  if (dimension === "moyenne_par_classe") {
    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        notes: { select: { valeur: true, noteMax: true } },
      },
      orderBy: { niveau: "asc" },
    });
    const result = classes.map((c) => {
      const notes = c.notes;
      const moyennes = notes.map((n) => (n.valeur / n.noteMax) * 20);
      const moyenne = moyennes.length > 0 ? moyennes.reduce((s, v) => s + v, 0) / moyennes.length : null;
      return {
        classe: c.nom,
        niveau: c.niveau,
        moyenne: moyenne !== null ? Math.round(moyenne * 100) / 100 : null,
        nombreNotes: notes.length,
      };
    });
    return { dimension: "moyenne_par_classe", classes: result };
  }

  if (dimension === "evolution") {
    // Comparaison des moyennes entre la première et la dernière période de
    // l'année qui a des notes. On cherche d'abord l'année courante, mais si
    // elle n'a pas de notes (ex: année nouvellement créée sans saisie), on
    // remonte à l'année la plus récente qui en a.
    const annees = await prisma.anneesScolaires.findMany({
      where: { tenantId },
      select: { id: true, libelle: true, isCurrent: true },
      orderBy: { libelle: "desc" },
    });

    let anneeUtilisee: { id: string; libelle: string } | null = null;
    for (const an of annees) {
      const periodes = await prisma.periode.findMany({
        where: { anneeId: an.id },
        select: { id: true },
      });
      if (periodes.length === 0) continue;
      const notesCount = await prisma.note.count({
        where: { tenantId, periodeId: { in: periodes.map((p) => p.id) }, ...(annee ? { classe: { annee: annee } } : {}), ...siteFilterForRelation(claims, "classe") },
      });
      if (notesCount > 0) {
        anneeUtilisee = an;
        break;
      }
    }

    if (!anneeUtilisee) {
      return {
        dimension: "evolution",
        message: "Aucune année avec des notes n'a été trouvée pour ce tenant.",
      };
    }

    const periodes = await prisma.periode.findMany({
      where: { anneeId: anneeUtilisee.id },
      orderBy: { numero: "asc" },
      select: { id: true, nom: true, numero: true },
    });
    if (periodes.length < 2) {
      return { dimension: "evolution", message: "Pas assez de périodes pour comparer l'évolution" };
    }

    const premiere = periodes[0];
    const derniere = periodes[periodes.length - 1];

    // Moyennes par élève pour la première période (Note a periodeId directement)
    const notesPremiere = await prisma.note.findMany({
      where: {
        tenantId,
        ...(annee ? { classe: { annee: annee } } : {}),
        ...siteFilterForRelation(claims, "classe"),
        periodeId: premiere.id,
      },
      select: { eleveId: true, valeur: true, noteMax: true },
    });
    // Moyennes par élève pour la dernière période
    const notesDerniere = await prisma.note.findMany({
      where: {
        tenantId,
        ...(annee ? { classe: { annee: annee } } : {}),
        ...siteFilterForRelation(claims, "classe"),
        periodeId: derniere.id,
      },
      select: { eleveId: true, valeur: true, noteMax: true },
    });

    const moyenneParEleve = (notes: typeof notesPremiere) => {
      const map = new Map<string, { somme: number; count: number }>();
      for (const n of notes) {
        const normalized = (n.valeur / n.noteMax) * 20;
        const existing = map.get(n.eleveId) ?? { somme: 0, count: 0 };
        existing.somme += normalized;
        existing.count++;
        map.set(n.eleveId, existing);
      }
      const result = new Map<string, number>();
      for (const [id, { somme, count }] of map) {
        if (count > 0) result.set(id, somme / count);
      }
      return result;
    };

    const moyennesPremiere = moyenneParEleve(notesPremiere);
    const moyennesDerniere = moyenneParEleve(notesDerniere);

    let enProgression = 0;
    let enBaisse = 0;
    let stable = 0;
    let totalCompare = 0;
    const deltas: number[] = [];

    for (const [eleveId, m1] of moyennesPremiere) {
      const m2 = moyennesDerniere.get(eleveId);
      if (m2 === undefined) continue;
      totalCompare++;
      const delta = m2 - m1;
      deltas.push(delta);
      if (delta > 0.5) enProgression++;
      else if (delta < -0.5) enBaisse++;
      else stable++;
    }

    const pourcentageBaisse = totalCompare > 0 ? Math.round((enBaisse / totalCompare) * 100) : 0;
    const pourcentageProgression = totalCompare > 0 ? Math.round((enProgression / totalCompare) * 100) : 0;
    const pourcentageStable = totalCompare > 0 ? Math.round((stable / totalCompare) * 100) : 0;

    // Répartition par classe des élèves en baisse
    const elevesEnBaisse: string[] = [];
    for (const [eleveId, m1] of moyennesPremiere) {
      const m2 = moyennesDerniere.get(eleveId);
      if (m2 !== undefined && m2 - m1 < -0.5) elevesEnBaisse.push(eleveId);
    }

    let repartitionParClasse: { classe: string; nombre: number }[] = [];
    if (elevesEnBaisse.length > 0) {
      const eleves = await prisma.eleve.findMany({
        where: {
          id: { in: elevesEnBaisse },
          tenantId,
          ...siteFilterForModel("eleve", claims),
        },
        select: { classe: { select: { nom: true } } },
      });
      const parClasse = new Map<string, number>();
      for (const e of eleves) {
        const nom = e.classe?.nom ?? "Non assigné";
        parClasse.set(nom, (parClasse.get(nom) ?? 0) + 1);
      }
      repartitionParClasse = [...parClasse.entries()].map(([classe, nombre]) => ({ classe, nombre }));
    }

    return {
      dimension: "evolution",
      periodeDebut: premiere.nom,
      periodeFin: derniere.nom,
      totalElevesCompare: totalCompare,
      enProgression,
      enBaisse,
      stable,
      pourcentageBaisse,
      pourcentageProgression,
      pourcentageStable,
      repartitionBaisseParClasse: repartitionParClasse,
    };
  }

  // Fallback générique.
  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

async function analyserAbsences(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<unknown> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  if (dimension === "taux_global") {
    const totalEleves = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const totalAbsences = await prisma.absence.count({
      where: {
        tenantId,
        date: { gte: debutPeriode, lte: maintenant },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
    });

    const taux = totalEleves > 0 ? Math.round((totalAbsences / (totalEleves * 30)) * 1000) / 10 : 0;
    return {
      dimension: "taux_global",
      tauxAbsenteisme: taux,
      totalAbsences30j: totalAbsences,
      totalEleves,
    };
  }

  if (dimension === "eleves_chroniques") {
    // Élèves avec plus de 20% d'absences sur les 30 derniers jours
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const totalEleves = await prisma.eleve.count({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
    });

    // Compter les absences par élève (sans groupBy having — incompatible avec le filtre site)
    const absences = await prisma.absence.findMany({
      where: {
        tenantId,
        date: { gte: debutPeriode },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
      select: { eleveId: true },
    });

    const compteParEleve = new Map<string, number>();
    for (const a of absences) {
      compteParEleve.set(a.eleveId, (compteParEleve.get(a.eleveId) ?? 0) + 1);
    }

    // ~20% de 30 jours ≈ 6 absences
    const elevesChroniquesIds = [...compteParEleve.entries()]
      .filter(([, count]) => count >= 6)
      .map(([id]) => id);

    const elevesChroniques = elevesChroniquesIds.length;
    const pourcentage = totalEleves > 0 ? Math.round((elevesChroniques / totalEleves) * 100) : 0;

    // Répartition par classe
    let repartitionParClasse: { classe: string; nombre: number }[] = [];
    if (elevesChroniques > 0) {
      const eleves = await prisma.eleve.findMany({
        where: {
          id: { in: elevesChroniquesIds },
          tenantId,
          ...siteFilterForModel("eleve", claims),
        },
        select: { classe: { select: { nom: true } } },
      });
      const parClasse = new Map<string, number>();
      for (const e of eleves) {
        const nom = e.classe?.nom ?? "Non assigné";
        parClasse.set(nom, (parClasse.get(nom) ?? 0) + 1);
      }
      repartitionParClasse = [...parClasse.entries()].map(([classe, nombre]) => ({ classe, nombre }));
    }

    return {
      dimension: "eleves_chroniques",
      nombreElevesChroniques: elevesChroniques,
      totalEleves,
      pourcentage,
      repartitionParClasse,
    };
  }

  if (dimension === "par_classe") {
    const debutPeriode = new Date(maintenant);
    debutPeriode.setDate(debutPeriode.getDate() - 30);

    const classes = await prisma.classe.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(annee ? { annee: annee } : {}),
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        _count: {
          select: {
            eleves: { where: { statut: "ACTIF", deletedAt: null } },
          },
        },
      },
      orderBy: { niveau: "asc" },
    });

    // Compter les absences par classe via les élèves
    const absences = await prisma.absence.findMany({
      where: {
        tenantId,
        date: { gte: debutPeriode, lte: maintenant },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
      select: { eleve: { select: { classeId: true } } },
    });

    const absencesParClasse = new Map<string, number>();
    for (const a of absences) {
      const classeId = a.eleve?.classeId;
      if (classeId) {
        absencesParClasse.set(classeId, (absencesParClasse.get(classeId) ?? 0) + 1);
      }
    }

    return {
      dimension: "par_classe",
      classes: classes.map((c) => ({
        classe: c.nom,
        niveau: c.niveau,
        effectif: c._count.eleves,
        absences30j: absencesParClasse.get(c.id) ?? 0,
        taux: c._count.eleves > 0
          ? Math.round(((absencesParClasse.get(c.id) ?? 0) / (c._count.eleves * 30)) * 1000) / 10
          : 0,
      })),
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

async function analyserProgramme(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string,
  maintenant: Date = new Date()
): Promise<unknown> {
  if (dimension === "couverture_globale") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true, dateDebut: true } }) : null;
    if (!annee) return { dimension: "couverture_globale", message: "Aucune année active" };

    const semaine = semaineScolaire(maintenant, annee.dateDebut);
    const planifs = await prisma.planificationChapitre.findMany({
      where: {
        tenantId,
        anneeId: annee.id,
        ...siteFilterForModel("planificationChapitre", claims),
      },
      select: { statut: true, semaineFin: true },
    });

    const dus = planifs.filter((p) => p.semaineFin <= semaine);
    const traites = dus.filter((p) => p.statut === "TRAITE").length;
    const enCours = dus.filter((p) => p.statut === "EN_COURS").length;
    const enRetard = dus.filter((p) => p.statut === "PREVU").length;
    const couverture = dus.length > 0 ? Math.round((traites / dus.length) * 100) : 100;

    return {
      dimension: "couverture_globale",
      semaine,
      couverture,
      chapitresDus: dus.length,
      traites,
      enCours,
      enRetard,
    };
  }

  if (dimension === "retards") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true, dateDebut: true } }) : null;
    if (!annee) return { dimension: "retards", message: "Aucune année active" };

    const semaine = semaineScolaire(maintenant, annee.dateDebut);
    const retards = await prisma.planificationChapitre.findMany({
      where: {
        tenantId,
        anneeId: annee.id,
        ...siteFilterForModel("planificationChapitre", claims),
        statut: "PREVU",
        semaineFin: { lt: semaine },
      },
      select: {
        chapitre: { select: { nom: true, matiere: { select: { nom: true } } } },
        semaineFin: true,
      },
    });

    return {
      dimension: "retards",
      nombreRetards: retards.length,
      retards: retards.map((r) => ({
        chapitre: r.chapitre.nom,
        matiere: r.chapitre.matiere.nom,
        semainePrevue: r.semaineFin,
        semaineActuelle: semaine,
      })),
    };
  }

  if (dimension === "predictions_difficulte") {
    const aId = await anneeActiveId(tenantId);
    const annee = aId ? await prisma.anneesScolaires.findFirst({ where: { id: aId, tenantId }, select: { id: true } }) : null;
    if (!annee) return { dimension: "predictions_difficulte", message: "Aucune année active" };

    const predictions = await prisma.predictionDifficulte.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("predictionDifficulte", claims),
      },
      select: {
        predictionCorrecte: true,
        ecart: true,
        chapitre: { select: { nom: true, matiere: { select: { nom: true } } } },
      },
    });

    const total = predictions.length;
    const correctes = predictions.filter((p) => p.predictionCorrecte === true).length;
    const incorrectes = predictions.filter((p) => p.predictionCorrecte === false).length;
    const enAttente = predictions.filter((p) => p.predictionCorrecte === null).length;
    const precision = total > 0 ? Math.round((correctes / total) * 100) : 0;

    return {
      dimension: "predictions_difficulte",
      totalPredictions: total,
      correctes,
      incorrectes,
      enAttente,
      precision,
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

async function analyserFinances(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const anneeId = await anneeActiveId(tenantId);
  if (dimension === "impayes_total") {
    const facturesImpayees = await prisma.facture.findMany({
      where: {
        tenantId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        ...(anneeId ? { anneeId } : {}),
        ...siteFilterForModel("facture", claims),
      },
      select: { montant: true },
    });
    const total = facturesImpayees.reduce((s, f) => s + (f.montant ?? 0), 0);
    return {
      dimension: "impayes_total",
      nombreImpayes: facturesImpayees.length,
      montantTotal: total,
    };
  }

  if (dimension === "impayes_par_classe") {
    const factures = await prisma.facture.findMany({
      where: {
        tenantId,
        statut: { in: ["EN_ATTENTE", "EN_RETARD"] },
        ...(anneeId ? { anneeId } : {}),
        ...siteFilterForModel("facture", claims),
      },
      select: {
        montant: true,
        eleve: { select: { classe: { select: { nom: true, niveau: true } } } },
      },
    });
    const parClasse = new Map<string, { nombre: number; montant: number }>();
    for (const f of factures) {
      const nom = f.eleve?.classe?.nom ?? "Non assigné";
      const existing = parClasse.get(nom) ?? { nombre: 0, montant: 0 };
      existing.nombre++;
      existing.montant += f.montant ?? 0;
      parClasse.set(nom, existing);
    }
    return {
      dimension: "impayes_par_classe",
      classes: [...parClasse.entries()].map(([classe, { nombre, montant }]) => ({
        classe,
        nombreImpayes: nombre,
        montantTotal: montant,
      })),
    };
  }

  return { dimension, message: "Analyse en cours de développement pour cette dimension." };
}

async function comparerSites(
  tenantId: string,
  _claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const sites = await prisma.site.findMany({
    where: { tenantId },
    select: {
      id: true,
      nom: true,
      _count: {
        select: {
          eleves: { where: { statut: "ACTIF", deletedAt: null } },
        },
      },
    },
  });

  if (dimension === "effectifs") {
    return {
      dimension: "effectifs",
      sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    };
  }

  return {
    dimension,
    sites: sites.map((s) => ({ site: s.nom, effectif: s._count.eleves })),
    message: "Comparaison détaillée en cours de développement.",
  };
}

// ---------------------------------------------------------------------------
// Fonctions d'exécution des 14 nouveaux outils fermés
// ---------------------------------------------------------------------------

async function analyserIntelligence(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "indices_complets") {
    const tableau = await tableauIntelligenceDirecteur(tenantId, claims);
    return { dimension: "indices_complets", tableau };
  }

  if (dimension === "isp") {
    const isp = await calculerISP(tenantId, claims);
    return { dimension: "isp", isp };
  }

  if (dimension === "ivf") {
    const ivf = await calculerIVF(tenantId, claims);
    return { dimension: "ivf", ivf };
  }

  if (dimension === "ics") {
    const ics = await calculerICS(tenantId, claims);
    return { dimension: "ics", ics };
  }

  return { dimension, message: "Dimension non reconnue pour l'intelligence." };
}

async function analyserRisqueDecrochage(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const synthese = await calculerRisqueDecrochage(tenantId, claims);

  if (dimension === "synthese") {
    return {
      dimension: "synthese",
      totalEleves: synthese.totalEleves,
      risqueEleve: synthese.risqueEleve,
      risqueModere: synthese.risqueModere,
      risqueFaible: synthese.risqueFaible,
      decrochageSilencieux: synthese.decrochageSilencieux,
    };
  }

  if (dimension === "eleves_risque_eleve") {
    const elevesRisqueEleve = synthese.eleves.filter((e) => e.niveau === "ELEVE");
    return {
      dimension: "eleves_risque_eleve",
      nombre: elevesRisqueEleve.length,
      eleves: elevesRisqueEleve.map((e) => ({
        classeNom: e.classeNom,
        niveau: e.niveau,
        decrochageSilencieux: e.decrochageSilencieux,
        moyenneActuelle: e.moyenneActuelle,
        signaux: e.signaux,
      })),
    };
  }

  if (dimension === "decrochage_silencieux") {
    const silencieux = synthese.eleves.filter((e) => e.decrochageSilencieux);
    return {
      dimension: "decrochage_silencieux",
      nombre: silencieux.length,
      eleves: silencieux.map((e) => ({
        classeNom: e.classeNom,
        niveau: e.niveau,
        moyenneActuelle: e.moyenneActuelle,
        signaux: e.signaux,
      })),
    };
  }

  return { dimension, message: "Dimension non reconnue pour le risque de décrochage." };
}

async function simulerRemediationOutil(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  const resultat = await simulerRemediation(tenantId, claims);

  if (dimension === "scenarios_priorises") {
    return {
      dimension: "scenarios_priorises",
      scenarios: resultat.scenariosPriorises,
    };
  }

  if (dimension === "impact_total") {
    return {
      dimension: "impact_total",
      totalElevesARisque: resultat.totalElevesARisque,
      totalElevesSauvables: resultat.totalElevesSauvables,
      coutTotalOptimal: resultat.coutTotalOptimal,
      deltaMoyenParType: resultat.deltaMoyenParType,
    };
  }

  return { dimension, message: "Dimension non reconnue pour la simulation de remédiation." };
}

async function analyserEfficacitePedagogique(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "efficacite_plans") {
    const efficacite = await analyserEfficacitePlans(tenantId, claims);
    return { dimension: "efficacite_plans", efficacite };
  }

  if (dimension === "progression_enseignants") {
    const enseignants = await analyserEfficaciteEnseignants(tenantId, claims);
    return { dimension: "progression_enseignants", enseignants };
  }

  if (dimension === "types_intervention") {
    const types = await comparerTypesIntervention(tenantId, claims);
    return { dimension: "types_intervention", types };
  }

  if (dimension === "adoption_ia") {
    const adoption = await mesurerAdoptionIA(tenantId, claims);
    return { dimension: "adoption_ia", adoption };
  }

  return { dimension, message: "Dimension non reconnue pour l'efficacité pédagogique." };
}

async function analyserGrapheCurriculum(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "noeuds_critiques") {
    const noeuds = await identifierNoeudsCritiques(tenantId, claims);
    return { dimension: "noeuds_critiques", noeuds };
  }

  if (dimension === "validation_prerequis") {
    const validations = await validerPrerequisEmpiriquement(tenantId, claims);
    return { dimension: "validation_prerequis", validations };
  }

  return { dimension, message: "Dimension non reconnue pour le graphe curriculum." };
}

async function analyserFinanceIntelligence(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "risque_familles") {
    const risque = await calculerRisqueFamilles(tenantId, claims);
    return { dimension: "risque_familles", risque };
  }

  if (dimension === "cout_par_eleve") {
    const cout = await calculerCoutParEleve(tenantId, claims);
    return { dimension: "cout_par_eleve", cout };
  }

  if (dimension === "depassements_budget") {
    const depassements = await analyserDepassementsBudget(tenantId, claims);
    return { dimension: "depassements_budget", depassements };
  }

  if (dimension === "efficacite_relances") {
    const relances = await analyserEfficaciteRelances(tenantId, claims);
    return { dimension: "efficacite_relances", relances };
  }

  if (dimension === "delai_paiement") {
    const delai = await calculerDelaiPaiement(tenantId, claims);
    return { dimension: "delai_paiement", delai };
  }

  if (dimension === "taux_admission") {
    const taux = await calculerTauxAdmission(tenantId, claims);
    return { dimension: "taux_admission", taux };
  }

  return { dimension, message: "Dimension non reconnue pour l'intelligence financière." };
}

async function analyserEngagementParental(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "correlation_mastery") {
    const correlation = await analyserCorrelationEngagement(tenantId, claims);
    return { dimension: "correlation_mastery", correlation };
  }

  if (dimension === "questions_frequentes") {
    const questions = await analyserQuestionsFrequentes(tenantId, claims);
    return { dimension: "questions_frequentes", questions };
  }

  if (dimension === "impact_alertes") {
    const impact = await analyserImpactAlertePaiement(tenantId, claims);
    return { dimension: "impact_alertes", impact };
  }

  if (dimension === "validation_lien") {
    const validation = await analyserTauxValidationLien(tenantId, claims);
    return { dimension: "validation_lien", validation };
  }

  return { dimension, message: "Dimension non reconnue pour l'engagement parental." };
}

async function analyserCouverture(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "taux_couverture") {
    const taux = await calculerTauxCouverture(tenantId, claims);
    return { dimension: "taux_couverture", taux };
  }

  if (dimension === "creneaux_orphelins") {
    const creneaux = await identifierCreneauxOrphelins(tenantId, claims);
    return { dimension: "creneaux_orphelins", creneaux };
  }

  if (dimension === "priorisation") {
    const priorisation = await prioriserRemplacements(tenantId, claims);
    return { dimension: "priorisation", priorisation };
  }

  if (dimension === "salles_goulot") {
    const salles = await identifierSallesGoulot(tenantId, claims);
    return { dimension: "salles_goulot", salles };
  }

  return { dimension, message: "Dimension non reconnue pour la couverture des remplacements." };
}

async function analyserCourbeOubli(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "demi_vie") {
    const courbe = await calculerCourbeOubli(tenantId, claims);
    return { dimension: "demi_vie", courbe };
  }

  if (dimension === "alerte_vacances") {
    const alerte = await genererAlerteVacances(tenantId, claims);
    return { dimension: "alerte_vacances", alerte };
  }

  return { dimension, message: "Dimension non reconnue pour la courbe d'oubli." };
}

async function analyserEquite(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "besoins_speciaux") {
    const besoins = await analyserBesoinsSpeciauxInterventions(tenantId, claims);
    return { dimension: "besoins_speciaux", besoins };
  }

  if (dimension === "equite_inter_site") {
    const equite = await analyserEquiteInterSite(tenantId, claims);
    return { dimension: "equite_inter_site", equite };
  }

  if (dimension === "representation_genre") {
    const genre = await analyserRepresentationGenre(tenantId, claims);
    return { dimension: "representation_genre", genre };
  }

  if (dimension === "internes_externes") {
    const comparaison = await comparerInternesExternes(tenantId, claims);
    return { dimension: "internes_externes", comparaison };
  }

  return { dimension, message: "Dimension non reconnue pour l'équité et l'inclusion." };
}

async function analyserTrajectoires(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "ecart_genre") {
    const ecart = await analyserEcartGenre(tenantId, claims);
    return { dimension: "ecart_genre", ecart };
  }

  if (dimension === "boursiers") {
    const boursiers = await comparerBoursiers(tenantId, claims);
    return { dimension: "boursiers", boursiers };
  }

  if (dimension === "redoublement") {
    const redoublement = await analyserEfficaciteRedoublement(tenantId, claims);
    return { dimension: "redoublement", redoublement };
  }

  if (dimension === "motifs_transfert") {
    const motifs = await analyserMotifsTransfert(tenantId, claims);
    return { dimension: "motifs_transfert", motifs };
  }

  if (dimension === "diplomation") {
    const diplomation = await calculerProbabiliteDiplomation(tenantId, claims);
    return { dimension: "diplomation", diplomation };
  }

  if (dimension === "remplissage_classes") {
    const remplissage = await predireRemplissageClasses(tenantId, claims);
    return { dimension: "remplissage_classes", remplissage };
  }

  return { dimension, message: "Dimension non reconnue pour les trajectoires et cohortes." };
}

async function analyserClustering(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "clusters") {
    const clusters = await clustererEleves(tenantId, claims);
    return { dimension: "clusters", clusters };
  }

  if (dimension === "tutorat") {
    const tutorat = await apparierTutorat(tenantId, claims);
    return { dimension: "tutorat", tutorat };
  }

  return { dimension, message: "Dimension non reconnue pour le clustering d'élèves." };
}

async function analyserClimat(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "correlation_infirmerie") {
    const correlation = await analyserCorrelationInfirmerie(tenantId, claims);
    return { dimension: "correlation_infirmerie", correlation };
  }

  if (dimension === "hotspots_incidents") {
    const hotspots = await identifierHotspotsIncidents(tenantId, claims);
    return { dimension: "hotspots_incidents", hotspots };
  }

  if (dimension === "efficacite_entretiens") {
    const entretiens = await analyserEfficaciteEntretiens(tenantId, claims);
    return { dimension: "efficacite_entretiens", entretiens };
  }

  if (dimension === "notification_parents") {
    const notification = await analyserNotificationParents(tenantId, claims);
    return { dimension: "notification_parents", notification };
  }

  return { dimension, message: "Dimension non reconnue pour le climat et le bien-être." };
}

async function analyserAlumni(
  tenantId: string,
  claims: SessionSiteClaims,
  dimension: string
): Promise<unknown> {
  if (dimension === "reussite_superieure") {
    const reussite = await analyserReussiteSuperieure(tenantId, claims);
    return { dimension: "reussite_superieure", reussite };
  }

  if (dimension === "insertion_par_filiere") {
    const insertion = await analyserInsertionParFiliere(tenantId, claims);
    return { dimension: "insertion_par_filiere", insertion };
  }

  if (dimension === "reseau_alumni") {
    const reseau = await analyserReseauAlumni(tenantId, claims);
    return { dimension: "reseau_alumni", reseau };
  }

  return { dimension, message: "Dimension non reconnue pour les alumni." };
}
