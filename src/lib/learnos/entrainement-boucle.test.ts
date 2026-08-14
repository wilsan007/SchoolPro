/**
 * Fermeture de la boucle après un exercice.
 *
 * Fichier séparé de `entrainement.test.ts`, qui vérifie les fonctions pures
 * (correction, crédit, fiabilité). Ici on teste un **câblage** : que produire
 * une preuve entraîne bien toute la suite — profil, recommandation, étape de
 * parcours — et pas seulement le profil.
 *
 * C'est précisément la classe de défaut qu'aucun test de fonction pure ne peut
 * attraper : chaque brique marchait, mais deux d'entre elles n'étaient
 * appelées par personne sur ce chemin. Une compétence montait, et l'étape de
 * plan qu'elle devait valider restait ouverte indéfiniment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    exerciceAssigne: { findFirst: vi.fn(), count: vi.fn() },
    exerciceReponse: { upsert: vi.fn(), update: vi.fn(), count: vi.fn() },
    feuilleExercices: { updateMany: vi.fn() },
    learningEvidence: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/learnos/learning-twin", () => ({
  recalculerProfil: vi.fn(),
}));

vi.mock("@/lib/learnos/recommendation-engine", () => ({
  recalculerRecommandation: vi.fn(),
}));

vi.mock("@/lib/learnos/plan-engine", () => ({
  synchroniserEtapes: vi.fn(),
  evaluerBesoinDePlans: vi.fn(),
}));

// Mockés parce qu'ils sont hors sujet ici, et qu'ils tirent chacun une grappe
// d'imports (banque de questions, génération) sans rapport avec la boucle.
vi.mock("@/lib/learnos/exercice-selector", () => ({
  composerFeuille: vi.fn(),
}));

vi.mock("@/lib/learnos/attestation", () => ({
  proposerAttestationsApresSeance: vi.fn().mockResolvedValue(0),
}));

import prisma from "@/lib/prisma";
import { recalculerProfil } from "@/lib/learnos/learning-twin";
import { recalculerRecommandation } from "@/lib/learnos/recommendation-engine";
import { synchroniserEtapes, evaluerBesoinDePlans } from "@/lib/learnos/plan-engine";
import { soumettreEtape } from "@/lib/learnos/entrainement";

const TENANT = "t1";
const ELEVE = "e1";
const COMPETENCE = "c-fractions";
const EXERCICE = "x1";
const FEUILLE = "f1";
const MAINTENANT = new Date("2026-03-10T10:00:00Z");

const claims = { role: "TENANT_ADMIN" as const, siteId: null, siteIds: [] };

/**
 * Exercice à UNE étape : y répondre juste le termine, donc produit la preuve.
 * Format `SAISIE_COURTE` — le seul qui n'exige aucune détokenisation, ce qui
 * garde le test centré sur la boucle et non sur la correction.
 */
function exerciceCharge(typeFeuille: string) {
  return {
    id: EXERCICE,
    palier: "APPLICATION",
    regleDeclenchee: "exercice_etape_plan",
    competenceId: COMPETENCE,
    question: {
      id: "q1",
      structure: {
        etapes: [
          { enonce: "Combien font 1/4 + 1/4 ?", format: "SAISIE_COURTE", reponse: "1/2", points: 1 },
        ],
      },
    },
    reponse: null,
    feuille: {
      id: FEUILLE,
      eleveId: ELEVE,
      siteId: null,
      type: typeFeuille,
      matiereId: "m1",
    },
  };
}

function preparer(typeFeuille: string, { feuilleTerminee = true } = {}) {
  vi.mocked(prisma.exerciceAssigne.findFirst).mockResolvedValue(
    exerciceCharge(typeFeuille) as never
  );
  vi.mocked(prisma.exerciceReponse.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.feuilleExercices.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.learningEvidence.upsert).mockResolvedValue({ id: "ev1" } as never);
  vi.mocked(prisma.exerciceReponse.update).mockResolvedValue({} as never);
  // Zéro exercice restant = la feuille se referme.
  vi.mocked(prisma.exerciceAssigne.count).mockResolvedValue(feuilleTerminee ? 0 : 1);
  vi.mocked(prisma.exerciceReponse.count).mockResolvedValue(0);
}

