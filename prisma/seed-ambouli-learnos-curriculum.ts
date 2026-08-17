/**
 * seed-ambouli-learnos-curriculum.ts — Graphe de connaissances LEARNOS.
 *
 * Crée pour chaque site × matière × niveau :
 * - Chapitres (5-8 par matière × niveau)
 * - Compétences (3-5 par chapitre, avec auto-relation prérequis)
 * - PlanificationChapitre (répartition sur l'année, semaines)
 * - PlanificationCompetence (sous-répartition)
 * - SeuilsRecommandation (par défaut + calibration par niveau × matière)
 * - EvaluationCompetence (rattachement évaluations↔compétences)
 *
 * Pleine couverture : toutes les matières × tous les niveaux.
 */

import { PrismaClient } from "@prisma/client";
import { setSeed, randInt, pick, chance, randFloat } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";

// Définition du curriculum par matière × niveau
// Chaque matière a des chapitres, chaque chapitre a des compétences
interface ChapitreDef {
  nom: string;
  competences: { code: string; libelle: string; prerequis?: string[] }[];
}

const CURRICULUM: Record<string, Record<string, ChapitreDef[]>> = {
  MATH: {
    "6ème": [
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
    "5ème": [
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
    "4ème": [
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
    "3ème": [
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
    "1ère": [
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
      { nom: "Nombres complexeses", competences: [
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
    "6ème": [
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
    "5ème": [
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
    "4ème": [
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
    "3ème": [
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
    "1ère": [
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
    "3ème": [
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
    "1ère": [
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
    "3ème": [
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
    "1ère": [
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

export interface LearnosCurriculumData {
  chapitres: Record<string, string>; // "AMB-MATH-6ème-Ch1" -> id
  competences: Record<string, string>; // code -> id
}

export async function seedLearnosCurriculum(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
): Promise<LearnosCurriculumData> {
  setSeed(20250101);
  console.log("🌱 [8/12] Création du curriculum LEARNOS (chapitres, compétences, prérequis)...");

  const chapitres: Record<string, string> = {};
  const competences: Record<string, string> = {};
  let chapCount = 0, compCount = 0;

  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";

    for (const [matiereCode, niveaux] of Object.entries(CURRICULUM)) {
      const matiereId = ref.matieres[`${siteCode}-${matiereCode}`];
      if (!matiereId) continue;

      for (const [niveau, chapitreDefs] of Object.entries(niveaux)) {
        for (let ci = 0; ci < chapitreDefs.length; ci++) {
          const cd = chapitreDefs[ci];
          const chapId = `chap-${siteCode}-${matiereCode}-${niveau}-${ci + 1}`.replace(/è|é/g, "e");
          const chap = await prisma.chapitre.create({
            data: {
              id: chapId,
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              matiereId,
              nom: cd.nom,
              niveau,
              ordre: ci + 1,
            },
          });
          chapitres[chapId] = chap.id;
          chapCount++;

          // Compétences
          for (let comp_i = 0; comp_i < cd.competences.length; comp_i++) {
            const compDef = cd.competences[comp_i];
            const comp = await prisma.competence.create({
              data: {
                tenantId: ref.tenantId,
                siteId: ref.sites[site],
                chapitreId: chap.id,
                code: compDef.code,
                libelle: compDef.libelle,
                ordre: comp_i + 1,
              },
            });
            competences[compDef.code] = comp.id;
            compCount++;
          }
        }
      }
    }
  }

  // Maintenant qu'on a toutes les compétences, créer les relations de prérequis
  let prereqCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    for (const [matiereCode, niveaux] of Object.entries(CURRICULUM)) {
      for (const [niveau, chapitreDefs] of Object.entries(niveaux)) {
        for (const cd of chapitreDefs) {
          for (const compDef of cd.competences) {
            if (!compDef.prerequis) continue;
            const compId = competences[compDef.code];
            if (!compId) continue;
            for (const prereqCode of compDef.prerequis) {
              const prereqId = competences[prereqCode];
              if (!prereqId) continue;
              await prisma.competence.update({
                where: { id: compId },
                data: { prerequis: { connect: { id: prereqId } } },
              });
              prereqCount++;
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ Chapitres: ${chapCount}`);
  console.log(`  ✅ Compétences: ${compCount} (avec ${prereqCount} liens de prérequis)`);

  // ── Planifications (chapitres sur l'année) ──────────────────
  let planifCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    for (const anneeKey of ["y2024", "y2025"] as const) {
      const anneeId = ref.annees[anneeKey];
      for (const [matiereCode, niveaux] of Object.entries(CURRICULUM)) {
        for (const [niveau, chapitreDefs] of Object.entries(niveaux)) {
          // Trouver les classes de ce niveau pour ce site
          const anneeLib = anneeKey === "y2024" ? "2024-2025" : "2025-2026";
          const siteClasses = (classes.classesBySiteYear[`${site}-${anneeLib}`] || []).filter(c => c.niveau === niveau);
          if (siteClasses.length === 0) continue;

          for (let ci = 0; ci < chapitreDefs.length; ci++) {
            const chapId = `chap-${siteCode}-${matiereCode}-${niveau}-${ci + 1}`.replace(/è|é/g, "e");
            const chapitreId = chapitres[chapId];
            if (!chapitreId) continue;

            // Planification pour chaque classe du niveau
            for (const cls of siteClasses) {
              const semaineDebut = ci * 3 + 1; // 3 semaines par chapitre
              const semaineFin = semaineDebut + 2;
              await prisma.planificationChapitre.create({
                data: {
                  tenantId: ref.tenantId,
                  siteId: ref.sites[site],
                  anneeId,
                  chapitreId,
                  classeId: cls.id,
                  semaineDebut,
                  semaineFin,
                  heuresPrevues: 6,
                  semaineDebutInitiale: semaineDebut,
                  semaineFinInitiale: semaineFin,
                  statut: anneeKey === "y2024" ? "TRAITE" : ci < 3 ? "TRAITE" : "EN_COURS",
                  demarreLe: anneeKey === "y2024" ? new Date(2024, 8 + Math.floor(semaineDebut / 4), 15) : new Date(2025, 8 + Math.floor(semaineDebut / 4), 15),
                  traiteLe: anneeKey === "y2024" || ci < 3 ? new Date(anneeKey === "y2024" ? 2025 : 2026, 0 + ci, 30) : null,
                },
              }).catch(() => {}); // Ignore doublons
              planifCount++;
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ Planifications chapitres: ${planifCount}`);

  // ── Seuils de recommandation (par défaut + calibration) ─────
  for (const site of ["ambouli", "arhiba"] as const) {
    // Seuil global par site
    await prisma.seuilsRecommandation.create({
      data: {
        tenantId: ref.tenantId,
        siteId: ref.sites[site],
        seuilCritique: 0.35,
        seuilFragile: 0.55,
        seuilConsolide: 0.8,
        seuilAvance: 0.92,
        confianceMinimale: 0.5,
        prerequisBloquantsMin: 2,
        declenchementPlanCritiques: 2,
        declenchementPlanAvances: 3,
      },
    }).catch(() => {});

    // Calibration par niveau × matière (quelques-unes)
    for (const [matiereCode, niveaux] of Object.entries(CURRICULUM)) {
      const matiereId = ref.matieres[`${site === "ambouli" ? "AMB" : "ARH"}-${matiereCode}`];
      if (!matiereId) continue;
      for (const niveau of Object.keys(niveaux)) {
        // Variation entre sites pour comparaison
        const variation = site === "ambouli" ? 0 : 0.05;
        await prisma.calibrationSeuil.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            niveau,
            matiereId,
            seuilCritique: 0.35 + variation,
            seuilFragile: 0.55 + variation,
            seuilConsolide: 0.8 - variation,
            seuilAvance: 0.92 - variation,
            confianceMinimale: 0.5,
            echantillon: randInt(50, 200),
            ameliorationMesuree: chance(0.6),
            gainPrecision: randFloat(2, 8),
          },
        }).catch(() => {});
      }
    }
  }
  console.log(`  ✅ Seuils & calibrations: créés par site × niveau × matière`);

  // ── EvaluationCompetence (rattachement évaluations↔compétences) ─
  let evalCompCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    for (const annee of ["2024-2025", "2025-2026"]) {
      const siteClasses = classes.classesBySiteYear[`${site}-${annee}`] || [];
      for (const cls of siteClasses) {
        const niveau = cls.niveau;
        // Trouver les évaluations de cette classe
        const evals = await prisma.evaluation.findMany({ where: { classeId: cls.id }, take: 10 });
        for (const ev of evals) {
          const matiere = await prisma.matiere.findUnique({ where: { id: ev.matiereId } });
          if (!matiere) continue;
          const matiereCode = matiere.code;
          const niveauCurriculum = CURRICULUM[matiereCode]?.[niveau];
          if (!niveauCurriculum) continue;
          // Rattacher à 1-2 compétences du premier chapitre
          const comps = niveauCurriculum[0]?.competences || [];
          for (const compDef of comps.slice(0, 2)) {
            const compId = competences[compDef.code];
            if (!compId) continue;
            await prisma.evaluationCompetence.create({
              data: {
                tenantId: ref.tenantId,
                siteId: ref.sites[site],
                evaluationId: ev.id,
                competenceId: compId,
                poids: 0.5,
              },
            }).catch(() => {});
            evalCompCount++;
          }
        }
      }
    }
  }
  console.log(`  ✅ ÉvaluationCompétence: ${evalCompCount} rattachements`);

  return { chapitres, competences };
}
