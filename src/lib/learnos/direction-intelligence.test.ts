import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    anneesScolaires: { findFirst: vi.fn() },
    planificationChapitre: { findMany: vi.fn() },
    studentLearningProfile: { aggregate: vi.fn() },
    predictionDifficulte: { count: vi.fn() },
    bulletin: { findMany: vi.fn() },
    facture: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    eleve: { count: vi.fn() },
    incident: { count: vi.fn() },
    absence: { count: vi.fn() },
    passageInfirmerie: { count: vi.fn() },
    planProgression: { findMany: vi.fn() },
    ficheRH: { aggregate: vi.fn() },
    learningEvidence: { findMany: vi.fn() },
    absencePersonnel: { count: vi.fn() },
    remplacementCours: { count: vi.fn() },
  },
}));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  siteFilterFromSession: vi.fn(() => ({})),
}));

vi.mock("@/lib/learnos/planification-pure", () => ({
  semaineScolaire: vi.fn(() => 10),
}));

import prisma from "@/lib/prisma";
import {
  calculerISP,
  calculerIEIS,
  calculerIVF,
  calculerICS,
  calculerIRO,
  tableauIntelligenceDirecteur,
} from "@/lib/learnos/direction-intelligence";

const mockPrisma = prisma as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>;

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults : résultats vides pour tous les modèles.
  mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
  mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
  mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
    _avg: { masteryScore: null },
    _count: 0,
  });
  mockPrisma.predictionDifficulte.count.mockResolvedValue(0);
  mockPrisma.bulletin.findMany.mockResolvedValue([]);
  mockPrisma.facture.findMany.mockResolvedValue([]);
  mockPrisma.budget.findMany.mockResolvedValue([]);
  mockPrisma.eleve.count.mockResolvedValue(0);
  mockPrisma.incident.count.mockResolvedValue(0);
  mockPrisma.absence.count.mockResolvedValue(0);
  mockPrisma.passageInfirmerie.count.mockResolvedValue(0);
  mockPrisma.planProgression.findMany.mockResolvedValue([]);
  mockPrisma.ficheRH.aggregate.mockResolvedValue({
    _avg: { tarifHoraire: null },
    _count: 0,
  });
  mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
  mockPrisma.absencePersonnel.count.mockResolvedValue(0);
  mockPrisma.remplacementCours.count.mockResolvedValue(0);
});

describe("calculerISP", () => {
  it("signale donneesInsuffisantes quand aucune donnée n'est disponible", async () => {
    // Aucune année, aucun planif, aucune mastery, aucune prédiction.
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);

    const result = await calculerISP("tenant1", {} as any);

    expect(result.code).toBe("ISP");
    expect(result.donneesInsuffisantes).toBe(true);
    expect(result.composantes.couvertureProgramme).toBe(0);
    expect(result.composantes.masteryMoyenne).toBe(0);
    expect(result.composantes.precisionPrediction).toBe(0);
  });

  it("calcule l'ISP avec des données complètes", async () => {
    const debut = new Date(Date.now() - 60 * 86_400_000);
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debut,
      dateFin: new Date(),
    });
    // 4 planifs : 3 traités, 1 en décalage (semaineFin < semaineCourante=10).
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([
      { statut: "TRAITE", semaineFin: 5 },
      { statut: "TRAITE", semaineFin: 6 },
      { statut: "TRAITE", semaineFin: 7 },
      { statut: "PLANIFIE", semaineFin: 3 }, // en décalage (3 < 10)
    ]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: 0.7 },
      _count: 50,
    });
    // 10 prédictions vérifiées, 8 correctes → précision = 0.8
    mockPrisma.predictionDifficulte.count
      .mockResolvedValueOnce(10) // total vérifiées
      .mockResolvedValueOnce(8); // correctes

    const result = await calculerISP("tenant1", {} as any);

    // couverture = 3/4 = 0.75, tauxDecalage = 1/4 = 0.25
    // ISP = 0.3*0.75 + 0.3*(1-0.25) + 0.2*0.7 + 0.2*0.8
    //     = 0.225 + 0.225 + 0.14 + 0.16 = 0.75
    expect(result.valeur).toBeCloseTo(0.75, 5);
    expect(result.donneesInsuffisantes).toBe(false);
    expect(result.composantes.couvertureProgramme).toBe(0.75);
    expect(result.composantes.tauxDecalage).toBe(0.25);
    expect(result.composantes.masteryMoyenne).toBe(0.7);
    expect(result.composantes.precisionPrediction).toBe(0.8);
  });
});

