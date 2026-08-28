import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// ── Modèles Prisma nécessaires au workflow admissions ──
// vi.hoisted garantit que l'objet est créé avant l'exécution de vi.mock
const mockPrismaObj = vi.hoisted(() => {
  const obj: Record<string, unknown> = {
    candidature: { findFirst: vi.fn(), update: vi.fn() },
    facture: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), update: vi.fn() },
    classe: { findFirst: vi.fn() },
    tarifNiveau: { findFirst: vi.fn() },
    eleve: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    parent: { findFirst: vi.fn(), create: vi.fn() },
    eleveParent: { create: vi.fn() },
    historiqueClasse: { create: vi.fn().mockResolvedValue({}) },
    inscriptionHistorique: { create: vi.fn() },
    notification: { create: vi.fn() },
    user: { findFirst: vi.fn(), create: vi.fn() },
    anneesScolaires: { findFirst: vi.fn() },
  };
  obj.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(obj));
  return obj;
});

vi.mock("@/lib/prisma", () => ({ default: mockPrismaObj }));

vi.mock("@/lib/rbac", () => ({ checkPermission: vi.fn(() => null) }));

vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(async () => "2025-2026"),
}));

vi.mock("@/lib/notifications/notify-direction", () => ({
  notifyDirection: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed-pw"),
  },
  hash: vi.fn(async () => "hashed-pw"),
}));

// Les fonctions de pièces justificatives sont pures ; on les mocke pour
// contrôler le gate EN_EXAMEN sans avoir à construire des documents complets.
vi.mock("@/lib/admissions/pieces-justificatives", () => ({
  PIECES_OBLIGATOIRES: [
    { id: "acte_naissance", nom: "Acte de naissance", obligatoire: true },
    { id: "photo_identite", nom: "Photo d'identité", obligatoire: true },
    { id: "carte_identite_parent", nom: "Carte d'identité du parent", obligatoire: true },
  ],
  fusionnerDocuments: vi.fn((existants: unknown[], nouveaux: unknown[]) => [
    ...(existants ?? []),
    ...(nouveaux ?? []),
  ]),
  piecesRequisesPresentes: vi.fn(() => true),
  piecesManquantes: vi.fn(() => []),
}));

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import {
  piecesRequisesPresentes as mockPiecesRequisesPresentes,
  piecesManquantes as mockPiecesManquantes,
} from "@/lib/admissions/pieces-justificatives";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCheckPermission = checkPermission as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as typeof mockPrismaObj;
const fnPiecesRequisesPresentes = mockPiecesRequisesPresentes as ReturnType<typeof vi.fn>;
const fnPiecesManquantes = mockPiecesManquantes as ReturnType<typeof vi.fn>;

function req(url: string, body?: unknown) {
  return { url, json: () => Promise.resolve(body) } as unknown as Request;
}

const { PATCH } = await import("@/app/api/admissions/[id]/route");
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Session par défaut : TENANT_ADMIN avec siteId. */
const sessionUser = {
  id: "u1",
  tenantId: "t1",
  role: "TENANT_ADMIN",
  siteId: "s1",
  siteIds: ["s1"],
  tenantHasSites: true,
  name: "Admin",
};

/** Fabrique une candidature de base avec overridable fields. */
function candidature(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    tenantId: "t1",
    siteId: "s1",
    statut: "SOUMISE",
    dossierStatut: "INCOMPLET",
    nom: "Diallo",
    prenom: "Awa",
    dateNaissance: new Date("2015-03-10"),
    lieuNaissance: "Dakar",
    nationalite: "SN",
    sexe: "F",
    classeVoulue: "6ème A",
    annee: "2025-2026",
    parentNom: "Diallo",
    parentPrenom: "Mariama",
    parentPhone: "+22177000000",
    parentEmail: null,
    parentLien: "MERE",
    documentsInscription: [],
    ...over,
  };
}

/** Réinitialise tous les mocks Prisma à leur état initial (sans implémentation). */
function resetAllPrismaMocks() {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === "object" && model !== null && "$transaction" in model === false) {
      for (const fn of Object.values(model)) {
        if (typeof fn === "function" && "mockReset" in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
  // $transaction est une fonction directement sur mockPrisma
  if ("mockReset" in mockPrisma.$transaction) {
    mockPrisma.$transaction.mockReset();
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrismaObj)
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAllPrismaMocks();
  mockCheckPermission.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: sessionUser });
  // Pièces justificatives : par défaut, toutes les pièces sont présentes
  fnPiecesRequisesPresentes.mockReturnValue(true);
  fnPiecesManquantes.mockReturnValue([]);
  // Par défaut, la candidature existe.
  mockPrisma.candidature.findFirst.mockResolvedValue(candidature());
  mockPrisma.candidature.update.mockResolvedValue({ id: "cand-1" });
  mockPrisma.inscriptionHistorique.create.mockResolvedValue({});
  // historiqueClasse.create est appelé avec .catch() — doit retourner une promesse
  mockPrisma.historiqueClasse.create.mockResolvedValue({});
  // notification.create est appelé dans un try/catch — doit retourner une promesse
  mockPrisma.notification.create.mockResolvedValue({});
});

