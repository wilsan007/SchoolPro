import { describe, it, expect } from "vitest";
import {
  detectJour,
  detectCellType,
  parseMatiereNiveau,
  snapTimeToGrid,
  parsePlageHoraire,
  splitCelluleGrille,
  detectFormat,
  parseEmploiFile,
} from "@/lib/import-parser";

describe("import-parser", () => {
  describe("detectJour", () => {
    it("reconnaît les jours en français et abréviations", () => {
      expect(detectJour("Lundi")).toBe("LUNDI");
      expect(detectJour("lun")).toBe("LUNDI");
      expect(detectJour("Mardi")).toBe("MARDI");
      expect(detectJour("Mercredi")).toBe("MERCREDI");
      expect(detectJour("Samedi")).toBe("SAMEDI");
      expect(detectJour("Dimanche")).toBe("DIMANCHE");
    });

    it("reconnaît les jours en anglais", () => {
      expect(detectJour("Monday")).toBe("LUNDI");
      expect(detectJour("Tuesday")).toBe("MARDI");
      expect(detectJour("Friday")).toBe("VENDREDI");
    });

    it("renvoie null pour un libellé inconnu", () => {
      expect(detectJour("Mathématiques")).toBeNull();
      expect(detectJour("")).toBeNull();
    });
  });

  describe("detectCellType", () => {
    it("détecte la récréation", () => {
      expect(detectCellType("Récréation")).toBe("recreation");
      expect(detectCellType("Pause déjeuner")).toBe("recreation");
      expect(detectCellType("recreation")).toBe("recreation");
      expect(detectCellType("Libre")).toBe("recreation");
      expect(detectCellType("Break")).toBe("recreation");
    });

    it("détecte l'évaluation", () => {
      expect(detectCellType("Évaluation")).toBe("evaluation");
      expect(detectCellType("Examen")).toBe("evaluation");
      expect(detectCellType("Contrôle")).toBe("evaluation");
      expect(detectCellType("Devoir")).toBe("evaluation");
      expect(detectCellType("Composition")).toBe("evaluation");
      expect(detectCellType("Interrogation")).toBe("evaluation");
    });

    it("renvoie cours pour une matière normale", () => {
      expect(detectCellType("Mathématiques")).toBe("cours");
      expect(detectCellType("Français")).toBe("cours");
      expect(detectCellType("")).toBe("cours");
    });
  });

  describe("parseMatiereNiveau", () => {
    it("extrait le niveau suffixé", () => {
      expect(parseMatiereNiveau("Lecture 1")).toEqual({ nom: "Lecture", niveau: "1" });
      expect(parseMatiereNiveau("Lecture 2")).toEqual({ nom: "Lecture", niveau: "2" });
      expect(parseMatiereNiveau("Maths 3")).toEqual({ nom: "Maths", niveau: "3" });
    });

    it("renvoie niveau null sans suffixe numérique", () => {
      expect(parseMatiereNiveau("Mathématiques")).toEqual({ nom: "Mathématiques", niveau: null });
      expect(parseMatiereNiveau("Français")).toEqual({ nom: "Français", niveau: null });
    });
  });

  describe("snapTimeToGrid", () => {
    it("arrondit vers le bas pour le début (grille 30 min)", () => {
      expect(snapTimeToGrid("08:05", 30, "down")).toBe("08:00");
      expect(snapTimeToGrid("08:17", 30, "down")).toBe("08:00");
      expect(snapTimeToGrid("08:45", 30, "down")).toBe("08:30");
    });

    it("arrondit vers le haut pour la fin (grille 30 min)", () => {
      expect(snapTimeToGrid("09:05", 30, "up")).toBe("09:30");
      expect(snapTimeToGrid("09:30", 30, "up")).toBe("09:30");
      expect(snapTimeToGrid("08:01", 30, "up")).toBe("08:30");
    });

    it("grille fine 10 min", () => {
      expect(snapTimeToGrid("08:04", 10, "down")).toBe("08:00");
      expect(snapTimeToGrid("08:07", 10, "up")).toBe("08:10");
    });

    it("accepte les formats souples (8h, 8h30)", () => {
      expect(snapTimeToGrid("8h", 30, "down")).toBe("08:00");
      expect(snapTimeToGrid("8h30", 30, "down")).toBe("08:30");
    });
  });

  describe("parsePlageHoraire", () => {
    it("extrait début/fin d'une plage", () => {
      expect(parsePlageHoraire("08:00-09:00")).toEqual({ debut: "08:00", fin: "09:00" });
      expect(parsePlageHoraire("8h - 9h")).toEqual({ debut: "08:00", fin: "09:00" });
      expect(parsePlageHoraire("08:00–09:00")).toEqual({ debut: "08:00", fin: "09:00" });
    });

    it("renvoie null si incomplet", () => {
      expect(parsePlageHoraire("08:00")).toBeNull();
      expect(parsePlageHoraire("")).toBeNull();
    });
  });

  describe("splitCelluleGrille", () => {
    it("découpe 'Matière / Enseignant / Salle'", () => {
      expect(splitCelluleGrille("Mathématiques / M. Ahmed / Salle 12")).toEqual({
        matiere: "Mathématiques",
        enseignant: "M. Ahmed",
        salle: "Salle 12",
      });
    });

    it("découpe avec séparateur |", () => {
      expect(splitCelluleGrille("Français | Mme Fatima")).toEqual({
        matiere: "Français",
        enseignant: "Mme Fatima",
        salle: null,
      });
    });

    it("matière seule", () => {
      expect(splitCelluleGrille("Sciences")).toEqual({
        matiere: "Sciences",
        enseignant: null,
        salle: null,
      });
    });
  });

  describe("detectFormat", () => {
    it("détecte le format grille (colonne horaire + jours)", () => {
      expect(detectFormat(["Horaire", "Lundi", "Mardi", "Mercredi"])).toBe("grille");
      expect(detectFormat(["Heure", "Lun", "Mar", "Mer"])).toBe("grille");
    });

    it("détecte le format liste (Jour + Heure début + Matière)", () => {
      expect(detectFormat(["Jour", "Heure début", "Heure fin", "Matière", "Enseignant", "Salle"])).toBe("liste");
      expect(detectFormat(["Jour", "Début", "Fin", "Matière"])).toBe("liste");
    });

    it("renvoie inconnu si aucune structure reconnue", () => {
      expect(detectFormat(["Col1", "Col2"])).toBe("inconnu");
    });
  });

  describe("parseEmploiFile — CSV format grille", () => {
    it("parse un CSV au format grille", async () => {
      const csv = [
        "Horaire,Lundi,Mardi,Mercredi",
        "08:00-09:00,Mathématiques / M. Ahmed,Français / Mme Fatima,Sciences",
        "09:00-10:00,Récréation,Anglais,Histoire",
        "10:00-11:00,Évaluation,Géographie / M. Omar / Labo,",
      ].join("\n");
      const result = await parseEmploiFile(Buffer.from(csv, "utf-8"), "edt.csv", null);
      expect(result.format).toBe("grille");
      // Lundi 08:00 Mathématiques, Mardi 09:00 Anglais (récré ignorée), Mercredi 08:00 Sciences
      // Lundi 09:00 Récréation → ignoré ; Lundi 10:00 Évaluation
      const lundi = result.creneaux.filter((c) => c.jour === "LUNDI");
      expect(lundi).toHaveLength(2);
      expect(lundi[0].matiere).toBe("Mathématiques");
      expect(lundi[0].enseignant).toBe("M. Ahmed");
      expect(lundi[1].matiere).toBe("Évaluation");
      expect(lundi[1].isEvaluation).toBe(true);
      // Mercredi : 08:00 Sciences, 09:00 Histoire, 10:00 cellule vide → 2 créneaux
      const mercredi = result.creneaux.filter((c) => c.jour === "MERCREDI");
      expect(mercredi).toHaveLength(2);
      expect(mercredi[0].matiere).toBe("Sciences");
      expect(mercredi[1].matiere).toBe("Histoire");
      // Mardi 10:00 : Géographie / M. Omar / Labo
      const mardiDernier = result.creneaux.filter((c) => c.jour === "MARDI").pop();
      expect(mardiDernier?.matiere).toBe("Géographie");
      expect(mardiDernier?.salle).toBe("Labo");
    });
  });

  describe("parseEmploiFile — CSV format liste", () => {
    it("parse un CSV au format liste", async () => {
      const csv = [
        "Jour,Heure début,Heure fin,Matière,Enseignant,Salle",
        "Lundi,08:00,09:00,Mathématiques,M. Ahmed,Salle 12",
        "Mardi,09:00,10:00,Pause déjeuner,,",
        "Mercredi,10:00,11:00,Devoir,Mme Fatima,",
      ].join("\n");
      const result = await parseEmploiFile(Buffer.from(csv, "utf-8"), "edt.csv", null);
      expect(result.format).toBe("liste");
      expect(result.creneaux).toHaveLength(2);
      expect(result.creneaux[0].matiere).toBe("Mathématiques");
      expect(result.creneaux[0].salle).toBe("Salle 12");
      // Pause déjeuner → ignoré (recreation)
      expect(result.creneaux.find((c) => c.matiere === "Pause déjeuner")).toBeUndefined();
      // Devoir → Évaluation
      expect(result.creneaux[1].matiere).toBe("Évaluation");
      expect(result.creneaux[1].isEvaluation).toBe(true);
    });
  });

  describe("parseEmploiFile — snapping", () => {
    it("applique le snapping quand stepMinutes est fourni", async () => {
      const csv = [
        "Horaire,Lundi",
        "08:05-08:55,Mathématiques",
      ].join("\n");
      const result = await parseEmploiFile(Buffer.from(csv, "utf-8"), "edt.csv", 30);
      expect(result.creneaux[0].heureDebut).toBe("08:00"); // down
      expect(result.creneaux[0].heureFin).toBe("09:00"); // up
    });
  });

  describe("parseEmploiFile — format non supporté", () => {
    it("renvoie un avertissement pour .pdf", async () => {
      const result = await parseEmploiFile(Buffer.from("not a pdf"), "edt.pdf", null);
      expect(result.creneaux).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("non supporté");
    });
  });
});
