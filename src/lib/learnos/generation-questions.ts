/**
 * EcolPro / LEARNOS — Génération d'énoncés (P8)
 * =============================================
 *
 * Remplit la banque de questions à partir du curriculum : une compétence, un
 * palier, un format, et le modèle rédige des énoncés structurés.
 *
 * CE QUE LA GÉNÉRATION NE DÉCIDE PAS
 * ----------------------------------
 * Elle ne choisit **jamais** ce qu'un élève doit travailler. Ce choix reste un
 * parcours de graphe déterministe (`exercice-selector`), pour qu'un même profil
 * produise toujours le même parcours et qu'on puisse le justifier devant un
 * parent. Le modèle n'intervient qu'ici, en amont, pour *rédiger* — et le
 * dispositif tourne sans lui, sur les questions saisies à la main.
 *
 * TROIS GARDE-FOUS, DANS CET ORDRE
 * --------------------------------
 *
 * **1. La sortie est validée, pas crue.** Un modèle produit du JSON plausible,
 * pas du JSON correct : réponse absente des propositions, étape sans énoncé,
 * appariement à une seule paire. Tout passe par `parseStructure`, et ce qui ne
 * passe pas est jeté. Écrire en base une structure invalide la ferait
 * découvrir par un élève au milieu d'un exercice.
 *
 * **2. Rien n'est écrasé.** La génération n'ajoute que des lignes. Une question
 * relue par un enseignant ne peut pas être remplacée par une régénération.
 *
 * **3. Ce qui n'est pas relu vaut moins.** Les questions arrivent servables
 * mais marquées `origine: "ia"` sans relecture : la preuve qu'elles produisent
 * est décotée (`FACTEUR_QUESTION_NON_RELUE`). Les mettre en quarantaine à la
 * place ferait dépendre tout l'entraînement d'une file d'attente que personne
 * ne viderait — la banque resterait vide et le dispositif ne servirait jamais.
 */