describe("calculerIEIS", () => {
  it("retourne 1 quand un seul site a des bulletins", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { moyenneGenerale: 12, eleve: { siteId: "site1" } },
      { moyenneGenerale: 14, eleve: { siteId: "site1" } },
    ]);

    const result = await calculerIEIS("tenant1", {} as any);

    expect(result.valeur).toBe(1);
    expect(result.donneesInsuffisantes).toBe(false);
    expect(result.composantes.nbSites).toBe(1);
  });

  it("retourne 0 avec donneesInsuffisantes quand aucun bulletin", async () => {
    mockPrisma.bulletin.findMany.mockResolvedValue([]);

    const result = await calculerIEIS("tenant1", {} as any);

    expect(result.valeur).toBe(0);
    expect(result.donneesInsuffisantes).toBe(true);
  });

  it("calcule l'équité entre plusieurs sites", async () => {
    // Deux sites avec moyennes proches → IEIS élevé.
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { moyenneGenerale: 12, eleve: { siteId: "site1" } },
      { moyenneGenerale: 12, eleve: { siteId: "site2" } },
    ]);

    const result = await calculerIEIS("tenant1", {} as any);

    // Moyennes identiques → écart-type = 0 → IEIS = 1 - 0 = 1
    expect(result.valeur).toBe(1);
    expect(result.composantes.nbSites).toBe(2);
  });
});

describe("calculerIVF", () => {
  it("pondère correctement (40% recouvrement, 30% impayés, 30% budget)", async () => {
    // 2 factures : 1000 PAYEE (paiement 1000) + 1000 EN_RETARD (aucun paiement)
    // tauxRecouvrement = 1000/2000 = 0.5
    // tauxImpayes = 1/2 = 0.5
    // 2 budgets : 1 respecté (depense <= prevu), 1 non → budgetRespecte = 0.5
    // IVF = 0.4*0.5 + 0.3*(1-0.5) + 0.3*0.5 = 0.2 + 0.15 + 0.15 = 0.5
    mockPrisma.facture.findMany.mockResolvedValue([
      { montant: 1000, statut: "PAYEE", paiements: [{ montant: 1000 }] },
      { montant: 1000, statut: "EN_RETARD", paiements: [] },
    ]);
    mockPrisma.budget.findMany.mockResolvedValue([
      { montantPrevu: 1000, montantDepense: 800 },
      { montantPrevu: 1000, montantDepense: 1200 },
    ]);

    const result = await calculerIVF("tenant1", {} as any);

    expect(result.code).toBe("IVF");
    expect(result.valeur).toBeCloseTo(0.5, 5);
    expect(result.composantes.tauxRecouvrement).toBe(0.5);
    expect(result.composantes.tauxImpayes).toBe(0.5);
    expect(result.composantes.budgetRespecte).toBe(0.5);
    expect(result.donneesInsuffisantes).toBe(false);
  });

  it("signale donneesInsuffisantes quand ni factures ni budgets", async () => {
    mockPrisma.facture.findMany.mockResolvedValue([]);
    mockPrisma.budget.findMany.mockResolvedValue([]);

    const result = await calculerIVF("tenant1", {} as any);

    expect(result.donneesInsuffisantes).toBe(true);
  });
});

