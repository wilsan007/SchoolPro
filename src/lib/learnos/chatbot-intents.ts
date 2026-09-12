import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition, AiMessage } from "@/lib/ai/provider";
import type { SessionSiteClaims } from "@/lib/site-scope";
import { executeAiQuery, getSchemaForRole } from "@/lib/learnos/ai-query-engine";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

import { nettoyerReponse, CONSIGNE_SYSTEME, CONSIGNE_FORMULATION } from "./chatbot-formatter";
import {
  analyserEffectifs,
  analyserNotes,
  analyserAbsences,
  analyserProgramme,
  analyserFinances,
  comparerSites,
} from "./chatbot-queries";
import {
  analyserIntelligence,
  analyserRisqueDecrochage,
  simulerRemediationOutil,
  analyserEfficacitePedagogique,
  analyserGrapheCurriculum,
  analyserFinanceIntelligence,
  analyserEngagementParental,
  analyserCouverture,
  analyserCourbeOubli,
  analyserEquite,
  analyserTrajectoires,
  analyserClustering,
  analyserClimat,
  analyserAlumni,
} from "./chatbot-analytics";

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