import type { FormatQuestion, PalierExercice, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { routeAi } from "@/lib/ai/router";
import type { AiToolDefinition } from "@/lib/ai/provider";
import { type SessionSiteClaims, siteFilterForModel } from "@/lib/site-scope";
import { parseStructure, type StructureQuestion } from "@/lib/learnos/entrainement";
import { FORMATS_AUTO_CORRIGEABLES } from "@/lib/learnos/formats";

/**
 * Version du prompt. Entre dans la clé de cache ET dans `AiDecisionLog`.
 *
 * À incrémenter à CHAQUE modification du texte ci-dessous : sans quoi le cache
 * servirait 24 h durant les sorties de l'ancienne consigne, et le journal
 * attribuerait à la nouvelle des questions qu'elle n'a pas produites.
 */
const VERSION_PROMPT = "questions-v3";

/**
 * Sortie demandée en **appel d'outil**, et non en texte libre.
 *
 * MESURÉ, PAS SUPPOSÉ
 * -------------------
 * En texte libre, le modèle local (llama3.2:3b) a produit un JSON malformé sur
 * la majorité des lots : tableaux mal refermés, enveloppe `structure` omise,
 * sortie coupée en plein milieu. Chaque échec coûtait un appel pour rien. Le
 * problème n'est pas le prompt — c'est qu'on demandait à un modèle de 3
 * milliards de paramètres de tenir une grammaire à la main.
 *
 * Déclarer un outil déplace cette contrainte dans le décodage. Effet de bord
 * voulu : `routeAi` écarte alors les fournisseurs sans function calling
 * (dont Ollama, `supportsTools: false`) et bascule sur le suivant le moins
 * cher. On échange un fournisseur gratuit qui ne rend presque rien contre un
 * palier gratuit qui rend ce qu'on demande.
 *
 * Le schéma reste **permissif** : il cadre l'enveloppe, pas la sémantique.
 * Encoder ici les règles par format (« la bonne réponse n'a pas de champ
 * erreur », « l'ordre attendu doit être une permutation exacte ») dupliquerait
 * `parseStructure`, et les deux finiraient par diverger. L'outil garantit du
 * JSON bien formé ; la validité reste jugée à un seul endroit.
 */
const OUTIL_QUESTIONS: AiToolDefinition = {
  type: "function",
  function: {
    name: "enregistrer_questions",
    description:
      "Enregistre les exercices rédigés dans la banque de questions de l'établissement.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              enonce: {
                type: "string",
                description: "Consigne générale de l'exercice.",
              },
              structure: {
                type: "object",
                properties: {
                  etapes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        enonce: { type: "string" },
                        format: {
                          type: "string",
                          enum: [
                            "SAISIE_COURTE",
                            "CHOIX_UNIQUE",
                            "REMISE_EN_ORDRE",
                            "APPARIEMENT",
                          ],
                        },
                        reponse: {
                          type: "string",
                          description:
                            "Obligatoire sauf pour APPARIEMENT. Valeur exactement " +
                            "comparable : un nombre, un mot, ou un identifiant " +
                            "d'option. Pour REMISE_EN_ORDRE, tous les identifiants " +
                            'dans le bon ordre séparés par "|".',
                        },
                        options: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              texte: { type: "string" },
                              erreur: {
                                type: "string",
                                enum: [
                                  "CONCEPTUAL_ERROR",
                                  "PROCEDURAL_ERROR",
                                  "CALCULATION_ERROR",
                                  "READING_ERROR",
                                  "MISSING_PREREQUISITE",
                                ],
                                description:
                                  "Uniquement sur les MAUVAISES propositions.",
                              },
                            },
                            required: ["id", "texte"],
                          },
                        },
                        paires: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              gauche: { type: "string" },
                              droite: { type: "string" },
                            },
                            required: ["id", "gauche", "droite"],
                          },
                        },
                        indice: { type: "string" },
                        tolerance: { type: "number" },
                        points: { type: "number" },
                      },
                      required: ["enonce", "format", "points"],
                    },
                  },
                },
                required: ["etapes"],
              },
            },
            required: ["enonce", "structure"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

/** Bornes du lot. Au-delà, la sortie du modèle se dégrade et le JSON casse. */
const MAX_PAR_APPEL = 5;

/**
 * Ce qu'un palier demande, en une phrase.
 *
 * Le modèle ne connaît pas la taxonomie LEARNOS : sans ces définitions, il
 * produit des exercices de difficulté arbitraire et le palier calculé par le
 * sélecteur ne veut plus rien dire.
 */
const CONSIGNE_PALIER: Record<PalierExercice, string> = {
  RESTITUTION: "refaire à l'identique ce qui vient d'être montré en cours, sans variation",
  APPLICATION: "appliquer la règle sur un cas voisin de celui du cours, avec un guidage léger",
  CONSOLIDATION: "enchaîner plusieurs étapes sans guidage, sur un cas déjà rencontré",
  TRANSFERT: "réinvestir la notion dans un contexte qui n'a pas été vu en cours",
  OUVERTURE: "un problème ouvert, où plusieurs chemins de résolution sont valides",
};

/**
 * Un exemple COMPLET et correct par format, donné tel quel au modèle.
 *
 * POURQUOI UN EXEMPLE PLUTÔT QU'UN SCHÉMA
 * ---------------------------------------
 * La première version décrivait un schéma générique, avec tous les champs
 * optionnels de tous les formats réunis dans un seul gabarit. Un modèle de 3
 * milliards de paramètres en a tiré du JSON syntaxiquement valide mais sans
 * `reponse` — c'est-à-dire un exercice insoluble, correctement rejeté à la
 * validation, mais un rendement de zéro.
 *
 * Un exemple rempli du format demandé, et de lui seul, supprime le problème à
 * sa racine : il n'y a plus de champ à choisir, seulement un motif à imiter.
 * C'est aussi ce qui permet à un petit modèle local — gratuit — de tenir le
 * rôle, au lieu de forcer le recours à un fournisseur payant.
 */
const EXEMPLE_FORMAT: Partial<Record<FormatQuestion, string>> = {
  SAISIE_COURTE: `{
  "questions": [{
    "enonce": "Calcule 3/4 de 20.",
    "structure": { "etapes": [{
      "enonce": "Combien vaut 3/4 de 20 ?",
      "format": "SAISIE_COURTE",
      "reponse": "15",
      "indice": "Divise d'abord par 4, puis multiplie par 3.",
      "points": 1
    }] }
  }]
}`,
  CHOIX_UNIQUE: `{
  "questions": [{
    "enonce": "Addition de fractions",
    "structure": { "etapes": [{
      "enonce": "Pour additionner 1/3 et 1/4, que fait-on d'abord ?",
      "format": "CHOIX_UNIQUE",
      "options": [
        { "id": "a", "texte": "On met les fractions au même dénominateur" },
        { "id": "b", "texte": "On additionne les numérateurs entre eux et les dénominateurs entre eux", "erreur": "CONCEPTUAL_ERROR" },
        { "id": "c", "texte": "On multiplie les deux fractions", "erreur": "PROCEDURAL_ERROR" }
      ],
      "reponse": "a",
      "points": 1
    }] }
  }]
}`,
  ETAPES_GUIDEES: `{
  "questions": [{
    "enonce": "Calcule 1/3 + 1/4.",
    "structure": { "etapes": [
      {
        "enonce": "Quel dénominateur commun choisis-tu ?",
        "format": "SAISIE_COURTE",
        "reponse": "12",
        "indice": "Multiplie les deux dénominateurs.",
        "points": 1
      },
      {
        "enonce": "Que deviennent les numérateurs ?",
        "format": "CHOIX_UNIQUE",
        "options": [
          { "id": "a", "texte": "4 et 3" },
          { "id": "b", "texte": "1 et 1", "erreur": "CONCEPTUAL_ERROR" },
          { "id": "c", "texte": "3 et 4", "erreur": "CALCULATION_ERROR" }
        ],
        "reponse": "a",
        "points": 1
      },
      {
        "enonce": "Quel est le résultat, sous la forme a/b ?",
        "format": "SAISIE_COURTE",
        "reponse": "7/12",
        "points": 1
      }
    ] }
  }]
}`,
  REMISE_EN_ORDRE: `{
  "questions": [{
    "enonce": "Remets dans l'ordre les étapes du calcul de 1/3 + 1/4.",
    "structure": { "etapes": [{
      "enonce": "Range ces étapes dans le bon ordre.",
      "format": "REMISE_EN_ORDRE",
      "options": [
        { "id": "e1", "texte": "Chercher un dénominateur commun" },
        { "id": "e2", "texte": "Réécrire les deux fractions avec ce dénominateur" },
        { "id": "e3", "texte": "Additionner les numérateurs" },
        { "id": "e4", "texte": "Simplifier le résultat si possible" }
      ],
      "reponse": "e1|e2|e3|e4",
      "points": 1
    }] }
  }]
}`,
  APPARIEMENT: `{
  "questions": [{
    "enonce": "Relie chaque fraction à son écriture décimale.",
    "structure": { "etapes": [{
      "enonce": "Associe chaque fraction au bon nombre décimal.",
      "format": "APPARIEMENT",
      "paires": [
        { "id": "p1", "gauche": "1/2", "droite": "0,5" },
        { "id": "p2", "gauche": "1/4", "droite": "0,25" },
        { "id": "p3", "gauche": "3/5", "droite": "0,6" }
      ],
      "points": 1
    }] }
  }]
}`,
};

/** Règles propres à chaque format, en complément de l'exemple. */
const CONSIGNE_FORMAT: Partial<Record<FormatQuestion, string>> = {
  SAISIE_COURTE: 'UNE seule étape, "format": "SAISIE_COURTE".',
  CHOIX_UNIQUE:
    'UNE seule étape, "format": "CHOIX_UNIQUE", avec 3 ou 4 propositions. ' +
    '"reponse" contient l\'identifiant de la bonne proposition.',
  ETAPES_GUIDEES:
    "De 2 à 4 étapes qui décomposent la résolution, chacune en " +
    '"SAISIE_COURTE" ou "CHOIX_UNIQUE". Chaque étape a sa propre "reponse".',
  REMISE_EN_ORDRE:
    'UNE seule étape, "format": "REMISE_EN_ORDRE". Les "options" sont les étapes ' +
    'd\'un raisonnement, et "reponse" liste TOUS leurs identifiants dans le BON ' +
    'ordre, séparés par "|". N\'oublie aucun identifiant.',
  APPARIEMENT:
    'UNE seule étape, "format": "APPARIEMENT", avec 3 ou 4 "paires". ' +
    'Ne fournis PAS de "reponse" : elle se déduit des paires. ' +
    "Les éléments de droite doivent tous être différents les uns des autres.",
};

const CONSIGNE_SYSTEME = `Tu rédiges des exercices scolaires pour une banque de questions.

Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises de code,
sans commentaire. Tu imites EXACTEMENT la forme de l'exemple qu'on te donne.

Règles impératives :
- Le champ "reponse" est OBLIGATOIRE sur chaque étape, sauf pour le format APPARIEMENT.
  Une étape sans "reponse" est un exercice insoluble : elle sera rejetée.
- "reponse" doit être EXACTEMENT comparable : un nombre, un mot, ou un identifiant
  d'option. Jamais une phrase, jamais une explication, jamais une unité.
- Sur un CHOIX_UNIQUE, la BONNE proposition n'a PAS de champ "erreur". Chaque MAUVAISE
  proposition en porte un, qui dit quelle méprise elle révèle, pris dans :
  CONCEPTUAL_ERROR (la notion est mal comprise), PROCEDURAL_ERROR (la méthode est mal
  appliquée), CALCULATION_ERROR (erreur de calcul), READING_ERROR (l'énoncé a été mal
  lu), MISSING_PREREQUISITE (un acquis antérieur manque). Un distracteur doit
  correspondre à une erreur que des élèves font réellement.
- "options" seulement pour CHOIX_UNIQUE et REMISE_EN_ORDRE ; "paires" seulement pour
  APPARIEMENT. N'ajoute jamais "options" à une étape SAISIE_COURTE.
- "indice" oriente sans donner la réponse. Il est facultatif.
- Pas de LaTeX, pas de Markdown : du texte brut lisible par un collégien.`;

export interface DemandeGeneration {
  competenceId: string;
  palier: PalierExercice;
  format: FormatQuestion;
  nombre: number;
  /** Barème de chaque question produite. */
  bareme?: number;
}

export interface ResultatGeneration {
  /** Questions écrites en banque. */
  creees: { id: string; enonce: string }[];
  /**
   * Questions produites par le modèle mais refusées à la validation.
   *
   * Remontées et non silencieusement ignorées : un taux de rejet qui grimpe
   * signale un prompt ou un modèle à revoir, et c'est la seule façon de le voir.
   */
  rejetees: number;
  /** Traçabilité de l'appel, telle que journalisée dans `AiDecisionLog`. */
  modele: string;
  cached: boolean;
}

/** Sortie brute du modèle, avant toute validation. */
interface QuestionBrute {
  enonce?: unknown;
  structure?: unknown;
  etapes?: unknown;
  format?: unknown;
}

/**
 * Ramène les enveloppes que les modèles produisent réellement à celle attendue.
 *
 * Observé en conditions réelles : à consigne identique, un même modèle renvoie
 * tantôt `{enonce, structure: {etapes: [...]}}`, tantôt `{enonce, etapes: [...]}`,
 * tantôt — pour un exercice à une seule étape — `{enonce, format, reponse}` sans
 * aucune enveloppe. Les trois décrivent le même exercice.
 *
 * On est donc tolérant sur la FORME et strict sur le FOND : cette fonction ne
 * fait que deviner l'emballage, `parseStructure` garde seule le pouvoir de
 * refuser. Rejeter sur l'emballage jetterait des exercices parfaitement
 * corrects et ferait payer un second appel pour rien.
 */
function enveloppe(q: QuestionBrute): unknown {
  if (q.structure && typeof q.structure === "object") return q.structure;
  if (Array.isArray(q.etapes)) return { etapes: q.etapes };
  // Exercice mono-étape aplati : la question EST l'étape.
  if (typeof q.format === "string") return { etapes: [q] };
  return null;
}

/**
 * Objets JSON équilibrés trouvés dans un fragment, dans l'ordre.
 *
 * Suit l'état « dans une chaîne » et les échappements, sans quoi une accolade
 * à l'intérieur d'un énoncé fausserait le comptage. Un dernier objet resté
 * ouvert — cas de la troncature — est simplement ignoré.
 */
function objetsEquilibres(fragment: string): string[] {
  const objets: string[] = [];
  let profondeur = 0;
  let debut = -1;
  let dansChaine = false;
  let echappe = false;

  for (let i = 0; i < fragment.length; i++) {
    const c = fragment[i];

    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }

    if (c === '"') dansChaine = true;
    else if (c === "{") {
      if (profondeur === 0) debut = i;
      profondeur++;
    } else if (c === "}") {
      profondeur--;
      if (profondeur === 0 && debut >= 0) {
        objets.push(fragment.slice(debut, i + 1));
        debut = -1;
      }
    }
  }

  return objets;
}