// ──────────────────────────────────────────────────────────────────
// PATCH /api/admissions/[id] — Workflow
// ──────────────────────────────────────────────────────────────────
describe("PATCH /api/admissions/[id]", () => {
  it("refuse l'accès sans session (401)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(req("http://l", { statut: "DOSSIER_COMPLET" }) as never, params("cand-1") as never);
    expect(res.status).toBe(401);
  });

  it("refuse l'accès sans la permission admissions:write (403)", async () => {
    mockCheckPermission.mockReturnValue(
      new Response(null, { status: 403 }) as never
    );
    const res = await PATCH(req("http://l", { statut: "DOSSIER_COMPLET" }) as never, params("cand-1") as never);
    expect(res.status).toBe(403);
  });

  it("retourne 404 si la candidature est introuvable", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("http://l", { statut: "DOSSIER_COMPLET" }) as never, params("cand-x") as never);
    expect(res.status).toBe(404);
  });

  // ── SOUMISE → DOSSIER_COMPLET ──
  it("passe SOUMISE → DOSSIER_COMPLET avec succès", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "SOUMISE" }));
    const res = await PATCH(
      req("http://l", { statut: "DOSSIER_COMPLET" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
    const updateData = mockPrisma.candidature.update.mock.calls[0][0].data;
    expect(updateData.statut).toBe("DOSSIER_COMPLET");
  });

  // ── DOSSIER_COMPLET → EN_EXAMEN (gate pièces justificatives) ──
  it("passe DOSSIER_COMPLET → EN_EXAMEN quand les pièces sont présentes", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "DOSSIER_COMPLET" }));
    const res = await PATCH(
      req("http://l", { statut: "EN_EXAMEN" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
    const updateData = mockPrisma.candidature.update.mock.calls[0][0].data;
    expect(updateData.statut).toBe("EN_EXAMEN");
  });

  it("refuse EN_EXAMEN si les pièces justificatives sont manquantes (400)", async () => {
    fnPiecesRequisesPresentes.mockReturnValue(false);
    fnPiecesManquantes.mockReturnValue([
      { id: "acte_naissance", nom: "Acte de naissance", obligatoire: true },
    ]);

    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "DOSSIER_COMPLET" }));
    const res = await PATCH(
      req("http://l", { statut: "EN_EXAMEN" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Pièces justificatives manquantes");
    expect(mockPrisma.candidature.update).not.toHaveBeenCalled();
  });

  // ── EN_EXAMEN → ADMIS (génération auto facture) ──
  it("passe EN_EXAMEN → ADMIS et génère une facture automatiquement", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "EN_EXAMEN" }));
    // Pas de facture existante → création
    mockPrisma.facture.findFirst.mockResolvedValue(null);
    // Résolution classe → niveau
    mockPrisma.classe.findFirst.mockResolvedValue({ niveau: "6ème" });
    // Tarif trouvé
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      fraisInscription: 50000,
      mensualite: 30000,
      devise: "DJF",
    });
    mockPrisma.facture.count.mockResolvedValue(0);
    mockPrisma.facture.create.mockResolvedValue({ id: "fac-1" });

    const res = await PATCH(
      req("http://l", { statut: "ADMIS" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.factureCreeId).toBe("fac-1");
    // Vérifier que la facture a été créée avec le bon montant
    const factureData = mockPrisma.facture.create.mock.calls[0][0].data;
    expect(factureData.montant).toBe(80000); // 50000 + 30000
    expect(factureData.statut).toBe("EN_ATTENTE");
    expect(factureData.candidatureId).toBe("cand-1");
  });

  it("réutilise la facture existante si déjà créée (idempotence)", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "EN_EXAMEN" }));
    mockPrisma.facture.findFirst.mockResolvedValue({ id: "fac-exist" });

    const res = await PATCH(
      req("http://l", { statut: "ADMIS" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.factureCreeId).toBe("fac-exist");
    expect(mockPrisma.facture.create).not.toHaveBeenCalled();
  });

  it("refuse ADMIS si aucun tarif n'est configuré (400)", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "EN_EXAMEN" }));
    mockPrisma.facture.findFirst.mockResolvedValue(null);
    mockPrisma.classe.findFirst.mockResolvedValue({ niveau: "6ème" });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      req("http://l", { statut: "ADMIS" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Aucun tarif configuré");
  });

  it("refuse ADMIS si le tarif a un montant total ≤ 0 (400)", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "EN_EXAMEN" }));
    mockPrisma.facture.findFirst.mockResolvedValue(null);
    mockPrisma.classe.findFirst.mockResolvedValue({ niveau: "6ème" });
    mockPrisma.tarifNiveau.findFirst.mockResolvedValue({
      fraisInscription: 0,
      mensualite: 0,
      devise: "DJF",
    });

    const res = await PATCH(
      req("http://l", { statut: "ADMIS" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(400);
  });

  // ── ADMIS → INSCRIT (gate paiement + création élève) ──
  it("passe ADMIS → INSCRIT quand le paiement est complet et crée l'élève", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "ADMI" }));
    // Facture avec paiements suffisants
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "fac-1",
      montant: 80000,
      paiements: [{ montant: 80000 }],
    });
    // Transaction : élève
    mockPrisma.eleve.count.mockResolvedValue(0);
    mockPrisma.eleve.findUnique.mockResolvedValue(null);
    mockPrisma.eleve.create.mockResolvedValue({ id: "ele-1", siteId: "s1" });
    mockPrisma.classe.findFirst.mockResolvedValue({ id: "cl-1", siteId: "s1" });
    mockPrisma.parent.findFirst.mockResolvedValue(null);
    mockPrisma.parent.create.mockResolvedValue({ id: "par-1" });
    // Après transaction : compte User
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: "usr-1" });

    const res = await PATCH(
      req("http://l", { statut: "INSCRIT" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.eleveCreeId).toBe("ele-1");
    // La transaction a été appelée
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("refuse INSCRIT si le paiement est insuffisant (400)", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "ADMI" }));
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "fac-1",
      montant: 80000,
      paiements: [{ montant: 30000 }],
    });

    const res = await PATCH(
      req("http://l", { statut: "INSCRIT" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("paiement");
    expect(data.restant).toBe(50000);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse INSCRIT si aucune facture n'existe (candidat non admis) (400)", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "ADMI" }));
    mockPrisma.facture.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      req("http://l", { statut: "INSCRIT" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("admis");
  });

  // ── Restrictions par rôle ──
  it("refuse VALIDE pour ACCOUNTANT (403)", async () => {
    mockAuth.mockResolvedValue({
      user: { ...sessionUser, role: "ACCOUNTANT" },
    });
    const res = await PATCH(
      req("http://l", { dossierStatut: "VALIDE" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("chef d'établissement");
  });

  it("autorise INSCRIT pour ACCOUNTANT (rôle inclus dans ROLES_INSCRIPTION)", async () => {
    mockAuth.mockResolvedValue({
      user: { ...sessionUser, role: "ACCOUNTANT" },
    });
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "ADMI" }));
    mockPrisma.facture.findFirst.mockResolvedValue({
      id: "fac-1",
      montant: 80000,
      paiements: [{ montant: 80000 }],
    });
    mockPrisma.eleve.count.mockResolvedValue(0);
    mockPrisma.eleve.findUnique.mockResolvedValue(null);
    mockPrisma.eleve.create.mockResolvedValue({ id: "ele-1", siteId: "s1" });
    mockPrisma.classe.findFirst.mockResolvedValue({ id: "cl-1", siteId: "s1" });
    mockPrisma.parent.findFirst.mockResolvedValue(null);
    mockPrisma.parent.create.mockResolvedValue({ id: "par-1" });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: "usr-1" });

    const res = await PATCH(
      req("http://l", { statut: "INSCRIT" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(200);
  });

  it("refuse INSCRIT pour un rôle non autorisé (ex. SECRETARY) (403)", async () => {
    mockAuth.mockResolvedValue({
      user: { ...sessionUser, role: "SECRETARY" },
    });
    const res = await PATCH(
      req("http://l", { statut: "INSCRIT" }) as never,
      params("cand-1") as never
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.candidature.findFirst).not.toHaveBeenCalled();
  });

  // ── Audit trail ──
  it("enregistre un historique lors d'un changement de statut", async () => {
    mockPrisma.candidature.findFirst.mockResolvedValue(candidature({ statut: "SOUMISE" }));
    await PATCH(
      req("http://l", { statut: "DOSSIER_COMPLET" }) as never,
      params("cand-1") as never
    );
    expect(mockPrisma.inscriptionHistorique.create).toHaveBeenCalled();
    const histData = mockPrisma.inscriptionHistorique.create.mock.calls[0][0].data;
    expect(histData.candidatureId).toBe("cand-1");
    expect(histData.description).toContain("SOUMISE");
    expect(histData.description).toContain("DOSSIER_COMPLET");
  });
});