function repondre(reponse = "1/2") {
  return soumettreEtape(
    TENANT,
    claims,
    { feuilleId: FEUILLE, exerciceId: EXERCICE, index: 0, reponse },
    MAINTENANT
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("un exercice terminé referme toute la chaîne", () => {
  it("recalcule le profil de la compétence travaillée", async () => {
    preparer("jalon");
    await repondre();

    expect(recalculerProfil).toHaveBeenCalledWith(TENANT, ELEVE, COMPETENCE, MAINTENANT);
  });

  // C'est le maillon qui manquait : la maîtrise montait, mais la
  // recommandation ouverte sur cette compétence n'était jamais résolue.
  it("met à jour la recommandation de cette compétence", async () => {
    preparer("jalon");
    await repondre();

    expect(recalculerRecommandation).toHaveBeenCalledWith(
      TENANT,
      ELEVE,
      COMPETENCE,
      MAINTENANT
    );
  });

  // Et celui-ci : une feuille-jalon existe POUR attester une étape de parcours.
  // Sans cet appel, `EtapePlan.statut` restait `A_FAIRE` à vie et le plan ne se
  // clôturait jamais — le champ `FeuilleExercices.etapePlanId` était mort.
  it("synchronise l'étape de parcours sur la preuve produite", async () => {
    preparer("jalon");
    await repondre();

    expect(synchroniserEtapes).toHaveBeenCalledWith(TENANT, ELEVE, COMPETENCE, MAINTENANT);
  });

  it("ferme la chaîne aussi pour une feuille d'entraînement", async () => {
    preparer("entrainement");
    await repondre();

    // La preuve vaut moins (AUTO_ENTRAINEMENT), mais elle déclenche la même
    // suite : c'est le profil qui décide, pas le type de feuille.
    expect(synchroniserEtapes).toHaveBeenCalledWith(TENANT, ELEVE, COMPETENCE, MAINTENANT);
  });
});

describe("le parcours ne se propose qu'à la clôture de la feuille", () => {
  it("évalue le besoin de parcours une fois la feuille terminée", async () => {
    preparer("entrainement", { feuilleTerminee: true });
    await repondre();

    expect(evaluerBesoinDePlans).toHaveBeenCalledTimes(1);
    expect(evaluerBesoinDePlans).toHaveBeenCalledWith(TENANT, ELEVE, MAINTENANT);
  });

  // Un parcours se propose sur une situation d'ensemble. L'évaluer à chaque
  // exercice l'appuierait sur un état à moitié mis à jour, et le referait
  // autant de fois qu'il y a d'exercices pour un seul verdict.
  it("ne propose rien tant qu'il reste des exercices à faire", async () => {
    preparer("entrainement", { feuilleTerminee: false });
    await repondre();

    expect(synchroniserEtapes).toHaveBeenCalled();
    expect(evaluerBesoinDePlans).not.toHaveBeenCalled();
  });
});

describe("une étape non terminante ne produit aucune preuve", () => {
  // Une réponse fausse au premier essai laisse l'exercice ouvert : écrire une
  // preuve là-dessus figerait un échec que l'élève n'a pas fini de corriger.
  it("ne referme rien sur une première tentative ratée", async () => {
    preparer("jalon");
    await repondre("3/4");

    expect(prisma.learningEvidence.upsert).not.toHaveBeenCalled();
    expect(recalculerProfil).not.toHaveBeenCalled();
    expect(recalculerRecommandation).not.toHaveBeenCalled();
    expect(synchroniserEtapes).not.toHaveBeenCalled();
    expect(evaluerBesoinDePlans).not.toHaveBeenCalled();
  });
});