/**
 * Extrait les questions d'une réponse de modèle, y compris incomplète.
 *
 * DEUX PASSES, ET LA SECONDE COMPTE AUTANT QUE LA PREMIÈRE
 * -------------------------------------------------------
 * La première tente l'objet entier — le cas normal. La seconde n'existe que
 * pour un mode d'échec observé en conditions réelles : le modèle atteint sa
 * limite de jetons en plein milieu du lot. Le JSON devient invalide, et une
 * lecture tout-ou-rien perd alors **le lot entier**, y compris les trois
 * exercices parfaitement rédigés avant la coupure. On récupère donc les objets
 * complets un par un.
 *
 * Ce n'est pas une réparation de JSON — on ne devine rien, on ne referme
 * rien : un objet inachevé est jeté. On ne garde que ce qui était déjà écrit
 * en entier, et `parseStructure` reste seule juge de sa validité.
 */
function extraireQuestions(contenu: string | null): unknown[] {
  if (!contenu) return [];

  const debut = contenu.indexOf("{");
  const fin = contenu.lastIndexOf("}");
  if (debut >= 0 && fin > debut) {
    try {
      const objet = JSON.parse(contenu.slice(debut, fin + 1)) as { questions?: unknown };
      if (Array.isArray(objet.questions)) return objet.questions;
    } catch {
      // Sortie tronquée ou malformée : on passe au repêchage.
    }
  }

  const ancre = contenu.indexOf('"questions"');
  const zone = ancre >= 0 ? contenu.slice(ancre) : contenu;

  return objetsEquilibres(zone)
    .map((brut) => {
      try {
        return JSON.parse(brut);
      } catch {
        return null;
      }
    })
    .filter((q): q is Record<string, unknown> => q !== null && typeof q === "object")
    // L'objet racine `{ "questions": [...] }` peut être équilibré alors que le
    // tableau ne l'est pas : on ne garde que ce qui ressemble à une question.
    .filter((q) => "enonce" in q);
}