describe("calculerICS", () => {
  it("plafonne à 1 les taux", async () => {
    const debut = new Date(Date.now() - 30 * 86_400_000);
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debut,
      dateFin: new Date(),
    });
    mockPrisma.eleve.count.mockResolvedValue(10);
    // 20 incidents pour 10 élèves → tauxIncidents = 20/10 = 2 → plafonné à 1
    mockPrisma.incident.count.mockResolvedValue(20);
    // 100 absences injustifiées sur 30 jours pour 10 élèves
    // → tauxAbsentéisme = 100/(10*30) = 0.333
    mockPrisma.absence.count.mockResolvedValue(100);
    // 5 passages pour 10 élèves → 0.5 par élève
    mockPrisma.passageInfirmerie.count.mockResolvedValue(5);

    const result = await calculerICS("tenant1", {} as any);

    expect(result.code).toBe("ICS");
    // Le taux d'incidents dépasse 1 mais est plafonné.
    expect(result.composantes.tauxIncidents).toBe(1);
    expect(result.composantes.tauxAbsentéisme).toBeCloseTo(
      100 / (10 * 30),
      5
    );
    expect(result.composantes.passagesInfirmerieParEleve).toBe(0.5);
    expect(result.donneesInsuffisantes).toBe(false);
  });

  it("signale donneesInsuffisantes quand aucun élève", async () => {
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
    mockPrisma.eleve.count.mockResolvedValue(0);

    const result = await calculerICS("tenant1", {} as any);

    expect(result.donneesInsuffisantes).toBe(true);
  });
});

describe("tableauIntelligenceDirecteur", () => {
  it("agrège tous les indices", async () => {
    const debut = new Date(Date.now() - 30 * 86_400_000);
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debut,
      dateFin: new Date(),
    });
    // ISP : quelques planifs et mastery.
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([
      { statut: "TRAITE", semaineFin: 5 },
      { statut: "TRAITE", semaineFin: 6 },
    ]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: 0.6 },
      _count: 20,
    });
    mockPrisma.predictionDifficulte.count.mockResolvedValue(5);

    // IEIS : bulletins sur un seul site.
    mockPrisma.bulletin.findMany.mockResolvedValue([
      { moyenneGenerale: 12, eleve: { siteId: "site1" } },
    ]);

    // IVF : quelques factures.
    mockPrisma.facture.findMany.mockResolvedValue([
      { montant: 1000, statut: "PAYEE", paiements: [{ montant: 1000 }] },
    ]);
    mockPrisma.budget.findMany.mockResolvedValue([
      { montantPrevu: 1000, montantDepense: 800 },
    ]);

    // ICS : quelques élèves.
    mockPrisma.eleve.count.mockResolvedValue(10);
    mockPrisma.incident.count.mockResolvedValue(2);
    mockPrisma.absence.count.mockResolvedValue(5);
    mockPrisma.passageInfirmerie.count.mockResolvedValue(1);

    // ROI : pas de plans terminés → null.
    mockPrisma.planProgression.findMany.mockResolvedValue([]);

    // Vitesse : pas d'evidences.
    mockPrisma.learningEvidence.findMany.mockResolvedValue([]);

    // IRO : pas d'absences personnel.
    mockPrisma.absencePersonnel.count.mockResolvedValue(0);

    const result = await tableauIntelligenceDirecteur("tenant1", {} as any);

    // Tous les indices sont présents.
    expect(result.isp).toBeDefined();
    expect(result.isp.code).toBe("ISP");
    expect(result.ieis).toBeDefined();
    expect(result.ieis.code).toBe("IEIS");
    expect(result.ivf).toBeDefined();
    expect(result.ivf.code).toBe("IVF");
    expect(result.ics).toBeDefined();
    expect(result.ics.code).toBe("ICS");
    expect(result.iro).toBeDefined();
    expect(result.iro.code).toBe("IRO");

    // ROI null quand aucun plan terminé.
    expect(result.roiPedagogique).toBeNull();

    // Vitesse présente avec donneesInsuffisantes.
    expect(result.vitesseApprentissage).toBeDefined();
    expect(result.vitesseApprentissage.donneesInsuffisantes).toBe(true);

    // Santé globale dans [0, 1].
    expect(result.santeGlobale).toBeGreaterThanOrEqual(0);
    expect(result.santeGlobale).toBeLessThanOrEqual(1);

    // Année résolue.
    expect(result.anneeId).toBe("annee1");

    // Date de calcul présente.
    expect(result.calculeLe).toBeTruthy();
  });

  it("inclut le ROI dans la santé globale quand des plans terminés existent", async () => {
    const debut = new Date(Date.now() - 30 * 86_400_000);
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debut,
      dateFin: new Date(),
    });
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: null },
      _count: 0,
    });
    mockPrisma.predictionDifficulte.count.mockResolvedValue(0);
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    mockPrisma.facture.findMany.mockResolvedValue([]);
    mockPrisma.budget.findMany.mockResolvedValue([]);
    mockPrisma.eleve.count.mockResolvedValue(0);
    mockPrisma.planProgression.findMany.mockResolvedValue([
      { eleveId: "e1", masteryAvant: 0.3, masteryApres: 0.7 },
      { eleveId: "e2", masteryAvant: 0.4, masteryApres: 0.8 },
    ]);
    mockPrisma.ficheRH.aggregate.mockResolvedValue({
      _avg: { tarifHoraire: 20 },
      _count: 5,
    });
    mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
    mockPrisma.absencePersonnel.count.mockResolvedValue(0);

    const result = await tableauIntelligenceDirecteur("tenant1", {} as any);

    expect(result.roiPedagogique).not.toBeNull();
    expect(result.roiPedagogique!.code).toBe("ROI");
    // La santé globale est la moyenne des indices disponibles, ROI inclus.
    expect(result.santeGlobale).toBeGreaterThanOrEqual(0);
    expect(result.santeGlobale).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// Tests Time Machine — propagation de la date simulée
