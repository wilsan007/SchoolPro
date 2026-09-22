import { describe, it, expect } from "vitest";
import {
  parseStructure,
  creditTentative,
  corrigerEtape,
  TENTATIVES_MAX,
  fiabiliteSeance,
  erreurDominante,
  vueEleve,
  type StructureQuestion,
  type EtapeQuestion,
} from "./entrainement";
import type { EtapeFaite } from "./entrainement/deroule-seance";

describe("Sous-modules d'Entraînement Autonome (src/lib/learnos/entrainement/)", () => {
  describe("structure-question.ts", () => {
    it("parse et valide une structure de question conforme", () => {
      const brute = {
        etapes: [
          {
            index: 0,
            enonce: "Calculer 2 + 2",
            format: "SAISIE_COURTE",
            reponse: "4",
            points: 1,
          },
        ],
      };
      const structure = parseStructure(brute);
      expect(structure).not.toBeNull();
      expect(structure?.etapes).toHaveLength(1);
      expect(structure?.etapes[0].reponse).toBe("4");
    });

    it("retourne null pour une structure invalide ou corrompue", () => {
      expect(parseStructure(null)).toBeNull();
      expect(parseStructure("not-a-json")).toBeNull();
      expect(parseStructure({ invalid: true })).toBeNull();
    });
  });

  describe("correction.ts", () => {
    it("attribue un crédit dégressif selon la tentative", () => {
      expect(creditTentative(1)).toBe(1);
      expect(creditTentative(2)).toBe(0.5);
      expect(creditTentative(3)).toBe(0);
      expect(creditTentative(4)).toBe(0);
      expect(TENTATIVES_MAX).toBe(3);
    });

    it("corrige une question à choix unique (CHOIX_UNIQUE)", () => {
      const etape: EtapeQuestion = {
        enonce: "Quelle est la capitale de Djibouti ?",
        format: "CHOIX_UNIQUE",
        reponse: "opt-1",
        points: 1,
        options: [
          { id: "opt-1", texte: "Djibouti-ville" },
          { id: "opt-2", texte: "Ali Sabieh", erreur: "PROCEDURAL_ERROR" },
        ],
      };

      const bon = corrigerEtape(etape, "opt-1");
      expect(bon.correcte).toBe(true);
      expect(bon.erreur).toBeNull();

      const faux = corrigerEtape(etape, "opt-2");
      expect(faux.correcte).toBe(false);
      expect(faux.erreur).toBe("PROCEDURAL_ERROR");
    });

    it("accepte la tolérance numérique pour les réponses chiffrées", () => {
      const etape: EtapeQuestion = {
        enonce: "Donner la valeur de pi approchée",
        format: "SAISIE_COURTE",
        reponse: "3.14",
        points: 1,
      };

      // Avec point
      expect(corrigerEtape(etape, "3.14").correcte).toBe(true);
      // Avec virgule
      expect(corrigerEtape(etape, "3,14").correcte).toBe(true);
      // Avec espaces superflus
      expect(corrigerEtape(etape, "  3,14  ").correcte).toBe(true);
      // Faux
      expect(corrigerEtape(etape, "3.15").correcte).toBe(false);
    });

    it("rejette les saisies vides", () => {
      const etape: EtapeQuestion = {
        enonce: "Test",
        format: "SAISIE_COURTE",
        reponse: "Bonjour",
        points: 1,
      };
      expect(corrigerEtape(etape, "").correcte).toBe(false);
      expect(corrigerEtape(etape, "   ").correcte).toBe(false);
    });
  });

  describe("deroule-seance.ts", () => {
    it("détermine l'erreur dominante parmi une liste d'étapes", () => {
      const etapes: EtapeFaite[] = [
        { index: 0, correcte: false, erreur: "PROCEDURAL_ERROR", dureeMs: 5000, reponse: "a", tentatives: 1, credit: 0 },
        { index: 1, correcte: false, erreur: "PROCEDURAL_ERROR", dureeMs: 4000, reponse: "b", tentatives: 1, credit: 0 },
        { index: 2, correcte: false, erreur: "CALCULATION_ERROR", dureeMs: 6000, reponse: "c", tentatives: 1, credit: 0 },
      ];
      expect(erreurDominante(etapes)).toBe("PROCEDURAL_ERROR");
    });

    it("calcule la fiabilité de la séance selon la cadence et les relectures", () => {
      const etapes: EtapeFaite[] = [
        { index: 0, correcte: true, erreur: null, dureeMs: 8000, reponse: "a", tentatives: 1, credit: 1 },
        { index: 1, correcte: true, erreur: null, dureeMs: 12000, reponse: "b", tentatives: 1, credit: 1 },
        { index: 2, correcte: true, erreur: null, dureeMs: 15000, reponse: "c", tentatives: 1, credit: 1 },
      ];
      const fiab = fiabiliteSeance(etapes);
      expect(fiab.facteur).toBeGreaterThan(0);
      expect(fiab.facteur).toBeLessThanOrEqual(1);
    });
  });

  describe("vue-eleve.ts", () => {
    it("masque le corrigé et la réponse attendue tant que l'étape n'est pas close", () => {
      const exercice = {
        id: "ex-1",
        ordre: 1,
        palier: "DECOUVERTE",
        regleDeclenchee: "learnos.regles.decouverte",
        motifParams: null,
        competence: { libelle: "Addition" },
        question: { enonce: "Calculer", format: "CHOIX_UNIQUE" as const },
      };

      const structure: StructureQuestion = {
        etapes: [
          {
            enonce: "Question secrète",
            format: "SAISIE_COURTE",
            reponse: "ReponseSecrete",
            points: 1,
          },
        ],
      };

      const vue = vueEleve(exercice, structure, []);
      expect(vue.etapes[0].enonce).toBe("Question secrète");
      expect(vue.etapes[0].correcte).toBeNull();
      expect(vue.etapes[0].corrige).toBeNull(); // Doit être masqué !
    });
  });
});
