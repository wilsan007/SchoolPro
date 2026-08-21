import { describe, it, expect } from "vitest";
import { filtreHorizon } from "@/lib/demo-horizon";

/**
 * Ces tests verrouillent une décision métier, pas une mécanique : QUOI est
 * masqué quand l'horloge de démonstration recule, et surtout quoi ne l'est pas.
 * La distinction entre un fait constaté et un événement planifié est ce qui
 * sépare une démonstration crédible d'écrans vides.
 */
const FEVRIER = new Date("2026-02-15T10:00:00.000Z");

describe("filtreHorizon — faits constatés", () => {
  it("borne les notes sur leur date d'événement, pas sur createdAt", () => {
    // `createdAt` est identique sur toutes les lignes du jeu de démonstration :
    // s'en servir afficherait tout ou rien.
    expect(filtreHorizon("Note", "findMany", FEVRIER)).toEqual({
      date: { lte: FEVRIER },
    });
  });

  it("borne les incidents et les absences", () => {
    expect(filtreHorizon("Incident", "findMany", FEVRIER)).toEqual({
      date: { lte: FEVRIER },
    });
    expect(filtreHorizon("Absence", "count", FEVRIER)).toEqual({
      date: { lte: FEVRIER },
    });
  });

  it("borne un devoir sur sa date de remise aux élèves, pas sur son rendu", () => {
    expect(filtreHorizon("Devoir", "findMany", FEVRIER)).toEqual({
      dateDonne: { lte: FEVRIER },
    });
  });

  it("borne les prédictions LEARNOS sur leur date d'émission", () => {
    // Sans cela, la démonstration « prédirait » ce qu'elle a déjà sous les yeux.
    expect(filtreHorizon("PredictionDifficulte", "findMany", FEVRIER)).toEqual({
      emiseLe: { lte: FEVRIER },
    });
  });
});

describe("filtreHorizon — événements planifiés", () => {
  // Un examen programmé en avril est un élément de calendrier : le masquer en
  // février viderait « prochain examen », l'écran même qu'il s'agit de montrer.
  it.each(["Examen", "Evaluation", "SessionExamen", "Evenement", "Réunion"])(
    "laisse %s hors horizon",
    (modele) => {
      expect(filtreHorizon(modele, "findMany", FEVRIER)).toBeNull();
    }
  );
});

describe("filtreHorizon — modèles structurels", () => {
  // Les masquer viderait les listes au lieu de remonter le temps.
  it.each(["Eleve", "Classe", "Matiere", "User", "Tenant", "Periode"])(
    "laisse %s hors horizon",
    (modele) => {
      expect(filtreHorizon(modele, "findMany", FEVRIER)).toBeNull();
    }
  );
});

describe("filtreHorizon — champs optionnels", () => {
  it("laisse passer les lignes à null", () => {
    // Un `lte` seul écarterait les bulletins non publiés : ils disparaîtraient
    // au lieu d'être simplement non publiés.
    expect(filtreHorizon("Bulletin", "findMany", FEVRIER)).toEqual({
      OR: [{ publishedAt: { lte: FEVRIER } }, { publishedAt: null }],
    });
  });
});

describe("filtreHorizon — portée des opérations", () => {
  it("ne borne pas findUnique", () => {
    // Son `where` n'accepte que des champs uniques : y injecter une date
    // produirait une requête invalide.
    expect(filtreHorizon("Note", "findUnique", FEVRIER)).toBeNull();
  });

  it.each(["create", "update", "delete", "upsert", "updateMany"])(
    "ne borne pas l'écriture %s",
    (operation) => {
      expect(filtreHorizon("Note", operation, FEVRIER)).toBeNull();
    }
  );

  it.each(["findMany", "findFirst", "count", "aggregate", "groupBy"])(
    "borne la lecture %s",
    (operation) => {
      expect(filtreHorizon("Note", operation, FEVRIER)).not.toBeNull();
    }
  );

  it("ne borne rien quand le modèle est inconnu", () => {
    expect(filtreHorizon(undefined, "findMany", FEVRIER)).toBeNull();
  });
});