// ============================================================
//
// La machine à remonter le temps permet de simuler un instant T
// pour démontrer l'évolution des indicateurs. Ces tests vérifient
// que `maintenant` est bien propagé dans :
//  - ISP (semaine courante → décalage)
//  - ICS (période [debut, maintenant] → incidents/absences)
//  - IRO (période [debut, maintenant] → absences personnel)
//  - tableauIntelligenceDirecteur (calculeLe = maintenant)
describe("Time Machine — propagation de la date simulée", () => {
  it("calculeLe reflète la date simulée, pas l'horloge réelle", async () => {
    const simul = new Date("2025-10-15T10:00:00.000Z");
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: new Date("2025-09-01"),
      dateFin: new Date("2026-06-30"),
    });
    // Toutes les autres données vides.
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: null },
      _count: 0,
    });
    mockPrisma.predictionDifficulte.count.mockResolvedValue(0);
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    mockPrisma.facture.findMany.mockResolvedValue([]);
    mockPrisma.budget.findMany.mockResolvedValue([]);
    mockPrisma.eleve.count.mockResolvedValue(0);
    mockPrisma.planProgression.findMany.mockResolvedValue([]);
    mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
    mockPrisma.absencePersonnel.count.mockResolvedValue(0);

    const result = await tableauIntelligenceDirecteur(
      "tenant1",
      {} as any,
      undefined,
      simul
    );

    // calculeLe doit être la date simulée, pas new Date().
    expect(result.calculeLe).toBe(simul.toISOString());
  });

  it("ICS borne la période à [debut, maintenant] — les filtres Prisma reçoivent lte", async () => {
    const simul = new Date("2026-01-15T10:00:00.000Z");
    const debutAnnee = new Date("2025-09-01");
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debutAnnee,
      dateFin: new Date("2026-06-30"),
    });
    mockPrisma.eleve.count.mockResolvedValue(100);
    mockPrisma.incident.count.mockResolvedValue(5);
    mockPrisma.absence.count.mockResolvedValue(10);
    mockPrisma.passageInfirmerie.count.mockResolvedValue(3);
    // Vider les autres pour éviter le bruit.
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: null },
      _count: 0,
    });
    mockPrisma.predictionDifficulte.count.mockResolvedValue(0);
    mockPrisma.bulletin.findMany.mockResolvedValue([]);
    mockPrisma.facture.findMany.mockResolvedValue([]);
    mockPrisma.budget.findMany.mockResolvedValue([]);
    mockPrisma.planProgression.findMany.mockResolvedValue([]);
    mockPrisma.learningEvidence.findMany.mockResolvedValue([]);
    mockPrisma.absencePersonnel.count.mockResolvedValue(0);

    await calculerICS("tenant1", {} as any, undefined, simul);

    // Chaque count doit avoir reçu un filtre date avec lte: simul.
    const incidentCall = mockPrisma.incident.count.mock.calls[0];
    const absenceCall = mockPrisma.absence.count.mock.calls[0];
    const passageCall = mockPrisma.passageInfirmerie.count.mock.calls[0];

    expect(incidentCall[0].where.date).toEqual({
      gte: debutAnnee,
      lte: simul,
    });
    expect(absenceCall[0].where.date).toEqual({
      gte: debutAnnee,
      lte: simul,
    });
    expect(passageCall[0].where.date).toEqual({
      gte: debutAnnee,
      lte: simul,
    });
  });

  it("ICS sans date simulée utilise new Date() (comportement par défaut)", async () => {
    const before = new Date();
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: new Date("2025-09-01"),
      dateFin: new Date("2026-06-30"),
    });
    mockPrisma.eleve.count.mockResolvedValue(50);
    mockPrisma.incident.count.mockResolvedValue(1);
    mockPrisma.absence.count.mockResolvedValue(2);
    mockPrisma.passageInfirmerie.count.mockResolvedValue(0);

    await calculerICS("tenant1", {} as any);

    const after = new Date();
    const incidentCall = mockPrisma.incident.count.mock.calls[0];
    const filterDate = incidentCall[0].where.date;
    // lte doit être entre before et after (donc ~ new Date()).
    expect(filterDate.lte.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(filterDate.lte.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("IRO borne la période à [debut, maintenant]", async () => {
    const simul = new Date("2026-03-15T10:00:00.000Z");
    const debutAnnee = new Date("2025-09-01");
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debutAnnee,
      dateFin: new Date("2026-06-30"),
    });
    mockPrisma.absencePersonnel.count.mockResolvedValue(10);
    mockPrisma.remplacementCours.count.mockResolvedValue(8);

    await calculerIRO("tenant1", {} as any, undefined, simul);

    const absCall = mockPrisma.absencePersonnel.count.mock.calls[0];
    const remCall = mockPrisma.remplacementCours.count.mock.calls[0];
    expect(absCall[0].where.date).toEqual({ gte: debutAnnee, lte: simul });
    // remplacementCours.count est appelé 2 fois (couverts + total).
    expect(remCall[0].where.date).toEqual({ gte: debutAnnee, lte: simul });
  });

  it("ISP appelle semaineScolaire avec la date simulée", async () => {
    const { semaineScolaire } = await import("@/lib/learnos/planification-pure");
    const simul = new Date("2026-01-15T10:00:00.000Z");
    const debutAnnee = new Date("2025-09-01");
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "annee1",
      dateDebut: debutAnnee,
      dateFin: new Date("2026-06-30"),
    });
    mockPrisma.planificationChapitre.findMany.mockResolvedValue([
      { statut: "TRAITE", semaineFin: 5 },
      { statut: "PREVU", semaineFin: 10 },
    ]);
    mockPrisma.studentLearningProfile.aggregate.mockResolvedValue({
      _avg: { masteryScore: 0.5 },
      _count: 10,
    });
    mockPrisma.predictionDifficulte.count.mockResolvedValue(5);

    await calculerISP("tenant1", {} as any, undefined, simul);

    // semaineScolaire doit avoir été appelé avec la date simulée.
    expect(semaineScolaire).toHaveBeenCalledWith(simul, debutAnnee);
  });
});