/**
 * Génère des questions et les écrit en banque.
 *
 * @throws {Error} si le format demandé n'est pas auto-corrigeable — générer une
 *   rédaction n'aurait aucun sens : personne ne la corrigerait.
 */
export async function genererQuestions(
  tenantId: string,
  claims: SessionSiteClaims,
  demande: DemandeGeneration,
  actorId: string
): Promise<ResultatGeneration> {
  if (!FORMATS_AUTO_CORRIGEABLES.includes(demande.format)) {
    throw new Error(
      `genererQuestions: le format ${demande.format} n'est pas auto-corrigeable — ` +
        `une question générée que personne ne corrige ne sert à rien.`
    );
  }

  const competence = await prisma.competence.findFirst({
    where: {
      id: demande.competenceId,
      tenantId,
      ...siteFilterForModel("competence", claims),
    },
    select: {
      id: true,
      siteId: true,
      libelle: true,
      description: true,
      chapitre: {
        select: { nom: true, niveau: true, matiere: { select: { nom: true } } },
      },
    },
  });
  if (!competence) {
    throw new Error("genererQuestions: compétence introuvable dans votre périmètre.");
  }

  const nombre = Math.min(Math.max(demande.nombre, 1), MAX_PAR_APPEL);

  // Les énoncés déjà en banque sont donnés au modèle pour qu'il ne les
  // reproduise pas. Sans cela, régénérer sur la même compétence renvoie les
  // mêmes exercices, et le sélecteur — qui évite de resservir une question déjà
  // vue — se retrouve sans candidat.
  const existantes = await prisma.question.findMany({
    where: { tenantId, competenceId: competence.id, ...siteFilterForModel("question", claims) },
    select: { enonce: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const consigneUtilisateur = [
    `Matière : ${competence.chapitre?.matiere.nom ?? "non précisée"}`,
    `Niveau : ${competence.chapitre?.niveau ?? "non précisé"}`,
    `Chapitre : ${competence.chapitre?.nom ?? "non précisé"}`,
    `Compétence travaillée : ${competence.libelle}`,
    competence.description ? `Précision : ${competence.description}` : null,
    "",
    `Produis ${nombre} exercice(s) distinct(s).`,
    `Niveau de difficulté attendu : ${CONSIGNE_PALIER[demande.palier]}.`,
    `Format imposé : ${CONSIGNE_FORMAT[demande.format]}`,
    "",
    "Imite EXACTEMENT la forme de cet exemple, en changeant seulement le contenu :",
    EXEMPLE_FORMAT[demande.format] ?? "",
    existantes.length > 0
      ? `\nÉnoncés DÉJÀ en banque, à ne pas reproduire :\n${existantes
          .map((q) => `- ${q.enonce}`)
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const resultat = await routeAi(
    {
      complexity: "complex",
      promptVersion: VERSION_PROMPT,
      action: "question.generate",
      tenantId,
      siteId: competence.siteId,
      inputRef: competence.id,
      actorId,
    },
    [
      { role: "system", content: CONSIGNE_SYSTEME },
      { role: "user", content: consigneUtilisateur },
    ],
    {
      tools: [OUTIL_QUESTIONS],
      // Température basse : on veut des énoncés corrects, pas originaux. La
      // variété vient de la liste d'énoncés à éviter, pas du hasard du décodage.
      temperature: 0.4,
      // Proportionnel au lot, et large. Une sortie tronquée reste du JSON
      // invalide : sans marge, le lot ENTIER est perdu, y compris les exercices
      // déjà correctement rédigés avant la coupure. C'est le mode d'échec le
      // plus coûteux du module — observé avec un plafond fixe à 2000 sur des
      // étapes guidées par ailleurs valides.
      maxTokens: 1200 + nombre * 900,
    }
  );

  // L'appel d'outil est le chemin normal ; le texte reste lu en repli, pour le
  // cas où un fournisseur répondrait en clair malgré l'outil déclaré.
  const proposees = (
    resultat.toolCalls.length > 0
      ? extraireQuestions(resultat.toolCalls[0].arguments)
      : extraireQuestions(resultat.content)
  ) as QuestionBrute[];

  const valides: { enonce: string; structure: StructureQuestion }[] = [];
  for (const q of proposees) {
    if (typeof q?.enonce !== "string" || q.enonce.trim() === "") continue;
    const structure = parseStructure(enveloppe(q));
    if (!structure) continue;
    // Le format demandé et le format produit doivent coïncider : une question
    // rangée sous un format qu'elle n'a pas serait servie par le mauvais écran.
    if (!formatConforme(demande.format, structure)) continue;
    valides.push({ enonce: q.enonce.trim(), structure });
  }

  const creees: { id: string; enonce: string }[] = [];
  for (const q of valides) {
    const ligne = await prisma.question.create({
      data: {
        tenantId,
        siteId: competence.siteId,
        competenceId: competence.id,
        palier: demande.palier,
        format: demande.format,
        enonce: q.enonce,
        structure: q.structure as unknown as Prisma.InputJsonValue,
        bareme: demande.bareme ?? q.structure.etapes.reduce((s, e) => s + e.points, 0),
        origine: "ia",
        actif: true,
      },
      select: { id: true, enonce: true },
    });
    creees.push(ligne);
  }

  return {
    creees,
    rejetees: proposees.length - valides.length,
    modele: `${resultat.meta.providerName}/${resultat.meta.modelName}`,
    cached: resultat.meta.cached,
  };
}

/** Le format annoncé correspond-il à ce que la structure contient réellement ? */
function formatConforme(format: FormatQuestion, structure: StructureQuestion): boolean {
  const etapes = structure.etapes;
  if (format === "ETAPES_GUIDEES") return etapes.length >= 2;
  // Les autres formats sont mono-étape, et l'étape doit porter leur nom.
  return etapes.length === 1 && etapes[0].format === format;
}
