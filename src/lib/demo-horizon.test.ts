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

  it("borne une séance effectuée, mais laisse voir celle qui est planifiée", () => {
    // Le cahier journal se prépare à l'avance : masquer les séances PLANIFIEE
    // viderait la semaine à venir. Mais une séance EFFECTUEE est un fait : la
    // laisser visible en octobre pour décembre ferait état d'un cours qui n'a
    // pas eu lieu.
    const filtre = filtreHorizon("SeancePedagogique", "findMany", FEVRIER);
    expect(filtre).toEqual({
      OR: [{ statut: "PLANIFIEE" }, { date: { lte: FEVRIER } }],
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
  it.each(["Examen", "SessionExamen", "Evenement", "Réunion"])(
    "laisse %s hors horizon",
    (modele) => {
      expect(filtreHorizon(modele, "findMany", FEVRIER)).toBeNull();
    }
  );
});

describe("filtreHorizon — Evaluation (hybride)", () => {
  // L'évaluation est un hybride : PLANIFIE = calendrier (visible à l'avance),
  // TERMINE = fait constaté (borné par la date). Sans cette nuance, une
  // évaluation terminée en février était visible en octobre — la démonstration
  // montrait des résultats qui n'avaient pas encore eu lieu.
  it("exempte les évaluations PLANIFIE de la borne temporelle", () => {
    const filtre = filtreHorizon("Evaluation", "findMany", FEVRIER);
    expect(filtre).not.toBeNull();
    // Le filtre doit contenir un OR avec l'exemption PLANIFIE
    expect(filtre).toHaveProperty("OR");
    const ou = (filtre as { OR: unknown[] }).OR;
    expect(ou[0]).toEqual({ statut: "PLANIFIE" });
  });

  it("borne les évaluations TERMINE par leur date", () => {
    const filtre = filtreHorizon("Evaluation", "findMany", FEVRIER);
    expect(filtre).not.toBeNull();
    const ou = (filtre as { OR: unknown[] }).OR;
    // Le second élément du OR doit être la borne temporelle
    expect(ou[1]).toEqual({ date: { lte: FEVRIER } });
  });

  it("borne aussi les évaluations avec un statut inconnu (fail-closed)", () => {
    // Le filtre OR [PLANIFIE, date <= maintenant] ne laisse passer que
    // PLANIFIE ou les dates passées. Un statut inconnu n'étant pas PLANIFIE,
    // il doit être borné par la date.
    const filtre = filtreHorizon("Evaluation", "findMany", FEVRIER);
    const ou = (filtre as { OR: unknown[] }).OR;
    // L'exemption ne couvre que statut = "PLANIFIE", pas les autres.
    expect(ou[0]).not.toEqual({ statut: "TERMINE" });
  });
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
