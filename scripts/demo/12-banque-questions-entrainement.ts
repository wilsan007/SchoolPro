/**
 * Démo — étape 12 : banque de questions auto-corrigeables pour l'entraînement.
 *
 * CE QUI MANQUAIT (cause racine du « une seule question en boucle »)
 * L'entraînement autonome ne sert QUE les questions au format auto-corrigeable
 * dotées d'une `structure` JSON valide (QCM, saisie courte, étapes guidées).
 * La banque générée ne contenait que des placeholders sans structure : sur
 * PHILO 1ère, 30 questions sur 32 étaient inutilisables, et les séances se
 * recomposaient sans fin avec les mêmes deux QCM.
 *
 * CE QUE FAIT LE SCRIPT
 * Pour les 5 matières suivies (MATH, FR, PC/chimie, SVT, PHILO) × les niveaux
 * 2nde et 1ère : 3 questions auto-corrigeées par compétence —
 *   RESTITUTION   → QCM à 4 propositions, distracteurs annotés ;
 *   APPLICATION   → saisie courte (valeur, terme, symbole) ;
 *   CONSOLIDATION → étapes guidées (démarche en 2-3 temps).
 * Le contenu suit les chapitres du programme (libellés mis à jour pour les
 * compétences encore génériques). Origine « humain » : rien à relire.
 *
 * DÉTERMINISTE ET IDEMPOTENT : identifiants `q-bq-*`, createMany skipDuplicates.
 *
 *   pnpm exec tsx scripts/demo/12-banque-questions-entrainement.ts
 */

import { PrismaClient, Prisma, PalierExercice, FormatQuestion } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT = "tenant-ambouli";
const SITE = "site-ambouli";

// ─────────────────────────────────────────────────────────────────────
// Fabrique de structures — le schéma attendu par parseStructure
// ─────────────────────────────────────────────────────────────────────

type Erreur = "CONCEPTUAL_ERROR" | "PROCEDURAL_ERROR" | "CALCULATION_ERROR" | "MISINTERPRETATION";

interface QcmSpec {
  /** Énoncé de la situation. */
  e: string;
  /** Propositions (2 ou 4). */
  o: string[];
  /** Index de la bonne réponse. */
  b: number;
  /** Types d'erreur des distracteurs, alignés sur `o` (null = bonne réponse). */
  err?: (Erreur | null)[];
}

interface SaisieSpec {
  e: string;
  /** Réponse attendue (comparaison insensible à la casse / espaces). */
  r: string;
}

interface EtapeSpec {
  e: string;
  f: "SAISIE_COURTE" | "CHOIX_UNIQUE";
  /** Pour SAISIE_COURTE : la réponse. Pour CHOIX_UNIQUE : les propositions. */
  r?: string;
  o?: string[];
  b?: number;
}

interface Sujet {
  qcm: QcmSpec;
  saisie: SaisieSpec;
  etapes: EtapeSpec[];
}

/** Identifiants de propositions stables a, b, c, d… */
const IDS = ["a", "b", "c", "d", "e"];

function structureQcm(q: QcmSpec) {
  return {
    etapes: [
      {
        enonce: q.e,
        format: "CHOIX_UNIQUE",
        options: q.o.map((texte, i) => ({
          id: IDS[i],
          texte,
          ...(i !== q.b && q.err?.[i] ? { erreur: q.err[i] } : {}),
        })),
        reponse: IDS[q.b],
        points: 1,
      },
    ],
  };
}

function structureSaisie(s: SaisieSpec) {
  return {
    etapes: [
      { enonce: s.e, format: "SAISIE_COURTE", reponse: s.r, points: 1 },
    ],
  };
}

