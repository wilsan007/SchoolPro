/**
 * enrichir-curriculum-ambouli.mjs
 *
 * Corige trois problèmes identifiés dans le curriculum de tenant-ambouli :
 * 1. Renomme les chapitres génériques ("Chapitre 1: MATH 1ere") avec leurs
 *    vrais noms pédagogiques ("Nombres entiers et décimaux", etc.)
 * 2. Ajoute les chapitres manquants (3, 4, 5…) définis dans le seed TypeScript
 *    mais jamais insérés en base par le SQL seed.
 * 3. Re-planifie TOUS les chapitres sur 44 semaines au lieu des 10 semaines
 *    actuelles (S1→S5, S6→S10).
 *
 * Sont concernées les 4 matières du CURRICULUM : MATH, FR, PC, SVT.
 * Les autres matières (ANG, EPS, SES, HG, AR, PHILO…) gardent leurs 2 chapitres
 * existants mais sont aussi re-planifiées sur 44 semaines.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ─── Curriculum réel (extrait du seed TypeScript) ──────────────────────
const CURRICULUM = {
  MATH: {
    "6eme": [
      { nom: "Nombres entiers et décimaux", competences: [
        { code: "M6-N1-C1", libelle: "Connaître et utiliser les nombres décimaux" },
        { code: "M6-N1-C2", libelle: "Comparer et ranger des nombres décimaux", prerequis: ["M6-N1-C1"] },
        { code: "M6-N1-C3", libelle: "Effectuer des opérations sur les décimaux", prerequis: ["M6-N1-C1"] },
      ]},
      { nom: "Géométrie : figures planes", competences: [
        { code: "M6-G1-C1", libelle: "Reconnaître et nommer les figures planes" },
        { code: "M6-G1-C2", libelle: "Construire des figures avec instruments", prerequis: ["M6-G1-C1"] },
        { code: "M6-G1-C3", libelle: "Calculer le périmètre d'une figure", prerequis: ["M6-G1-C1"] },
      ]},
      { nom: "Fractions", competences: [
        { code: "M6-F1-C1", libelle: "Comprendre la notion de fraction", prerequis: ["M6-N1-C1"] },
        { code: "M6-F1-C2", libelle: "Comparer des fractions simples", prerequis: ["M6-F1-C1"] },
        { code: "M6-F1-C3", libelle: "Additionner des fractions de même dénominateur", prerequis: ["M6-F1-C1", "M6-F1-C2"] },
      ]},
      { nom: "Proportionnalité", competences: [
        { code: "M6-P1-C1", libelle: "Reconnaître une situation de proportionnalité", prerequis: ["M6-F1-C1"] },
        { code: "M6-P1-C2", libelle: "Calculer une quatrième proportionnelle", prerequis: ["M6-P1-C1"] },
      ]},
      { nom: "Volumes et mesures", competences: [
        { code: "M6-V1-C1", libelle: "Convertir les unités de mesure" },
        { code: "M6-V1-C2", libelle: "Calculer l'aire d'un rectangle", prerequis: ["M6-G1-C3"] },
        { code: "M6-V1-C3", libelle: "Calculer le volume d'un pavé droit", prerequis: ["M6-V1-C2"] },
      ]},
    ],
    "5eme": [
      { nom: "Nombres relatifs", competences: [
        { code: "M5-NR-C1", libelle: "Comprendre les nombres relatifs", prerequis: ["M6-N1-C1"] },
        { code: "M5-NR-C2", libelle: "Additionner des nombres relatifs", prerequis: ["M5-NR-C1"] },
        { code: "M5-NR-C3", libelle: "Multiplier des nombres relatifs", prerequis: ["M5-NR-C2"] },
      ]},
      { nom: "Triangles et parallèles", competences: [
        { code: "M5-TR-C1", libelle: "Utiliser le théorème des milieux", prerequis: ["M6-G1-C2"] },
        { code: "M5-TR-C2", libelle: "Appliquer le théorème de Thalès", prerequis: ["M5-TR-C1"] },
      ]},
      { nom: "Calcul littéral", competences: [
        { code: "M5-CL-C1", libelle: "Simplifier une expression littérale", prerequis: ["M5-NR-C3"] },
        { code: "M5-CL-C2", libelle: "Résoudre une équation simple", prerequis: ["M5-CL-C1"] },
      ]},
      { nom: "Fractions et opérations", competences: [
        { code: "M5-FR-C1", libelle: "Additionner et soustraire des fractions", prerequis: ["M6-F1-C3"] },
        { code: "M5-FR-C2", libelle: "Multiplier des fractions", prerequis: ["M5-FR-C1"] },
        { code: "M5-FR-C3", libelle: "Diviser des fractions", prerequis: ["M5-FR-C2"] },
      ]},
      { nom: "Statistiques", competences: [
        { code: "M5-ST-C1", libelle: "Lire et construire un graphique" },
        { code: "M5-ST-C2", libelle: "Calculer une moyenne", prerequis: ["M5-ST-C1"] },
      ]},
    ],
    "4eme": [
      { nom: "Puissances", competences: [
        { code: "M4-PW-C1", libelle: "Utiliser les puissances de 10", prerequis: ["M5-NR-C3"] },
        { code: "M4-PW-C2", libelle: "Calculer avec des puissances", prerequis: ["M4-PW-C1"] },
      ]},
      { nom: "Théorème de Pythagore", competences: [
        { code: "M4-PY-C1", libelle: "Connaître le théorème de Pythagore", prerequis: ["M5-TR-C1"] },
        { code: "M4-PY-C2", libelle: "Calculer une longueur avec Pythagore", prerequis: ["M4-PY-C1"] },
        { code: "M4-PY-C3", libelle: "Réciproque de Pythagore", prerequis: ["M4-PY-C2"] },
      ]},
      { nom: "Équations et inéquations", competences: [
        { code: "M4-EQ-C1", libelle: "Résoudre une équation du 1er degré", prerequis: ["M5-CL-C2"] },
        { code: "M4-EQ-C2", libelle: "Modéliser un problème par une équation", prerequis: ["M4-EQ-C1"] },
      ]},
      { nom: "Proportionnalité et pourcentages", competences: [
        { code: "M4-PR-C1", libelle: "Calculer un pourcentage d'évolution", prerequis: ["M6-P1-C2"] },
        { code: "M4-PR-C2", libelle: "Appliquer des réductions successives", prerequis: ["M4-PR-C1"] },
      ]},
      { nom: "Triangles semblables", competences: [
        { code: "M4-TS-C1", libelle: "Reconnaître des triangles semblables", prerequis: ["M5-TR-C2"] },
        { code: "M4-TS-C2", libelle: "Utiliser les rapports de similitude", prerequis: ["M4-TS-C1"] },
      ]},
    ],
    "3eme": [
      { nom: "Racines carrées", competences: [
        { code: "M3-RC-C1", libelle: "Manipuler les racines carrées", prerequis: ["M4-PW-C2"] },
        { code: "M3-RC-C2", libelle: "Résoudre des équations avec racines", prerequis: ["M3-RC-C1", "M4-EQ-C1"] },
      ]},
      { nom: "Théorème de Thalès et trigonométrie", competences: [
        { code: "M3-TH-C1", libelle: "Appliquer Thalès en situation", prerequis: ["M5-TR-C2"] },
        { code: "M3-TH-C2", libelle: "Utiliser le cosinus, sinus, tangente", prerequis: ["M4-PY-C2"] },
        { code: "M3-TH-C3", libelle: "Résoudre des problèmes de trigonométrie", prerequis: ["M3-TH-C2"] },
      ]},
      { nom: "Fonctions", competences: [
        { code: "M3-FO-C1", libelle: "Comprendre la notion de fonction", prerequis: ["M4-EQ-C1"] },
        { code: "M3-FO-C2", libelle: "Représenter graphiquement une fonction", prerequis: ["M3-FO-C1"] },
        { code: "M3-FO-C3", libelle: "Fonctions affines et linéaires", prerequis: ["M3-FO-C2"] },
      ]},
      { nom: "Probabilités", competences: [
        { code: "M3-PR-C1", libelle: "Calculer une probabilité simple", prerequis: ["M5-ST-C2"] },
        { code: "M3-PR-C2", libelle: "Probabilités dans un univers fini", prerequis: ["M3-PR-C1"] },
      ]},
      { nom: "Arithmétique et nombres premiers", competences: [
        { code: "M3-AR-C1", libelle: "Décomposer en facteurs premiers", prerequis: ["M6-N1-C1"] },
        { code: "M3-AR-C2", libelle: "PGCD et fractions irréductibles", prerequis: ["M3-AR-C1"] },
      ]},
    ],
    "2nde": [
      { nom: "Ensembles de nombres", competences: [
        { code: "M2-EN-C1", libelle: "Distinguer les ensembles de nombres", prerequis: ["M3-RC-C1"] },
        { code: "M2-EN-C2", libelle: "Manipuler les intervalles", prerequis: ["M2-EN-C1"] },
      ]},
      { nom: "Fonctions et courbes", competences: [
        { code: "M2-FO-C1", libelle: "Étudier les variations d'une fonction", prerequis: ["M3-FO-C3"] },
        { code: "M2-FO-C2", libelle: "Résoudre graphiquement une équation", prerequis: ["M2-FO-C1"] },
        { code: "M2-FO-C3", libelle: "Fonctions de référence", prerequis: ["M2-FO-C2"] },
      ]},
      { nom: "Vecteurs et géométrie", competences: [
        { code: "M2-VE-C1", libelle: "Manipuler les vecteurs", prerequis: ["M3-TH-C1"] },
        { code: "M2-VE-C2", libelle: "Coordonnées de vecteurs", prerequis: ["M2-VE-C1"] },
      ]},
      { nom: "Statistiques descriptives", competences: [
        { code: "M2-ST-C1", libelle: "Calculer médiane et quartiles", prerequis: ["M5-ST-C2"] },
        { code: "M2-ST-C2", libelle: "Écart-type et dispersion", prerequis: ["M2-ST-C1"] },
      ]},
    ],
    "1ere": [
      { nom: "Dérivation", competences: [
        { code: "M1-DE-C1", libelle: "Calculer une dérivée", prerequis: ["M2-FO-C1"] },
        { code: "M1-DE-C2", libelle: "Étudier les variations avec la dérivée", prerequis: ["M1-DE-C1"] },
        { code: "M1-DE-C3", libelle: "Optimisation et extremums", prerequis: ["M1-DE-C2"] },
      ]},
      { nom: "Suites", competences: [
        { code: "M1-SU-C1", libelle: "Étudier une suite arithmétique", prerequis: ["M2-FO-C1"] },
        { code: "M1-SU-C2", libelle: "Étudier une suite géométrique", prerequis: ["M1-SU-C1"] },
        { code: "M1-SU-C3", libelle: "Récurrence et limites", prerequis: ["M1-SU-C2"] },
      ]},
      { nom: "Probabilités conditionnelles", competences: [
        { code: "M1-PR-C1", libelle: "Probabilités conditionnelles", prerequis: ["M3-PR-C2"] },
        { code: "M1-PR-C2", libelle: "Indépendance et variable aléatoire", prerequis: ["M1-PR-C1"] },
      ]},
    ],
    "Terminale": [
      { nom: "Intégrales", competences: [
        { code: "MT-IN-C1", libelle: "Calculer une intégrale", prerequis: ["M1-DE-C1"] },
        { code: "MT-IN-C2", libelle: "Applications des intégrales (aires)", prerequis: ["MT-IN-C1"] },
      ]},
      { nom: "Limites et continuité", competences: [
        { code: "MT-LC-C1", libelle: "Calculer des limites de fonctions", prerequis: ["M1-DE-C2"] },
        { code: "MT-LC-C2", libelle: "Étudier la continuité", prerequis: ["MT-LC-C1"] },
      ]},
      { nom: "Nombres complexes", competences: [
        { code: "MT-NC-C1", libelle: "Manipuler les nombres complexes", prerequis: ["M2-EN-C1"] },
        { code: "MT-NC-C2", libelle: "Forme exponentielle et géométrie", prerequis: ["MT-NC-C1"] },
      ]},
      { nom: "Logarithme et exponentielle", competences: [
        { code: "MT-LE-C1", libelle: "Étudier la fonction exponentielle", prerequis: ["M1-DE-C2"] },
        { code: "MT-LE-C2", libelle: "Étudier la fonction logarithme", prerequis: ["MT-LE-C1"] },
      ]},
    ],
  },
  FR: {
    "6eme": [
      { nom: "La phrase et ses constituants", competences: [
        { code: "F6-PH-C1", libelle: "Identifier les constituants d'une phrase" },
        { code: "F6-PH-C2", libelle: "Construire des phrases complexes", prerequis: ["F6-PH-C1"] },
      ]},
      { nom: "Le récit", competences: [
        { code: "F6-RC-C1", libelle: "Reconnaître les éléments d'un récit" },
        { code: "F6-RC-C2", libelle: "Rédiger un récit court", prerequis: ["F6-RC-C1"] },
      ]},
      { nom: "Poésie", competences: [
        { code: "F6-PO-C1", libelle: "Lire et comprendre un poème" },
        { code: "F6-PO-C2", libelle: "Écrire un poème", prerequis: ["F6-PO-C1"] },
      ]},
    ],
    "5eme": [
      { nom: "Les temps du récit", competences: [
        { code: "F5-TR-C1", libelle: "Maîtriser l'imparfait et le passé simple", prerequis: ["F6-RC-C2"] },
        { code: "F5-TR-C2", libelle: "Construire un récit au passé", prerequis: ["F5-TR-C1"] },
      ]},
      { nom: "Le théâtre", competences: [
        { code: "F5-TH-C1", libelle: "Comprendre le dialogue théâtral" },
        { code: "F5-TH-C2", libelle: "Écrire une scène de théâtre", prerequis: ["F5-TH-C1"] },
      ]},
      { nom: "La description", competences: [
        { code: "F5-DE-C1", libelle: "Décrire un lieu ou un personnage", prerequis: ["F6-RC-C2"] },
        { code: "F5-DE-C2", libelle: "Enrichir la description", prerequis: ["F5-DE-C1"] },
      ]},
    ],
    "4eme": [
      { nom: "L'argumentation", competences: [
        { code: "F4-AR-C1", libelle: "Identifier la thèse et les arguments" },
        { code: "F4-AR-C2", libelle: "Construire un texte argumentatif", prerequis: ["F4-AR-C1"] },
      ]},
      { nom: "Le roman", competences: [
        { code: "F4-RM-C1", libelle: "Analyser un extrait de roman", prerequis: ["F5-DE-C2"] },
        { code: "F4-RM-C2", libelle: "Écrire un début de roman", prerequis: ["F4-RM-C1"] },
      ]},
      { nom: "Les figures de style", competences: [
        { code: "F4-FS-C1", libelle: "Reconnaître les figures de style", prerequis: ["F6-PO-C1"] },
        { code: "F4-FS-C2", libelle: "Utiliser les figures de style", prerequis: ["F4-FS-C1"] },
      ]},
    ],
    "3eme": [
      { nom: "Le débat et l'essai", competences: [
        { code: "F3-DB-C1", libelle: "Participer à un débat argumenté", prerequis: ["F4-AR-C2"] },
        { code: "F3-DB-C2", libelle: "Rédiger un essai", prerequis: ["F3-DB-C1"] },
      ]},
      { nom: "La poésie engagée", competences: [
        { code: "F3-PE-C1", libelle: "Analyser un poème engagé", prerequis: ["F4-FS-C1"] },
        { code: "F3-PE-C2", libelle: "Écrire un poème engagé", prerequis: ["F3-PE-C1"] },
      ]},
      { nom: "Travail d'écriture longue", competences: [
        { code: "F3-EL-C1", libelle: "Planifier un texte long", prerequis: ["F4-RM-C2"] },
        { code: "F3-EL-C2", libelle: "Réviser et corriger un texte", prerequis: ["F3-EL-C1"] },
      ]},
    ],
    "2nde": [
      { nom: "Le récit littéraire", competences: [
        { code: "F2-RL-C1", libelle: "Étudier un mouvement littéraire", prerequis: ["F4-RM-C1"] },
        { code: "F2-RL-C2", libelle: "Analyser les registres littéraires", prerequis: ["F2-RL-C1"] },
      ]},
      { nom: "Le commentaire", competences: [
        { code: "F2-CO-C1", libelle: "Rédiger un commentaire composé", prerequis: ["F3-EL-C2"] },
        { code: "F2-CO-C2", libelle: "Analyser la structure d'un texte", prerequis: ["F2-CO-C1"] },
      ]},
    ],
    "1ere": [
      { nom: "La dissertation", competences: [
        { code: "F1-DI-C1", libelle: "Construire un plan de dissertation", prerequis: ["F2-CO-C1"] },
        { code: "F1-DI-C2", libelle: "Rédiger une dissertation", prerequis: ["F1-DI-C1"] },
      ]},
      { nom: "Le roman et ses mutations", competences: [
        { code: "F1-RM-C1", libelle: "Analyser un roman du XXe siècle", prerequis: ["F2-RL-C2"] },
      ]},
    ],
    "Terminale": [
      { nom: "Préparation au bac", competences: [
        { code: "FT-PB-C1", libelle: "Maîtriser la dissertation", prerequis: ["F1-DI-C2"] },
        { code: "FT-PB-C2", libelle: "Maîtriser le commentaire", prerequis: ["F2-CO-C2"] },
      ]},
      { nom: "Littérature et philosophie", competences: [
        { code: "FT-LP-C1", libelle: "Lier littérature et philosophie", prerequis: ["F1-RM-C1"] },
      ]},
    ],
  },
  PC: {
    "3eme": [
      { nom: "L'eau et ses propriétés", competences: [
        { code: "P3-EA-C1", libelle: "Comprendre les états de la matière" },
        { code: "P3-EA-C2", libelle: "Analyser la composition de l'eau", prerequis: ["P3-EA-C1"] },
      ]},
      { nom: "Électricité", competences: [
        { code: "P3-EL-C1", libelle: "Comprendre un circuit électrique" },
        { code: "P3-EL-C2", libelle: "Mesurer tension et intensité", prerequis: ["P3-EL-C1"] },
      ]},
    ],
    "2nde": [
      { nom: "Constitution de la matière", competences: [
        { code: "P2-CM-C1", libelle: "Modèle de l'atome" },
        { code: "P2-CM-C2", libelle: "Classification périodique", prerequis: ["P2-CM-C1"] },
      ]},
      { nom: "Mouvements et forces", competences: [
        { code: "P2-MF-C1", libelle: "Décrire un mouvement" },
        { code: "P2-MF-C2", libelle: "Principe d'inertie", prerequis: ["P2-MF-C1"] },
      ]},
    ],
    "1ere": [
      { nom: "Réactions chimiques", competences: [
        { code: "P1-RC-C1", libelle: "Équilibrer une équation chimique", prerequis: ["P2-CM-C2"] },
        { code: "P1-RC-C2", libelle: "Calculer des quantités de matière", prerequis: ["P1-RC-C1"] },
      ]},
      { nom: "Énergie mécanique", competences: [
        { code: "P1-EM-C1", libelle: "Énergie cinétique et potentielle", prerequis: ["P2-MF-C2"] },
        { code: "P1-EM-C2", libelle: "Conservation de l'énergie", prerequis: ["P1-EM-C1"] },
      ]},
    ],
    "Terminale": [
      { nom: "Mécanique de Newton", competences: [
        { code: "PT-MN-C1", libelle: "Lois de Newton", prerequis: ["P1-EM-C2"] },
        { code: "PT-MN-C2", libelle: "Applications aux mouvements", prerequis: ["PT-MN-C1"] },
      ]},
      { nom: "Ondes et lumière", competences: [
        { code: "PT-OL-C1", libelle: "Propriétés des ondes" },
        { code: "PT-OL-C2", libelle: "Spectres et lumière", prerequis: ["PT-OL-C1"] },
      ]},
    ],
  },
  SVT: {
    "3eme": [
      { nom: "Le corps humain", competences: [
        { code: "S3-CH-C1", libelle: "Comprendre le fonctionnement des organes" },
        { code: "S3-CH-C2", libelle: "Le système nerveux", prerequis: ["S3-CH-C1"] },
      ]},
      { nom: "Environnement et écosystèmes", competences: [
        { code: "S3-EC-C1", libelle: "Identifier les écosystèmes" },
        { code: "S3-EC-C2", libelle: "Impact humain sur l'environnement", prerequis: ["S3-EC-C1"] },
      ]},
    ],
    "2nde": [
      { nom: "La cellule", competences: [
        { code: "S2-CE-C1", libelle: "Structure de la cellule" },
        { code: "S2-CE-C2", libelle: "Division cellulaire", prerequis: ["S2-CE-C1"] },
      ]},
      { nom: "Génétique", competences: [
        { code: "S2-GE-C1", libelle: "ADN et information génétique", prerequis: ["S2-CE-C1"] },
        { code: "S2-GE-C2", libelle: "Hérédité et caractères", prerequis: ["S2-GE-C1"] },
      ]},
    ],
    "1ere": [
      { nom: "Génétique et évolution", competences: [
        { code: "S1-GE-C1", libelle: "Mutations et évolution", prerequis: ["S2-GE-C2"] },
        { code: "S1-GE-C2", libelle: "Sélection naturelle", prerequis: ["S1-GE-C1"] },
      ]},
    ],
    "Terminale": [
      { nom: "Immunologie", competences: [
        { code: "ST-IM-C1", libelle: "Système immunitaire", prerequis: ["S3-CH-C2"] },
        { code: "ST-IM-C2", libelle: "Réponse immunitaire", prerequis: ["ST-IM-C1"] },
      ]},
      { nom: "Écosystèmes et biodiversité", competences: [
        { code: "ST-EB-C1", libelle: "Dynamique des écosystèmes", prerequis: ["S3-EC-C2"] },
      ]},
    ],
  },
};

// ─── Mapping matières ──────────────────────────────────────────────────
const MATIERE_MAP = {
  MATH: "mat-MATH",
  FR: "mat-FR",
  PC: "mat-PC",
  SVT: "mat-SVT",
};

const TENANT_ID = "tenant-ambouli";
const TOTAL_SEMAINES = 44;

// ─── Répartition égale sur les semaines ────────────────────────────────
function repartirEgalement(nbChapitres, totalSemaines) {
  if (nbChapitres === 0) return [];
  const base = Math.floor(totalSemaines / nbChapitres);
  const reste = totalSemaines % nbChapitres;
  const repartition = [];
  let curseur = 1;
  for (let i = 0; i < nbChapitres; i++) {
    const duree = base + (i < reste ? 1 : 0);
    repartition.push({ semaineDebut: curseur, semaineFin: curseur + duree - 1 });
    curseur += duree;
  }
  return repartition;
}

async function main() {
  console.log("🔧 Enrichissement du curriculum + re-planification\n");

  // ── 1. Récupérer les années ──────────────────────────────────────────
  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, libelle: true, statut: true },
    orderBy: { dateDebut: "asc" },
  });
  console.log(`Années: ${annees.map(a => `${a.libelle}(${a.statut})`).join(", ")}`);

  // ── 2. Pour chaque matière du CURRICULUM, enrichir les chapitres ─────
  let chapitresCrees = 0;
  let chapitresRenommes = 0;
  let competencesCrees = 0;

  for (const [matCode, matiereId] of Object.entries(MATIERE_MAP)) {
    for (const [niveau, chapitreDefs] of Object.entries(CURRICULUM[matCode])) {
      // Chapitres existants pour cette matière × niveau
      const existants = await prisma.chapitre.findMany({
        where: { tenantId: TENANT_ID, matiereId, niveau },
        select: { id: true, nom: true, ordre: true },
        orderBy: { ordre: "asc" },
      });

      // Map des codes de compétence → ID (pour les prérequis)
      const compCodeToId = new Map();

      // 2a. Renommer les chapitres existants avec leurs vrais noms
      for (let i = 0; i < Math.min(existants.length, chapitreDefs.length); i++) {
        const chap = existants[i];
        const def = chapitreDefs[i];
        if (chap.nom !== def.nom) {
          await prisma.chapitre.update({
            where: { id: chap.id },
            data: { nom: def.nom },
          });
          chapitresRenommes++;
        }

        // Récupérer les compétences existantes de ce chapitre
        const compsExistantes = await prisma.competence.findMany({
          where: { chapitreId: chap.id },
          select: { id: true, code: true, ordre: true },
          orderBy: { ordre: "asc" },
        });

        // Renommer les compétences existantes
        for (let j = 0; j < Math.min(compsExistantes.length, def.competences.length); j++) {
          const comp = compsExistantes[j];
          const compDef = def.competences[j];
          if (comp.code !== compDef.code || comp.libelle !== compDef.libelle) {
            // Vérifier si une compétence avec ce code existe déjà
            const existAvecCode = await prisma.competence.findFirst({
              where: { code: compDef.code, tenantId: TENANT_ID },
            });
            if (!existAvecCode) {
              await prisma.competence.update({
                where: { id: comp.id },
                data: { code: compDef.code, libelle: compDef.libelle },
              });
            }
          }
          compCodeToId.set(compDef.code, comp.id);
        }

        // Ajouter les compétences manquantes
        for (let j = compsExistantes.length; j < def.competences.length; j++) {
          const compDef = def.competences[j];
          const newComp = await prisma.competence.create({
            data: {
              tenantId: TENANT_ID,
              chapitreId: chap.id,
              code: compDef.code,
              libelle: compDef.libelle,
              ordre: j + 1,
            },
          }).catch(() => null);
          if (newComp) {
            compCodeToId.set(compDef.code, newComp.id);
            competencesCrees++;
          }
        }
      }

      // 2b. Ajouter les chapitres manquants (3, 4, 5…)
      for (let i = existants.length; i < chapitreDefs.length; i++) {
        const def = chapitreDefs[i];
        const chapId = `chap-${matCode}-${niveau}-${i + 1}`;
        const newChap = await prisma.chapitre.create({
          data: {
            id: chapId,
            tenantId: TENANT_ID,
            matiereId,
            nom: def.nom,
            niveau,
            ordre: i + 1,
          },
        }).catch(() => null);
        if (newChap) {
          chapitresCrees++;
          // Créer les compétences
          for (let j = 0; j < def.competences.length; j++) {
            const compDef = def.competences[j];
            const newComp = await prisma.competence.create({
              data: {
                tenantId: TENANT_ID,
                chapitreId: newChap.id,
                code: compDef.code,
                libelle: compDef.libelle,
                ordre: j + 1,
              },
            }).catch(() => null);
            if (newComp) {
              compCodeToId.set(compDef.code, newComp.id);
              competencesCrees++;
            }
          }
        }
      }
    }
  }

  console.log(`\n✅ Chapitres renommés: ${chapitresRenommes}`);
  console.log(`✅ Chapitres créés: ${chapitresCrees}`);
  console.log(`✅ Compétences créées: ${competencesCrees}`);

  // ── 3. Configurer les prérequis (auto-relation many-to-many) ───────
  let prerequisCount = 0;
  for (const [matCode] of Object.entries(MATIERE_MAP)) {
    for (const [niveau, chapitreDefs] of Object.entries(CURRICULUM[matCode])) {
      for (const def of chapitreDefs) {
        for (const compDef of def.competences) {
          if (!compDef.prerequis) continue;
          const comp = await prisma.competence.findFirst({
            where: { code: compDef.code, tenantId: TENANT_ID },
            select: { id: true },
          });
          if (!comp) continue;
          for (const prereqCode of compDef.prerequis) {
            const prereq = await prisma.competence.findFirst({
              where: { code: prereqCode, tenantId: TENANT_ID },
              select: { id: true },
            });
            if (!prereq) continue;
            // Connecter le prérequis via l'auto-relation
            await prisma.competence.update({
              where: { id: comp.id },
              data: { prerequis: { connect: { id: prereq.id } } },
            }).catch(() => {});
            prerequisCount++;
          }
        }
      }
    }
  }
  console.log(`✅ Prérequis configurés: ${prerequisCount}`);

  // ── 4. Re-planifier TOUS les chapitres sur 44 semaines ──────────────
  // Pour chaque année OUVERTE ou CLOTUREE, on re-planifie.
  // On regroupe par matière × niveau et on répartit sur 44 semaines.
  let planifCount = 0;

  for (const annee of annees) {
    // Supprimer les anciennes planifications de cette année
    const deleted = await prisma.planificationChapitre.deleteMany({
      where: { tenantId: TENANT_ID, anneeId: annee.id, classeId: null },
    });
    console.log(`\n📅 ${annee.libelle}: ${deleted.count} anciennes planifs supprimées`);

    // Récupérer TOUS les chapitres du tenant, groupés par matière × niveau
    const tousChapitres = await prisma.chapitre.findMany({
      where: { tenantId: TENANT_ID },
      select: { id: true, matiereId: true, niveau: true, ordre: true },
      orderBy: [{ matiereId: "asc" }, { niveau: "asc" }, { ordre: "asc" }],
    });

    // Grouper par matière × niveau
    const parMN = new Map();
    for (const c of tousChapitres) {
      const key = `${c.matiereId}|${c.niveau}`;
      if (!parMN.has(key)) parMN.set(key, []);
      parMN.get(key).push(c);
    }

    // Pour chaque groupe, répartir sur 44 semaines
    for (const [key, liste] of parMN) {
      const repartition = repartirEgalement(liste.length, TOTAL_SEMAINES);
      for (let i = 0; i < liste.length; i++) {
        const chap = liste[i];
        const { semaineDebut, semaineFin } = repartition[i];
        const maintenant = new Date();
        const anneeDebut = annee.libelle.split("-")[0];
        // Statut: TRAITE pour les chapitres passés si l'année est cloturée
        const statut = annee.statut === "CLOTUREE" ? "TRAITE" :
          semaineFin < 20 ? "TRAITE" :
          semaineDebut < 20 ? "EN_COURS" : "PREVU";

        await prisma.planificationChapitre.create({
          data: {
            tenantId: TENANT_ID,
            anneeId: annee.id,
            chapitreId: chap.id,
            classeId: null,
            semaineDebut,
            semaineFin,
            heuresPrevues: Math.ceil((semaineFin - semaineDebut + 1) * 3),
            semaineDebutInitiale: semaineDebut,
            semaineFinInitiale: semaineFin,
            statut,
            demarreLe: statut !== "PREVU" ? new Date(parseInt(anneeDebut), 8, 15) : null,
            traiteLe: statut === "TRAITE" ? new Date(parseInt(anneeDebut), 11, 15) : null,
          },
        }).catch(() => {});
        planifCount++;
      }
    }
  }

  console.log(`\n✅ Planifications créées: ${planifCount}`);

  // ── 5. Vérification finale ──────────────────────────────────────────
  const totalChap = await prisma.chapitre.count({ where: { tenantId: TENANT_ID } });
  const totalPlanif = await prisma.planificationChapitre.count({ where: { tenantId: TENANT_ID } });
  const totalComp = await prisma.competence.count({ where: { tenantId: TENANT_ID } });

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  RÉCAPITULATIF FINAL`);
  console.log(`  Chapitres:       ${totalChap}`);
  console.log(`  Compétences:     ${totalComp}`);
  console.log(`  Planifications:  ${totalPlanif}`);
  console.log(`══════════════════════════════════════════════`);

  // Vérifier la couverture
  for (const annee of annees) {
    const planifs = await prisma.planificationChapitre.findMany({
      where: { tenantId: TENANT_ID, anneeId: annee.id, classeId: null },
      select: { semaineDebut: true, semaineFin: true },
    });
    if (planifs.length > 0) {
      const debutMin = Math.min(...planifs.map(p => p.semaineDebut));
      const finMax = Math.max(...planifs.map(p => p.semaineFin));
      console.log(`  ${annee.libelle}: S${debutMin} → S${finMax} (${planifs.length} planifs)`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