function structureEtapes(etapes: EtapeSpec[]) {
  return {
    etapes: etapes.map((e) => ({
      enonce: e.e,
      format: e.f,
      ...(e.f === "SAISIE_COURTE"
        ? { reponse: e.r }
        : { options: e.o!.map((texte, i) => ({ id: IDS[i], texte })), reponse: IDS[e.b!] }),
      points: 1,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Renommages — chapitres et compétences encore génériques du curriculum
// ─────────────────────────────────────────────────────────────────────

const RENOMMAGES_COMPETENCES: Record<string, string> = {
  "comp-MATH-2nde-1-3": "Écriture scientifique",
  "comp-FR-2nde-1-3": "Le narrateur et les points de vue",
  "comp-FR-2nde-2-3": "Les niveaux de langue",
  "comp-FR-1ere-1-3": "Argumenter et illustrer",
  "comp-FR-1ere-2-2": "Le personnage de roman",
  "comp-FR-1ere-2-3": "Les thèmes du roman du XXe siècle",
  "comp-PC-2nde-1-3": "La liaison chimique",
  "comp-PC-2nde-2-3": "Les interactions mécaniques",
  "comp-PC-1ere-1-3": "Acidité et pH",
  "comp-PC-1ere-2-3": "Puissance et rendement énergétique",
  "comp-PHILO-2nde-1-1": "Nature et culture",
  "comp-PHILO-2nde-1-2": "La fonction de l'art",
  "comp-PHILO-2nde-1-3": "Culture et aliénation",
  "comp-PHILO-2nde-2-1": "Besoin et désir",
  "comp-PHILO-2nde-2-2": "La personne et l'individu",
  "comp-PHILO-2nde-2-3": "La justice",
  "comp-PHILO-1ere-1-1": "Contrainte et liberté",
  "comp-PHILO-1ere-1-2": "Liberté et responsabilité",
  "comp-PHILO-1ere-1-3": "Le libre arbitre",
  "comp-PHILO-1ere-2-1": "Devoir et inclination",
  "comp-PHILO-1ere-2-2": "Le devoir kantien",
  "comp-PHILO-1ere-2-3": "Devoir et bonheur",
  "comp-SVT-2nde-1-3": "Le métabolisme cellulaire",
  "comp-SVT-2nde-2-3": "Les arbres généalogiques",
  "comp-SVT-1ere-1-3": "L'arbre phylogénétique",
  "comp-SVT-1ere-2-1": "Le cycle ovarien",
  "comp-SVT-1ere-2-2": "Fécondation et développement",
  "comp-SVT-1ere-2-3": "Les méthodes de contraception",
};

const RENOMMAGES_CHAPITRES: Record<string, string> = {
  "chap-PHILO-2nde-1": "La culture",
  "chap-PHILO-2nde-2": "L'individu et la société",
  "chap-PHILO-1ere-1": "La liberté",
  "chap-PHILO-1ere-2": "Le devoir",
};

// ─────────────────────────────────────────────────────────────────────
// Catalogue — 3 sujets par compétence (QCM + saisie + étapes guidées)
// ─────────────────────────────────────────────────────────────────────

const BANQUE: Record<string, Sujet> = {
  // ══ MATH 2nde ══════════════════════════════════════════════════════
  "comp-MATH-2nde-1-1": {
    qcm: {
      e: "Dans quel ensemble le nombre √2 se classe-t-il ?",
      o: ["ℕ (entiers naturels)", "ℚ (nombres rationnels)", "ℤ (entiers relatifs)", "ℝ\\ℚ (irrationnels)"],
      b: 3,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Donner le plus grand entier naturel strictement inférieur à 7,5 :", r: "7" },
    etapes: [
      { e: "De quel ensemble le nombre −3 est-il membre (sigle seul) ?", f: "SAISIE_COURTE", r: "Z" },
      { e: "4/2 appartient-il à ℚ ? Répondre « oui » ou « non ».", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-MATH-2nde-1-2": {
    qcm: {
      e: "L'ensemble des réels strictement compris entre −2 et 5 s'écrit :",
      o: ["[−2 ; 5]", "]-2 ; 5[", "]-∞ ; 5[", "]-2 ; 5]"],
      b: 1,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Résoudre x − 3 = 0. Donner x :", r: "3" },
    etapes: [
      { e: "Résoudre 2x = 8. Donner x :", f: "SAISIE_COURTE", r: "4" },
      { e: "Résoudre x + 5 = 0. Donner x :", f: "SAISIE_COURTE", r: "-5" },
    ],
  },
  "comp-MATH-2nde-1-3": {
    qcm: {
      e: "L'écriture scientifique de 0,0042 est :",
      o: ["4,2 × 10⁻³", "42 × 10⁻⁴", "0,42 × 10⁻²", "4,2 × 10³"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Écrire 10⁻² sous forme décimale (avec virgule) :", r: "0,01" },
    etapes: [
      { e: "3 500 en écriture scientifique : donner la mantisse (avec virgule) :", f: "SAISIE_COURTE", r: "3,5" },
      { e: "Donner l'exposant de l'écriture scientifique de 3 500 :", f: "SAISIE_COURTE", r: "3" },
    ],
  },
  "comp-MATH-2nde-2-1": {
    qcm: {
      e: "La fonction x ↦ x² est strictement décroissante sur l'intervalle :",
      o: ["[0 ; +∞[", "]-∞ ; 0[", "]-∞ ; +∞[", "[−1 ; 1]"],
      b: 1,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Soit f(x) = x². Donner f(−3) :", r: "9" },
    etapes: [
      { e: "Donner f(4) :", f: "SAISIE_COURTE", r: "16" },
      { e: "f(x) = √x : donner le plus petit entier de son domaine de définition :", f: "SAISIE_COURTE", r: "0" },
    ],
  },
  "comp-MATH-2nde-2-2": {
    qcm: {
      e: "La courbe de g croise l'axe des abscisses en x = 2 et x = 5. Les solutions de g(x) = 0 sont :",
      o: ["{2 ; 5}", "{−2 ; −5}", "{0}", "Aucune solution réelle"],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Soit h(x) = x − 3. Donner la solution de h(x) = 0 :", r: "3" },
    etapes: [
      { e: "k(x) = 2x + 4 : donner la solution de k(x) = 0 :", f: "SAISIE_COURTE", r: "-2" },
      { e: "Une courbe coupe l'axe des abscisses en x = −1. Écrire cette solution (avec le signe) :", f: "SAISIE_COURTE", r: "-1" },
    ],
  },
  "comp-MATH-2nde-2-3": {
    qcm: {
      e: "L'image de 49 par la fonction racine carrée est :",
      o: ["7", "8", "16", "24,5"],
      b: 0,
      err: ["CALCULATION_ERROR", "CALCULATION_ERROR", "CALCULATION_ERROR"],
    },
    saisie: { e: "Donner la valeur de √81 :", r: "9" },
    etapes: [
      { e: "g(x) = |x| : donner g(−7) :", f: "SAISIE_COURTE", r: "7" },
      { e: "Donner g(3) :", f: "SAISIE_COURTE", r: "3" },
    ],
  },
  "cmt9p788x001lzbsv0kqbitpu": {
    qcm: {
      e: "u et v sont colinéaires. Quelle relation les relie forcément ?",
      o: ["u = k·v avec k réel", "u ⟂ v", "|u| = |v|", "u et v ont le même sens"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Deux vecteurs de même direction, même sens et même longueur sont dits (un mot) :", r: "égaux" },
    etapes: [
      { e: "A(1 ; 1) et B(4 ; 5) : donner la composante horizontale du vecteur AB :", f: "SAISIE_COURTE", r: "3" },
      { e: "Donner la composante verticale du vecteur AB :", f: "SAISIE_COURTE", r: "4" },
    ],
  },
  "cmt9p78zc001nzbsvfwixeutb": {
    qcm: {
      e: "A(2 ; −1) et B(5 ; 3). Le vecteur AB a pour coordonnées :",
      o: ["(3 ; 4)", "(−3 ; −4)", "(7 ; 2)", "(2 ; 7)"],
      b: 0,
      err: ["CALCULATION_ERROR", "CALCULATION_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "M(3 ; 5), N(3 ; 1) : donner la composante horizontale de MN :", r: "0" },
    etapes: [
      { e: "O(0 ; 0), A(4 ; 2) : donner la composante horizontale de OA :", f: "SAISIE_COURTE", r: "4" },
      { e: "Donner la composante verticale de OA :", f: "SAISIE_COURTE", r: "2" },
    ],
  },
  "cmt9p7ag9001pzbsvtn1an3va": {
    qcm: {
      e: "Série triée : 2 ; 4 ; 6 ; 8 ; 10 ; 12. Sa médiane vaut :",
      o: ["7", "6", "8", "49"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "CALCULATION_ERROR"],
    },
    saisie: { e: "Série : 1 ; 3 ; 5 ; 7. Donner le premier quartile Q1 :", r: "2" },
    etapes: [
      { e: "Série : 2 ; 4 ; 6 ; 8 ; 10. Donner la médiane :", f: "SAISIE_COURTE", r: "6" },
      { e: "Médiane retirée, donner la médiane du groupe inférieur {2 ; 4} :", f: "SAISIE_COURTE", r: "3" },
    ],
  },
  "cmt9p7b78001rzbsv0c6emoah": {
    qcm: {
      e: "Que signifie un écart-type nul ?",
      o: [
        "Toutes les valeurs sont identiques",
        "La moyenne est nulle",
        "Les valeurs sont très dispersées",
        "La série contient une valeur aberrante",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Deux séries de même moyenne : laquelle est la plus dispersée, écart-type 2 ou 5 ? Donner la valeur :", r: "5" },
    etapes: [
      { e: "Toutes les valeurs d'une série valent 7. Donner sa variance :", f: "SAISIE_COURTE", r: "0" },
      { e: "Donner son écart-type :", f: "SAISIE_COURTE", r: "0" },
    ],
  },

  // ══ MATH 1ère ══════════════════════════════════════════════════════
  "comp-MATH-1ere-1-1": {
    qcm: {
      e: "La dérivée de x ↦ x³ est :",
      o: ["3x²", "x²", "3x", "x⁴/4"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "f(x) = 5x. Donner f'(2) :", r: "5" },
    etapes: [
      { e: "g(x) = x². Écrire g'(x) = a·x : donner a :", f: "SAISIE_COURTE", r: "2" },
      { e: "h(x) = 7x. Écrire h'(x) = b : donner b :", f: "SAISIE_COURTE", r: "7" },
    ],
  },
  "comp-MATH-1ere-1-2": {
    qcm: {
      e: "f(x) = x² − 6x + 5. Que peut-on affirmer grâce à la dérivée ?",
      o: [
        "f possède un minimum en x = 3",
        "f est toujours décroissante",
        "f possède un maximum en x = 3",
        "f est constante",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "f(x) = x² − 6x + 5. Donner l'abscisse où f'(x) = 0 :", r: "3" },
    etapes: [
      { e: "f'(x) = 3x − 3. Résoudre f'(x) = 0 : donner x :", f: "SAISIE_COURTE", r: "1" },
      { e: "Sur [2 ; 4], f(x) = x²/2 a une dérivée positive : croissante (« oui ») ou décroissante (« non ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-MATH-1ere-1-3": {
    qcm: {
      e: "Rectangle de périmètre 24 cm : son aire est maximale lorsque ses côtés mesurent :",
      o: ["6 cm et 6 cm", "4 cm et 8 cm", "3 cm et 9 cm", "2 cm et 10 cm"],
      b: 0,
      err: ["CALCULATION_ERROR", "CALCULATION_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Donner l'aire d'un carré de côté 5 cm (en cm²) :", r: "25" },
    etapes: [
      { e: "Périmètre 24 : si un côté vaut x, exprimer l'autre côté :", f: "SAISIE_COURTE", r: "12-x" },
      { e: "A(x) = x(12 − x) est maximale en x = ? Donner cette valeur :", f: "SAISIE_COURTE", r: "6" },
    ],
  },
  "comp-MATH-1ere-2-1": {
    qcm: {
      e: "Suite arithmétique de raison 3 avec u₀ = 2. Le terme u₃ vaut :",
      o: ["11", "9", "12", "8"],
      b: 0,
      err: ["CALCULATION_ERROR", "CALCULATION_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Suite arithmétique : u₀ = 5, raison 2. Donner u₂ :", r: "9" },
    etapes: [
      { e: "uₙ = 2n + 1. Donner u₀ :", f: "SAISIE_COURTE", r: "1" },
      { e: "Donner u₅ :", f: "SAISIE_COURTE", r: "11" },
    ],
  },
  "comp-MATH-1ere-2-2": {
    qcm: {
      e: "Suite géométrique : u₀ = 2, raison 3. Le terme u₃ vaut :",
      o: ["54", "18", "6", "16"],
      b: 0,
      err: ["CALCULATION_ERROR", "CALCULATION_ERROR", "CALCULATION_ERROR"],
    },
    saisie: { e: "Suite géométrique : u₀ = 1, q = 2. Donner u₄ :", r: "16" },
    etapes: [
      { e: "q = −2, u₀ = 1. Donner u₁ :", f: "SAISIE_COURTE", r: "-2" },
      { e: "Donner u₂ :", f: "SAISIE_COURTE", r: "4" },
    ],
  },
  "comp-MATH-1ere-2-3": {
    qcm: {
      e: "u₀ = 8 et u(n+1) = uₙ/2. Que devient uₙ quand n augmente ?",
      o: ["uₙ tend vers 0", "uₙ tend vers 8", "uₙ tend vers 2", "uₙ ne converge pas"],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "u₀ = 0 et u(n+1) = uₙ + 1. Donner u₁₀ :", r: "10" },
    etapes: [
      { e: "v₀ = 10, v(n+1) = vₙ − 3. Donner v₁ :", f: "SAISIE_COURTE", r: "7" },
      { e: "Donner v₂ :", f: "SAISIE_COURTE", r: "4" },
    ],
  },
  "cmt9p7q7x001tzbsvjq4s59x9": {
    qcm: {
      e: "P(A∩B) = 0,2 et P(B) = 0,4. La probabilité conditionnelle P(A|B) vaut :",
      o: ["0,5", "0,2", "0,8", "0,08"],
      b: 0,
      err: ["CALCULATION_ERROR", "CONCEPTUAL_ERROR", "CALCULATION_ERROR"],
    },
    saisie: { e: "P(A∩B) = 0,3 et P(B) = 0,6. Donner P(A|B) :", r: "0,5" },
    etapes: [
      { e: "Urne : 3 billes rouges, 5 bleues. Donner P(rouge) en décimal :", f: "SAISIE_COURTE", r: "0,375" },
      { e: "Donner P(bleu) en décimal :", f: "SAISIE_COURTE", r: "0,625" },
    ],
  },
  "cmt9p7qye001vzbsvs13vgvuw": {
    qcm: {
      e: "Deux événements A et B sont indépendants. Alors :",
      o: ["P(A∩B) = P(A) × P(B)", "P(A∩B) = P(A) + P(B)", "A et B sont incompatibles", "P(A|B) = P(B)"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Un dé équilibré : donner la probabilité d'obtenir un multiple de 3 (en décimal, 3 chiffres après la virgule) :", r: "0,333" },
    etapes: [
      { e: "P(A) = 0,5, P(B) = 0,4, A ⊥ B. Donner P(A∩B) :", f: "SAISIE_COURTE", r: "0,2" },
      { e: "X vaut 1 avec probabilité 0,5 et 0 sinon. Donner l'espérance E(X) :", f: "SAISIE_COURTE", r: "0,5" },
    ],
  },

  // ══ FR 2nde ════════════════════════════════════════════════════════
  "comp-FR-2nde-1-1": {
    qcm: {
      e: "Le mouvement littéraire du XVIIe siècle qui privilégie la raison et la mesure s'appelle :",
      o: ["Le classicisme", "Le romantisme", "Le surréalisme", "L'absurde"],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Mouvement littéraire du XIXe siècle mettant l'individu et ses passions au centre (un mot) :", r: "romantisme" },
    etapes: [
      { e: "« Le cœur a ses raisons que la raison ne connaît point » : de quel mouvement est-il question ? (un mot)", f: "SAISIE_COURTE", r: "classicisme" },
      { e: "Le mouvement qui rompt avec la logique et fait de l'inconscient une source créatrice s'appelle (un mot) :", f: "SAISIE_COURTE", r: "surréalisme" },
    ],
  },
  "comp-FR-2nde-1-2": {
    qcm: {
      e: "Un texte qui provoque le rire tout en dénonçant un défaut relève du registre :",
      o: ["comique", "tragique", "lyrique", "pathétique"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Registre poétique qui chante les sentiments intimes du « je » (un mot) :", r: "lyrique" },
    etapes: [
      { e: "Registre fondé sur la peur et l'effroi (un mot) :", f: "SAISIE_COURTE", r: "épouvante" },
      { e: "Registre centré sur la souffrance et la pitié (un mot) :", f: "SAISIE_COURTE", r: "pathétique" },
    ],
  },
  "comp-FR-2nde-1-3": {
    qcm: {
      e: "Une narration où le narrateur emploie « je » et participe à l'histoire relève de la :",
      o: ["personne", "troisième personne", "focalisation zéro", "narration impersonnelle"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "« Jeune fille élégante et délicieuse creature » : à quel procédé narratif renvoie l'usage de la première personne lorsqu'on se dépeint soi-même (un mot commençant par a) ?", r: "autofiction" },
    etapes: [
      { e: "Le narrateur sait tout des pensées des personnages : focalisation (un mot) ?", f: "SAISIE_COURTE", r: "zéro" },
      { e: "Le narrateur ne connaît que ce qu'un personnage sait : focalisation (un mot) ?", f: "SAISIE_COURTE", r: "interne" },
    ],
  },
  "comp-FR-2nde-2-1": {
    qcm: {
      e: "Quelle est la fonction de l'introduction d'un commentaire composé ?",
      o: [
        "Présenter le texte, l'auteur, le thème et annoncer le plan",
        "Résumer le texte sans avis",
        "Conclure l'argumentation",
        "Citer d'autres textes du programme",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Le commentaire composé se termine par une partie obligatoire qui évalue le texte : donnez son nom (2 mots) :", r: "partie sur le style" },
    etapes: [
      { e: "Un commentaire comporte en général combien de parties principales (chiffre) ?", f: "SAISIE_COURTE", r: "3" },
      { e: "L'unité de base d'un plan de commentaire est le : axe, mouvement ou paragraphe ? Répondre par le mot juste :", f: "SAISIE_COURTE", r: "mouvement" },
    ],
  },
  "comp-FR-2nde-2-2": {
    qcm: {
      e: "La structure d'un texte littéraire se repère d'abord par :",
      o: [
        "La progression des idées et des procédés",
        "Le nombre de lignes",
        "La présence de dialogues",
        "La longueur des phrases",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Une idée nouvelle, introduite par « cependant », marque une : (un mot) :", r: "rupture" },
    etapes: [
      { e: "Les connecteurs « d'abord », « ensuite », « enfin » marquent une relation logique de : (un mot) :", f: "SAISIE_COURTE", r: "succession" },
      { e: "Le connecteur « or » introduit le plus souvent une : opposition ou addition ? (un mot) :", f: "SAISIE_COURTE", r: "opposition" },
    ],
  },
  "comp-FR-2nde-2-3": {
    qcm: {
      e: "« Taisez-vous ! » relève d'un registre de langue :",
      o: ["familier", "soutenu", "courant", "littéraire"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Registre de langue des échanges quotidiens, ni familier ni soutenu (un mot) :", r: "courant" },
    etapes: [
      { e: "« Vous » d'adresse polie relève d'un registre : soutenu ou courant ? (un mot)", f: "SAISIE_COURTE", r: "soutenu" },
      { e: "Le registre courant marque souvent la distance sociale ou l'humour ?", f: "SAISIE_COURTE", r: "humour" },
    ],
  },

  // ══ FR 1ère ════════════════════════════════════════════════════════
  "comp-FR-1ere-1-1": {
    qcm: {
      e: "Quelle est la première étape pour construire le plan d'une dissertation ?",
      o: [
        "Identifier la problématique posée par le sujet",
        "Lister toutes les citations connues",
        "Rédiger la conclusion",
        "Choisir le registre littéraire",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Le plan en trois parties comprend : thèse, antithèse et… (un mot) :", r: "synthèse" },
    etapes: [
      { e: "La partie qui défend un premier point de vue s'appelle (un mot) :", f: "SAISIE_COURTE", r: "thèse" },
      { e: "L'étape qui consiste à dépasser le conflit des points de vue s'appelle (un mot) :", f: "SAISIE_COURTE", r: "synthèse" },
    ],
  },
  "comp-FR-1ere-1-2": {
    qcm: {
      e: "Quelle affirmation caractérise la dissertation philosophique ?",
      o: [
        "Elle défend une thèse par l'argumentation et des exemples",
        "Elle raconte une histoire",
        "Elle exprime uniquement un ressenti",
        "Elle se limite à des citations",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Le « je » est-il admis dans la dissertation au collège/lycée ? Répondre « oui » ou « non » :", r: "non" },
    etapes: [
      { e: "La conclusion d'une dissertation doit d'abord répondre à la : (un mot)", f: "SAISIE_COURTE", r: "problématique" },
      { e: "Une dissertation philosophique s'ouvre par : introduction ou narration ? (un mot)", f: "SAISIE_COURTE", r: "introduction" },
    ],
  },
  "comp-FR-1ere-1-3": {
    qcm: {
      e: "Qu'est-ce qu'un argument dans une dissertation ?",
      o: [
        "Une raison qui soutient une thèse par un raisonnement",
        "Un exemple isolé sans explication",
        "Une citation d'auteur",
        "Un récit personnel",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "L'ensemble d'arguments qui soutiennent un même point de vue forment le : (un mot) :", r: "développement" },
    etapes: [
      { e: "Un exemple sert à illustrer une idée ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
      { e: "Le fait d'enchaîner des idées de cause à effet constitue un : raisonnement ou un récit ? (un mot)", f: "SAISIE_COURTE", r: "raisonnement" },
    ],
  },
  "comp-FR-1ere-2-1": {
    qcm: {
      e: "Un roman du XXe siècle se caractérise souvent par :",
      o: [
        "La modernité narrative (stream of consciousness, narration interne)",
        "L'absence de personnages",
        "Une seule voix narrative toujours omnisciente",
        "L'obligation d'être écrit en vers",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Technique narrative qui restitue le flux des pensées d'un personnage (anglicisme, 2 mots) :", r: "stream of consciousness" },
    etapes: [
      { e: "Le mouvement littéraire qui réinvente la forme romanesque au XIXe siècle est le : (un mot)", f: "SAISIE_COURTE", r: "naturalisme" },
      { e: "Le roman qui questionne la condition humaine après 1945 se dit : existentialiste ou classique ? (un mot)", f: "SAISIE_COURTE", r: "existentialiste" },
    ],
  },
  "comp-FR-1ere-2-2": {
    qcm: {
      e: "Le personnage de roman est avant tout :",
      o: [
        "Une construction qui porte les thèmes de l'œuvre",
        "Une copie de l'auteur",
        "Toujours historique",
        "Un simple témoin",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Le personnage principal d'un roman est appelé : héros, narrateur ou auteur ? (un mot) :", r: "héros" },
    etapes: [
      { e: "Dans Le Père Goriot, Rastignac est un personnage en quête d'ascension : on le dit ambitieux ?", f: "SAISIE_COURTE", r: "ambitieux" },
      { e: "D'après E. M. Forster, un personnage simple et prévisible se dit : flat ou round ? (mot anglais)", f: "SAISIE_COURTE", r: "flat" },
    ],
  },
  "comp-FR-1ere-2-3": {
    qcm: {
      e: "Quel thème est récurrent dans le roman du XXe siècle ?",
      o: [
        "L'aliénation et l'absurde",
        "La gloire chevaleresque",
        "Le merveilleux médiéval",
        "L'épopée impériale",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "L'écueil du « naufrage » identitaire est central chez Camus : son mythe emblématique s'appelle : Sisyphe, Ulysse ou Hamlet ? (un mot) :", r: "sisyphe" },
    etapes: [
      { e: "Le roman qui dénonce l'absurdité du monde moderne est souvent dit : absurde ou héroïque ? (un mot)", f: "SAISIE_COURTE", r: "absurde" },
      { e: "L'œuvre de Kafka Le Procès illustre la thématique de l'… : aliénation ou de l'aventure ? (un mot)", f: "SAISIE_COURTE", r: "aliénation" },
    ],
  },

  // ══ PC (physique-chimie) 2nde ═══════════════════════════════════════
  "comp-PC-2nde-1-1": {
    qcm: {
      e: "Le nombre de protons dans le noyau d'un atome définit :",
      o: ["Le numéro atomique Z", "Le nombre de masse A", "Le nombre de neutrons", "La charge de l'ion"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Donner le numéro atomique Z du carbone (nombre entier) :", r: "6" },
    etapes: [
      { e: "Un atome a Z = 8 et A = 16. Donner le nombre de neutrons :", f: "SAISIE_COURTE", r: "8" },
      { e: "Donner le nombre de protons de cet atome :", f: "SAISIE_COURTE", r: "8" },
    ],
  },
  "comp-PC-2nde-1-2": {
    qcm: {
      e: "Dans la classification périodique, les éléments d'une même colonne (groupe) possèdent :",
      o: [
        "Le même nombre d'électrons de valence",
        "Le même nombre de masse",
        "Le même état physique",
        "La même réactivité identique",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Donner le numéro atomique du sodium Na (nombre entier) :", r: "11" },
    etapes: [
      { e: "Le groupe des éléments de configuration externe ns¹ s'appelle : alcalins ou alcalino-terreux ? (un mot)", f: "SAISIE_COURTE", r: "alcalins" },
      { e: "Donner le nombre d'électrons de valence d'un élément du groupe 17 (halogènes) :", f: "SAISIE_COURTE", r: "7" },
    ],
  },
  "comp-PC-2nde-1-3": {
    qcm: {
      e: "La liaison covalente résulte de :",
      o: [
        "Le partage d'une paire d'électrons",
        "Le transfert d'électrons",
        "L'attraction entre deux neutrons",
        "La répulsion des noyaux",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Dans la liaison ionique, qui attire les électrons : le métal ou le non-métal ? (un mot) :", r: "non-métal" },
    etapes: [
      { e: "Combien de liaisons covalentes simples dans la molécule H₂ (chiffre) ?", f: "SAISIE_COURTE", r: "1" },
      { e: "Combien d'électrons dans une paire d'électrons liants (chiffre) :", f: "SAISIE_COURTE", r: "2" },
    ],
  },
  "comp-PC-2nde-2-1": {
    qcm: {
      e: "Le mouvement d'un objet se décrit par rapport à :",
      o: ["Un référentiel", "Sa masse", "Sa température", "Sa couleur"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Une voiture parcourt 120 km en 2 h. Donner sa vitesse moyenne (en km/h) :", r: "60" },
    etapes: [
      { e: "v = 20 m/s pendant 5 s. Donner la distance parcourue (en m) :", f: "SAISIE_COURTE", r: "100" },
      { e: "Exprimer 72 km/h en m/s (chiffre entier) :", f: "SAISIE_COURTE", r: "20" },
    ],
  },
  "comp-PC-2nde-2-2": {
    qcm: {
      e: "Le principe d'inertie (1re loi de Newton) énonce que :",
      o: [
        "Un corps au repos ou en mouvement rectiligne uniforme reste dans cet état si la force résultante est nulle",
        "Toute force a une réaction",
        "L'accélération est proportionnelle à la force",
        "L'énergie ne se crée pas",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "La force résultante sur un objet est nulle. Est-il accéléré (« oui ») ou non (« non ») ?", r: "non" },
    etapes: [
      { e: "Un corps de masse 2 kg a une accélération de 3 m/s². Donner la force résultante (en N) :", f: "SAISIE_COURTE", r: "6" },
      { e: "L'unité de la force dans le système international est le : newton ou joule ? (un mot)", f: "SAISIE_COURTE", r: "newton" },
    ],
  },
  "comp-PC-2nde-2-3": {
    qcm: {
      e: "Quand un objet exerce une force sur un autre, ce dernier exerce sur lui :",
      o: [
        "Une force de même intensité, opposée et de même nature",
        "Une force plus faible",
        "Aucune force",
        "Une force de même direction et même sens",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Les interactions mécaniques entre deux corps sont-elles toujours de nature électrique (« oui ») ou mécanique (« non ») ?", r: "oui" },
    etapes: [
      { e: "Une force de 10 N agit sur 2 kg. Donner l'accélération (en m/s²) :", f: "SAISIE_COURTE", r: "5" },
      { e: "La poussée d'Archimède est dirigée vers le haut ou vers le bas ? (un mot)", f: "SAISIE_COURTE", r: "haut" },
    ],
  },

  // ══ PC 1ère ════════════════════════════════════════════════════════
  "comp-PC-1ere-1-1": {
    qcm: {
      e: "Équilibrer une équation chimique consiste à :",
      o: [
        "Égaliser le nombre d'atomes de chaque élément des deux côtés",
        "Ajouter des molécules au hasard",
        "Changer les formules des espèces",
        "Supprimer les coefficients",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "2H₂ + O₂ → 2H₂O. Donner la formule du produit formée (sans indice, majuscule/minuscule libre) :", r: "h2o" },
    etapes: [
      { e: "Dans 2H₂ + O₂ → 2H₂O, combien d'atomes d'oxygène à gauche (chiffre) ?", f: "SAISIE_COURTE", r: "2" },
      { e: "Donner le nom de la molécule formée : H₂O (un mot, sans formule) :", f: "SAISIE_COURTE", r: "eau" },
    ],
  },
  "comp-PC-1ere-1-2": {
    qcm: {
      e: "La quantité de matière n (en mol) se calcule par :",
      o: ["n = m / M", "n = m × M", "n = M / m", "n = m + M"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Donner la masse molaire de H₂O en g/mol (entier) :", r: "18" },
    etapes: [
      { e: "m = 36 g, M = 18 g/mol. Donner n (en mol) :", f: "SAISIE_COURTE", r: "2" },
      { e: "Donner la mantisse (virgule) de la constante d'Avogadro ≈ 6,02×10²³ mol⁻¹ :", f: "SAISIE_COURTE", r: "6,02" },
    ],
  },
  "comp-PC-1ere-1-3": {
    qcm: {
      e: "Une solution de pH = 3 est :",
      o: ["Acide", "Basique", "Neutre", "Saturée"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Donner le pH d'une solution neutre à 25 °C (entier) :", r: "7" },
    etapes: [
      { e: "Donner la formule liant pH et pOH à 25 °C (pH + pOH = ?) :", f: "SAISIE_COURTE", r: "14" },
      { e: "Une solution a un pH de 9. Est-elle acide (« non ») ou basique (« oui ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PC-1ere-2-1": {
    qcm: {
      e: "L'énergie cinétique d'un mobile dépend :",
      o: ["De sa masse et du carré de sa vitesse", "De sa masse seule", "De sa température", "De sa position"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Un objet de 2 kg se déplace à 3 m/s. Donner son énergie cinétique (en J) :", r: "9" },
    etapes: [
      { e: "Ec = ½mv². Donner la masse si Ec = 50 J et v = 10 m/s (kg) :", f: "SAISIE_COURTE", r: "1" },
      { e: "Vitesse doublée : le coefficient multiplicateur de Ec est (entier) :", f: "SAISIE_COURTE", r: "4" },
    ],
  },
  "comp-PC-1ere-2-2": {
    qcm: {
      e: "Dans un système isolé, l'énergie mécanique totale :",
      o: ["Se conserve", "Augmente", "Diminue toujours", "Double"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Un objet chute librement : son énergie potentielle se transforme principalement en énergie : cinétique ou thermique ? (un mot) :", r: "cinétique" },
    etapes: [
      { e: "m = 1 kg, h = 10 m, g = 10 m/s². Donner l'énergie potentielle (en J) :", f: "SAISIE_COURTE", r: "100" },
      { e: "Donner la valeur utilisée de g en m/s² (entier) :", f: "SAISIE_COURTE", r: "10" },
    ],
  },
  "comp-PC-1ere-2-3": {
    qcm: {
      e: "Le rendement énergétique d'un système est :",
      o: [
        "Le rapport énergie utile / énergie totale consommée",
        "L'énergie totale / l'énergie utile",
        "La puissance × le temps",
        "La masse du système",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Une machine reçoit 100 J et restitue 80 J utiles. Donner son rendement (en %) :", r: "80" },
    etapes: [
      { e: "P = W/t. Donner la puissance si W = 200 J en 4 s (en W) :", f: "SAISIE_COURTE", r: "50" },
      { e: "L'unité de la puissance en système international est le : watt ou joule ? (un mot)", f: "SAISIE_COURTE", r: "watt" },
    ],
  },

  // ══ PHILO 2nde ═════════════════════════════════════════════════════
  "comp-PHILO-2nde-1-1": {
    qcm: {
      e: "Que signifie « culture » au sens philosophique ?",
      o: [
        "L'ensemble des transformations de la nature par l'homme",
        "Le seul art de cuisiner",
        "L'instinct inné des êtres vivants",
        "La nature humaine immuable",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "La distinction nature/culture est d'abord portée par l'ethnologue Lévi-Strauss : donner son nom de famille :", r: "lévi-strauss" },
    etapes: [
      { e: "Le débat « nature ou culture » porte sur l'origine de nos… : (un mot, pluriel)", f: "SAISIE_COURTE", r: "comportements" },
      { e: "L'éducation relève plutôt de la nature ou de la culture ? (un mot)", f: "SAISIE_COURTE", r: "culture" },
    ],
  },
  "comp-PHILO-2nde-1-2": {
    qcm: {
      e: "Quelle thèse défend l'art pour l'art ?",
      o: [
        "L'œuvre d'art n'a d'autre fin qu'elle-même",
        "L'art doit avant tout instruire",
        "L'art doit servir la religion",
        "L'art n'est qu'un passe-temps",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Selon Kant, le jugement esthétique est-il purement objectif ? Répondre « oui » ou « non » :", r: "non" },
    etapes: [
      { e: "L'art est imitation de la nature : cette thèse vient du philosophe grec… (un mot)", f: "SAISIE_COURTE", r: "platon" },
      { e: "« L'art est la manifestation la plus complète de la liberté » : l'art est-il lié à la création ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PHILO-2nde-1-3": {
    qcm: {
      e: "Qu'est-ce qu'aliéner quelqu'un ?",
      o: [
        "Le priver de sa liberté en s'appropriant ce qui lui appartient",
        "Le rendre plus libre",
        "L'éduquer",
        "Le reconnaître comme égal",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Le travail aliéné a été pensé par le philosophe allemand du XIXe siècle dont le prénom est Karl… (un mot) :", r: "marx" },
    etapes: [
      { e: "S'aliéner, c'est perdre ce qui fonde l'… : (un mot, singulier)", f: "SAISIE_COURTE", r: "identité" },
      { e: "La culture peut-elle aliéner (« oui ») ou libérer (« non ») selon les usages ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PHILO-2nde-2-1": {
    qcm: {
      e: "Quelle est la différence entre besoin et désir ?",
      o: [
        "Le besoin se comble, le désir se renouvelle sans cesse",
        "Le désir se comble toujours",
        "Ils sont identiques",
        "Le besoin est toujours illusoire",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "À l'inverse du désir qui se renouvelle, le besoin se… : comble ou renouvelle ? (verbe à l'infinitif) :", r: "comble" },
    etapes: [
      { e: "Combler un besoin procure une satisfaction : (un mot)", f: "SAISIE_COURTE", r: "satisfaction" },
      { e: "Selon Platon, le désir naît du manque ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PHILO-2nde-2-2": {
    qcm: {
      e: "Qu'entend-on par « personne » en philosophie ?",
      o: [
        "L'être doué de raison et de liberté, digne de respect",
        "Un individu quelconque",
        "Un corps physique",
        "Un rôle social",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Kant fonde la dignité de la personne sur le fait qu'elle est un être… : (un mot, singulier)", r: "rationnel" },
    etapes: [
      { e: "L'individu est-il toujours une personne au sens moral ? (« oui »/« non »)", f: "SAISIE_COURTE", r: "non" },
      { e: "Le respect s'adresse à la personne plutôt qu'au… (un mot, singulier)", f: "SAISIE_COURTE", r: "corps" },
    ],
  },
  "comp-PHILO-2nde-2-3": {
    qcm: {
      e: "Qu'est-ce qui fonde l'équité dans une distribution ?",
      o: [
        "Traiter également ce qui est égal, inégalement ce qui est inégal",
        "Tout donner à chacun",
        "La force du plus capable",
        "Le hasard",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "La justice distributive consiste à répartir les biens selon le… : mérite ou le hasard ? (un mot) :", r: "mérite" },
    etapes: [
      { e: "Pour Aristote, la justice est une vertu de… (un mot, singulier)", f: "SAISIE_COURTE", r: "proportion" },
      { e: "La justice égalitaire accorde-t-elle à chacun la même part (« oui ») ou proportionnelle (« non ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },

  // ══ PHILO 1ère ═════════════════════════════════════════════════════
  "comp-PHILO-1ere-1-1": {
    qcm: {
      e: "Qu'est-ce qu'une contrainte au sens philosophique ?",
      o: [
        "Une force extérieure qui s'oppose à notre volonté",
        "Un désir intérieur",
        "Une règle morale choisie",
        "Une loi de la nature respectée volontairement",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "La contrainte s'oppose à la… : (un mot)", r: "liberté" },
    etapes: [
      { e: "Obéir par force relève de la contrainte ; obéir par choix relève de la… (un mot)", f: "SAISIE_COURTE", r: "volonté" },
      { e: "La liberté suppose-t-elle des limites extérieures (« oui ») ou non (« non ») ? Répondre selon l'analyse classique :", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PHILO-1ere-1-2": {
    qcm: {
      e: "Que signifie « libre et responsable » ?",
      o: [
        "C'est parce que nous sommes libres que nous répondons de nos actes",
        "La responsabilité supprime la liberté",
        "Seuls les mineurs sont responsables",
        "La liberté exclue toute conséquence",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Celui qui assume les conséquences de ses actes fait preuve de : (un mot)", r: "responsabilité" },
    etapes: [
      { e: "Sartre : l'homme est « condamné à être… » (un mot)", f: "SAISIE_COURTE", r: "libre" },
      { e: "La responsabilité peut-elle exister sans liberté ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "non" },
    ],
  },
  "comp-PHILO-1ere-1-3": {
    qcm: {
      e: "Le libre arbitre désigne :",
      o: [
        "La capacité de choisir entre plusieurs possibles",
        "L'obéissance à la loi",
        "Le déterminisme des passions",
        "La prédiction de l'avenir",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Le déterminisme nie-t-il le libre arbitre (« oui ») ou le confirme-t-il (« non ») ? Répondre « oui » ou « non » :", r: "oui" },
    etapes: [
      { e: "Descartes défend l'existence du libre arbitre ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
      { e: "Pour Spinoza, nous croyons être libres alors que nous sommes… déterminés ou spontanés ? (un mot)", f: "SAISIE_COURTE", r: "déterminés" },
    ],
  },
  "comp-PHILO-1ere-2-1": {
    qcm: {
      e: "« Fais ce que dois, advienne que pourra » illustre :",
      o: [
        "Le devoir accompli indépendamment de l'inclination",
        "Le calcul des conséquences",
        "Le plaisir personnel",
        "L'obéissance par crainte",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "L'inclination est le penchant vers ce qui nous… (un mot, 3e personne du singulier) :", r: "plaît" },
    etapes: [
      { e: "L'action faite par devoir est faite par inclination ou par obligation ? (un mot)", f: "SAISIE_COURTE", r: "obligation" },
      { e: "L'éthique d'inclination juge l'action par ses… : intentions ou conséquences ? (un mot)", f: "SAISIE_COURTE", r: "conséquences" },
    ],
  },
  "comp-PHILO-1ere-2-2": {
    qcm: {
      e: "Pour Kant, une action a une valeur morale uniquement si :",
      o: [
        "Elle est accomplie par devoir, selon une maxime universalisable",
        "Elle procure du plaisir",
        "Elle est utile à la société",
        "Elle est conformée à la tradition",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "MISINTERPRETATION"],
    },
    saisie: { e: "Chez Kant, la loi morale intérieure s'appelle l'impératif… (un mot) :", r: "catégorique" },
    etapes: [
      { e: "L'impératif catégorique exige que la maxime soit… universalisable ou privée ? (un mot)", f: "SAISIE_COURTE", r: "universalisable" },
      { e: "Kant interdit-il de mentir même pour sauver quelqu'un (« oui ») ou l'autorise-t-il (« non ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-PHILO-1ere-2-3": {
    qcm: {
      e: "Le conflit entre devoir et bonheur se résout selon Kant :",
      o: [
        "La vertu mérite le bonheur comme couronnement",
        "Le bonheur prime sur le devoir",
        "Devoir et bonheur sont indifférents",
        "Le bonheur supprime le devoir",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Dans la philosophie antique, le bonheur réside dans la… (un mot, vertu majeure des Grecs) :", r: "vertu" },
    etapes: [
      { e: "« On ne peut démontrer le bonheur, on ne peut que le… » : vivre ou prouver ? (verbe à l'infinitif)", f: "SAISIE_COURTE", r: "vivre" },
      { e: "Le souverain bien associe la vertu et le… (un mot)", f: "SAISIE_COURTE", r: "bonheur" },
    ],
  },

  // ══ SVT 2nde ═══════════════════════════════════════════════════════
  "comp-SVT-2nde-1-1": {
    qcm: {
      e: "Quelle organite est le siège de la respiration cellulaire ?",
      o: ["La mitochondrie", "Le ribosome", "L'appareil de Golgi", "Le lysosome"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "L'information génétique est stockée dans le : (un mot)", r: "noyau" },
    etapes: [
      { e: "La membrane plasmique assure une fonction de : sélection ou de division ? (un mot)", f: "SAISIE_COURTE", r: "sélection" },
      { e: "La photosynthèse a lieu dans le : chloroplaste ou mitochondrie ? (un mot)", f: "SAISIE_COURTE", r: "chloroplaste" },
    ],
  },
  "comp-SVT-2nde-1-2": {
    qcm: {
      e: "La mitose produit :",
      o: [
        "Deux cellules filles identiques à la cellule mère",
        "Quatre cellules haploïdes génétiquement différentes",
        "Une cellule diploïde et une haploïde",
        "Deux cellules staminaires",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Une cellule humaine diploïde (2n = 46) après mitose reste : diploïde (« oui ») ou haploïde (« non ») ? Répondre « oui » ou « non » :", r: "oui" },
    etapes: [
      { e: "La méiose permet la production des : gamètes ou des globules rouges ? (un mot)", f: "SAISIE_COURTE", r: "gamètes" },
      { e: "Combien de chromosomes contient un gamète humain (chiffre) :", f: "SAISIE_COURTE", r: "23" },
    ],
  },
  "comp-SVT-2nde-1-3": {
    qcm: {
      e: "La respiration cellulaire a pour finalité :",
      o: [
        "La production d'énergie (ATP)",
        "La synthèse de l'ADN",
        "Le transport de l'oxygène",
        "La division cellulaire",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "La molécule-énergie universelle de la cellule porte les 3 lettres : (abréviation) :", r: "atp" },
    etapes: [
      { e: "La fermentation lactique se déroule en présence ou en absence d'oxygène ? (un mot)", f: "SAISIE_COURTE", r: "absence" },
      { e: "La photosynthèse consomme du gaz carbonique ? Répondre « oui » ou « non » :", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-SVT-2nde-2-1": {
    qcm: {
      e: "L'ADN est constitué de :",
      o: [
        "Deux brins en double hélice de nucléotides",
        "Une chaîne d'acides aminés",
        "Un seul brin de ribose",
        "Des lipides associés",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Donner la base qui s'apparie avec la thymine dans l'ADN (un mot) :", r: "adénine" },
    etapes: [
      { e: "L'ADN est constitué de : acides aminés ou de nucléotides ? (un mot)", f: "SAISIE_COURTE", r: "nucléotides" },
      { e: "Combien de lettres comporte le code génétique (4) :", f: "SAISIE_COURTE", r: "4" },
    ],
  },
  "comp-SVT-2nde-2-2": {
    qcm: {
      e: "Un allèle récessif s'exprime dans le phénotype :",
      o: [
        "Uniquement à l'état homozygote",
        "Toujours à l'état hétérozygote",
        "Jamais",
        "Seulement chez les mâles",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "Génotype Aa : l'individu est-il hétérozygote (« oui ») ou homozygote (« non ») ?", r: "oui" },
    etapes: [
      { e: "Un gène porté par le chromosome X est dit : lié au X ou lié au Y ? (2 mots) :", f: "SAISIE_COURTE", r: "lié au x" },
      { e: "Croisement Aa × Aa : combien de descendants sur 4 attendus portent le phénotype récessif (chiffre) :", f: "SAISIE_COURTE", r: "1" },
    ],
  },
  "comp-SVT-2nde-2-3": {
    qcm: {
      e: "Un arbre généalogique permet de :",
      o: [
        "Suivre la transmission d'un caractère dans une famille",
        "Mesurer la croissance d'une plante",
        "Déterminer l'âge d'un fossile",
        "Classer les espèces",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Hérédité : le père et la mère sont porteurs sains, l'enfant malade. Le caractère est-il récessif (« oui ») ou dominant (« non ») ?", r: "oui" },
    etapes: [
      { e: "Le mode de transmission lié au chromosome X concerne plutôt le rouge-gorge ou la myopie liée au sexe ? (2 mots : rouge-gorge / myopie) :", f: "SAISIE_COURTE", r: "myopie" },
      { e: "Une ascendance consanguine augmente-t-elle le risque (« oui ») ou le diminue (« non ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },

  // ══ SVT 1ère ═══════════════════════════════════════════════════════
  "comp-SVT-1ere-1-1": {
    qcm: {
      e: "Une mutation génétique est :",
      o: [
        "Une modification de la séquence d'ADN transmissible",
        "Une maladie contagieuse",
        "Un acquis de l'environnement",
        "Une division cellulaire anormale",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "La mutation est-elle toujours néfeste pour l'organisme (« oui ») ou peut-elle être neutre ou favorable (« non ») ?", r: "non" },
    etapes: [
      { e: "L'unité de base de la mutation est le : nucléotide ou chromosome ? (un mot)", f: "SAISIE_COURTE", r: "nucléotide" },
      { e: "Les mutations sont-elles aléatoires (« oui ») ou dirigées (« non ») selon la théorie évolutionniste ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
  "comp-SVT-1ere-1-2": {
    qcm: {
      e: "La sélection naturelle agit sur :",
      o: [
        "Les phénotypes qui influencent la reproduction réussie",
        "Les génotypes invisibles uniquement",
        "Le nombre de chromosomes",
        "La taille du cerveau seule",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "L'adaptation d'une population résulte de la sélection… (un mot) :", r: "naturelle" },
    etapes: [
      { e: "Le mécanisme qui favorise les individus les mieux adaptés se dit : sélection ou dérive ? (un mot)", f: "SAISIE_COURTE", r: "sélection" },
      { e: "L'évolution s'apprécie à l'échelle des individus ou des populations ? (un mot)", f: "SAISIE_COURTE", r: "populations" },
    ],
  },
  "comp-SVT-1ere-1-3": {
    qcm: {
      e: "Un arbre phylogénétique montre :",
      o: [
        "Les parentés évolutives entre groupes d'êtres vivants",
        "La géographie des espèces",
        "L'âge de la Terre",
        "Le régime alimentaire des espèces",
      ],
      b: 0,
      err: ["MISINTERPRETATION", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Deux espèces placées sur la même branche récente partagent une ancêtre… commune ou divergente ? (un mot) :", r: "commune" },
    etapes: [
      { e: "Le point de départ d'un arbre phylogénétique est le : ancêtre commun ou l'espèce actuelle ? (un mot)", f: "SAISIE_COURTE", r: "ancêtre" },
      { e: "Les oiseaux sont plus proches des reptiles ou des mammifères ? (un mot)", f: "SAISIE_COURTE", r: "reptiles" },
    ],
  },
  "comp-SVT-1ere-2-1": {
    qcm: {
      e: "L'ovulation correspond à :",
      o: [
        "La libération d'un ovocyte par l'ovaire",
        "La nidation de l'embryon",
        "La formation du placenta",
        "La fin des règles",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "CONCEPTUAL_ERROR"],
    },
    saisie: { e: "La durée moyenne du cycle ovarien est d'environ combien de jours (entier) ?", r: "28" },
    etapes: [
      { e: "L'ovulation a lieu vers le milieu du cycle : vers le jour 7, 14 ou 21 ? (entier)", f: "SAISIE_COURTE", r: "14" },
      { e: "L'œstrogène ou la progestérone domine après l'ovulation : donner le nom (au singulier) :", f: "SAISIE_COURTE", r: "progestérone" },
    ],
  },
  "comp-SVT-1ere-2-2": {
    qcm: {
      e: "La fécondation se produit normalement dans :",
      o: ["Les trompes de Fallope", "L'utérus", "L'ovaire", "Le vagin"],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "CONCEPTUAL_ERROR", "MISINTERPRETATION"],
    },
    saisie: { e: "Le gamète mâle est le : spermatozoïde ou l'ovule ? (un mot) :", r: "spermatozoïde" },
    etapes: [
      { e: "La nidation de l'embryon se produit dans l'… : utérus ou ovaire ? (un mot)", f: "SAISIE_COURTE", r: "utérus" },
      { e: "Combien de chromosomes contient l'œuf fécondé (entier) :", f: "SAISIE_COURTE", r: "46" },
    ],
  },
  "comp-SVT-1ere-2-3": {
    qcm: {
      e: "Le préservatif est une méthode :",
      o: [
        "Contraceptive et barrière contre les IST",
        "Hormonale",
        "Chirurgicale",
        "Naturelle",
      ],
      b: 0,
      err: ["CONCEPTUAL_ERROR", "MISINTERPRETATION", "MISINTERPRETATION"],
    },
    saisie: { e: "La pilule contraceptive est d'abord : hormonale ou mécanique ? (un mot) :", r: "hormonale" },
    etapes: [
      { e: "La stérilisation (ligature des trompes) est réversible ou définitive ? (un mot)", f: "SAISIE_COURTE", r: "définitive" },
      { e: "Le préservatif est-il la seule méthode qui protège aussi des IST (« oui »/« non ») ?", f: "SAISIE_COURTE", r: "oui" },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────
// Exécution
// ─────────────────────────────────────────────────────────────────────

/** Une variante = un palier, une structure, un idempotent `q-bq-*`. */
const VARIANTES = ["qcm", "saisie", "etapes"] as const;
type Variante = (typeof VARIANTES)[number];

const PALIERS: Record<Variante, PalierExercice> = {
  qcm: PalierExercice.RESTITUTION,
  saisie: PalierExercice.APPLICATION,
  etapes: PalierExercice.CONSOLIDATION,
};

/** Id court et déterministe, y compris pour les compétences en cuid. */
function slug(competenceId: string): string {
  const base = competenceId.replace(/^comp-/, "").toLowerCase();
  return base.length > 28 ? base.slice(0, 16) : base;
}

function ligneQuestion(competenceId: string, variante: Variante, sujet: Sujet) {
  const structure =
    variante === "qcm"
      ? structureQcm(sujet.qcm)
      : variante === "saisie"
        ? structureSaisie(sujet.saisie)
        : structureEtapes(sujet.etapes);
  const format =
    variante === "qcm" ? FormatQuestion.CHOIX_UNIQUE : FormatQuestion.SAISIE_COURTE;
  const points = structure.etapes.reduce((somme, e) => somme + e.points, 0);
  return {
    id: `q-bq-${slug(competenceId)}-${variante}`,
    tenantId: TENANT,
    siteId: SITE,
    competenceId,
    palier: PALIERS[variante],
    enonce: structure.etapes[0]!.enonce,
    format,
    structure: structure as unknown as Prisma.InputJsonValue,
    bareme: points,
    langue: "fr",
    origine: "humain",
    actif: true,
  };
}

async function main() {
  // 1. Libellés — les compétences et chapitres génériques prennent leur
  //    thème réel : « Compétence 3: PHILO 1ere » ne veut rien dire à la maison.
  let renommees = 0;
  for (const [id, libelle] of Object.entries(RENOMMAGES_COMPETENCES)) {
    try {
      await prisma.competence.update({ where: { id }, data: { libelle } });
      renommees++;
    } catch {
      console.warn(`  ⚠️  compétence absente, ignorée : ${id}`);
    }
  }
  for (const [id, nom] of Object.entries(RENOMMAGES_CHAPITRES)) {
    try {
      await prisma.chapitre.update({ where: { id }, data: { nom } });
    } catch {
      console.warn(`  ⚠️  chapitre absent, ignoré : ${id}`);
    }
  }
  console.log(`Libellés : ${renommees} compétences, ${Object.keys(RENOMMAGES_CHAPITRES).length} chapitres`);

  // 2. Ne créer que pour les compétences réellement présentes : une
  //    compétence renommée côté curriculum peut avoir changé d'identifiant.
  const ids = Object.keys(BANQUE);
  const existantes = await prisma.competence.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const connus = new Set(existantes.map((c) => c.id));
  const absentes = ids.filter((id) => !connus.has(id));
  if (absentes.length > 0) {
    console.warn(`  ⚠️  ${absentes.length} compétence(s) absente(s) du curriculum, questions sautées :`);
    for (const id of absentes) console.warn(`     - ${id}`);
  }

  // 3. Insertion en masse, idempotente (ids déterministes + skipDuplicates).
  const lignes = existantes.flatMap(({ id }) => {
    const sujet = BANQUE[id];
    if (!sujet) return [];
    return VARIANTES.map((variante) => ligneQuestion(id, variante, sujet));
  });
  if (lignes.length === 0) {
    console.log("Rien à insérer.");
    return;
  }
  const res = await prisma.question.createMany({ data: lignes, skipDuplicates: true });
  console.log(
    `Banque : ${lignes.length} questions prévues (${existantes.length} compétences × ${VARIANTES.length} paliers), ${res.count} insérées.`,
  );

  // 4. Contrôle : la banque est-elle utilisable par l'entraînement autonome ?
  const totale = await prisma.question.count({
    where: { competenceId: { in: ids }, actif: true, langue: "fr" },
  });
  console.log(`Contrôle : ${totale} questions actives et françaises sur ces compétences.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

