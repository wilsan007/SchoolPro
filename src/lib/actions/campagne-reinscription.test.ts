import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks des dépendances externes ---

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const campagneReinscription = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const invitationReinscription = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  };
  const eleve = {
    count: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const anneesScolaires = {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const tarifNiveau = {
    findMany: vi.fn(),
  };
  const parcoursScolaire = {
    count: vi.fn(),
  };
  const tenant = {
    update: vi.fn(),
  };
  return {
    default: {
      campagneReinscription,
      invitationReinscription,
      eleve,
      anneesScolaires,
      tarifNiveau,
      parcoursScolaire,
      tenant,
      $transaction: vi.fn(async (args: unknown) => {
        // $transaction accepte soit un tableau d'opérations, soit une callback.
        if (Array.isArray(args)) return Promise.all(args);
        if (typeof args === "function") return args({
          invitationReinscription,
          eleve,
          anneesScolaires,
          tenant,
        });
        return undefined;
      }),
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Le périmètre site est neutralisé : son comportement est testé ailleurs.
vi.mock("@/lib/site-scope", () => ({
  siteFilterForModel: vi.fn(() => ({})),
  mergeFilters: vi.fn((...fragments: Record<string, unknown>[]) => {
    // Fusion simple suffisante pour les tests : on étale les fragments.
    const out: Record<string, unknown> = {};
    for (const f of fragments) {
      if (f) Object.assign(out, f);
    }
    return out;
  }),
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn().mockResolvedValue("2025-2026"),
  cloturerAnnee: vi.fn().mockResolvedValue({ id: "an-src", statut: "CLOTUREE" }),
}));

vi.mock("@/lib/actions/parametres", () => ({
  previewPromotion: vi.fn().mockResolvedValue([]),
  executePromotion: vi.fn().mockResolvedValue({ success: true }),
  niveauSuivant: vi.fn(async (niveau: string) => {
    const map: Record<string, string> = {
      "6eme": "5eme",
      "5eme": "4eme",
      "terminale": "Diplômé",
    };
    return map[niveau.toLowerCase().trim()] ?? null;
  }),
  activateAnneeScolaire: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/actions/facturation-avancee", () => ({
  genererFraisInscription: vi.fn().mockResolvedValue({ generated: 0, skipped: 0 }),
  genererMensualites: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/notifications/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/notify-direction", () => ({
  notifyDirection: vi.fn().mockResolvedValue(undefined),
}));

// --- Imports APRÈS les mocks ---

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cloturerAnnee } from "@/lib/annee-scolaire";
import { executePromotion, activateAnneeScolaire } from "@/lib/actions/parametres";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { notifyDirection } from "@/lib/notifications/notify-direction";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  campagneReinscription: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  invitationReinscription: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  eleve: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  anneesScolaires: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  tarifNiveau: {
    findMany: ReturnType<typeof vi.fn>;
  };
  parcoursScolaire: {
    count: ReturnType<typeof vi.fn>;
  };
  tenant: {
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockCloturerAnnee = cloturerAnnee as ReturnType<typeof vi.fn>;
const mockExecutePromotion = executePromotion as ReturnType<typeof vi.fn>;
const mockActivateAnnee = activateAnneeScolaire as ReturnType<typeof vi.fn>;
const mockSendWhatsApp = sendWhatsAppMessage as ReturnType<typeof vi.fn>;
const mockNotifyDirection = notifyDirection as ReturnType<typeof vi.fn>;

const {
  creerCampagne,
  avancerEtape,
  annulerCampagne,
  clôturerAncienneAnnee,
  executerPromotionCampagne,
  envoyerInvitations,
  confirmerReinscription,
  marquerSansReponse,
  activerNouvelleAnnee,
  getStatsCampagne,
} = await import("@/lib/actions/campagne-reinscription");

// --- Session administrateur par défaut ---

const SESSION_ADMIN = {
  user: {
    id: "u1",
    tenantId: "t1",
    role: "TENANT_ADMIN",
    name: "Admin Test",
    siteId: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION_ADMIN);
});

// ============================================================
// creerCampagne
// ============================================================

describe("creerCampagne", () => {
  it("crée une campagne et ses invitations avec succès", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null); // aucune campagne active
    mockPrisma.eleve.count.mockResolvedValue(2);
    mockPrisma.campagneReinscription.create.mockResolvedValue({
      id: "camp-1",
      tenantId: "t1",
      libelle: "Réinscription 2026-2027",
      anneeSource: "2025-2026",
      anneeCible: "2026-2027",
    });
    mockPrisma.eleve.findMany.mockResolvedValue([
      {
        id: "e1",
        classe: { niveau: "6eme" },
        parents: [{ parent: { phone: "+123", email: "p1@x.com" } }],
      },
      {
        id: "e2",
        classe: { niveau: "Terminale" },
        parents: [{ parent: { phone: "+456", email: "p2@x.com" } }],
      },
    ]);
    mockPrisma.invitationReinscription.createMany.mockResolvedValue({ count: 2 });

    const res = await creerCampagne({
      libelle: "Réinscription 2026-2027",
      anneeSource: "2025-2026",
      anneeCible: "2026-2027",
    });

    expect(res).toEqual({ success: true, campagneId: "camp-1", nbInvitations: 2 });
    expect(mockPrisma.campagneReinscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        libelle: "Réinscription 2026-2027",
        anneeSource: "2025-2026",
        anneeCible: "2026-2027",
        nbElevesTotal: 2,
        creeParId: "u1",
      }),
    });
    expect(mockPrisma.invitationReinscription.createMany).toHaveBeenCalled();
  });

  it("refuse sans session (Non autorisé)", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(
      creerCampagne({ libelle: "X", anneeSource: "A", anneeCible: "B" })
    ).rejects.toThrow("Non autorisé");
  });

  it("refuse si le rôle n'a pas la permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(
      creerCampagne({ libelle: "X", anneeSource: "A", anneeCible: "B" })
    ).rejects.toThrow("Permissions insuffisantes");
  });

  it("refuse si une campagne active existe déjà", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-old",
      statut: "EN_COURS",
    });
    await expect(
      creerCampagne({ libelle: "X", anneeSource: "A", anneeCible: "B" })
    ).rejects.toThrow("Une campagne est déjà en cours");
  });
});

// ============================================================
// avancerEtape
// ============================================================

describe("avancerEtape", () => {
  it("passe l'étape 1 → 2 avec statut EN_COURS", async () => {
    mockPrisma.campagneReinscription.update.mockResolvedValue({});
    const res = await avancerEtape("camp-1", 2);
    expect(res).toEqual({ success: true });
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1", tenantId: "t1" },
      data: expect.objectContaining({ etapeActuelle: 2, statut: "EN_COURS" }),
    });
    // dateFin ne doit pas être posée avant l'étape 6
    const data = mockPrisma.campagneReinscription.update.mock.calls[0][0].data;
    expect(data.dateFin).toBeUndefined();
  });

  it("passe l'étape 5 → 6 et marque la campagne TERMINEE avec dateFin", async () => {
    mockPrisma.campagneReinscription.update.mockResolvedValue({});
    await avancerEtape("camp-1", 6);
    const data = mockPrisma.campagneReinscription.update.mock.calls[0][0].data;
    expect(data.etapeActuelle).toBe(6);
    expect(data.statut).toBe("TERMINEE");
    expect(data.dateFin).toBeInstanceOf(Date);
  });

  it("refuse sans session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(avancerEtape("camp-1", 2)).rejects.toThrow("Non autorisé");
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(avancerEtape("camp-1", 2)).rejects.toThrow("Permissions insuffisantes");
  });
});

// ============================================================
// annulerCampagne
// ============================================================

describe("annulerCampagne", () => {
  it("annule une campagne avec succès", async () => {
    mockPrisma.campagneReinscription.update.mockResolvedValue({});
    const res = await annulerCampagne("camp-1");
    expect(res).toEqual({ success: true });
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1", tenantId: "t1" },
      data: { statut: "ANNULEE" },
    });
  });

  it("refuse sans session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(annulerCampagne("camp-1")).rejects.toThrow("Non autorisé");
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(annulerCampagne("camp-1")).rejects.toThrow("Permissions insuffisantes");
  });
});

// ============================================================
// clôturerAncienneAnnee
// ============================================================

describe("clôturerAncienneAnnee", () => {
  it("clôture l'année source avec succès", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeSource: "2025-2026",
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "an-src",
      statut: "OUVERTE",
    });
    mockCloturerAnnee.mockResolvedValue({ id: "an-src", statut: "CLOTUREE" });

    const res = await clôturerAncienneAnnee("camp-1");
    expect(res).toEqual({ success: true });
    expect(mockCloturerAnnee).toHaveBeenCalledWith("an-src", "u1");
  });

  it("retourne alreadyClosed si l'année est déjà CLOTUREE", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeSource: "2025-2026",
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "an-src",
      statut: "CLOTUREE",
    });
    const res = await clôturerAncienneAnnee("camp-1");
    expect(res).toEqual({ success: true, alreadyClosed: true });
    expect(mockCloturerAnnee).not.toHaveBeenCalled();
  });

  it("refuse si l'année est déjà archivée", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeSource: "2025-2026",
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "an-src",
      statut: "ARCHIVEE",
    });
    await expect(clôturerAncienneAnnee("camp-1")).rejects.toThrow("L'année est déjà archivée");
  });

  it("refuse si la campagne est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null);
    await expect(clôturerAncienneAnnee("camp-1")).rejects.toThrow("Campagne introuvable");
  });

  it("refuse si l'année source est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeSource: "2025-2026",
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
    await expect(clôturerAncienneAnnee("camp-1")).rejects.toThrow("Année source introuvable");
  });
});

// ============================================================
// executerPromotionCampagne
// ============================================================

describe("executerPromotionCampagne", () => {
  const decisions = {
    e1: "promouvoir" as const,
    e2: "redoubler" as const,
    e3: "diplome" as const,
  };

  it("exécute la promotion et met à jour les invitations", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeSource: "2025-2026",
      anneeCible: "2026-2027",
    });
    mockExecutePromotion.mockResolvedValue({ success: true });
    mockPrisma.invitationReinscription.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.campagneReinscription.update.mockResolvedValue({});
    mockNotifyDirection.mockResolvedValue(undefined);

    const res = await executerPromotionCampagne("camp-1", decisions);

    expect(res).toEqual({ success: true, nbDiplomes: 1 });
    expect(mockExecutePromotion).toHaveBeenCalledWith("2025-2026", "2026-2027", decisions);
    // 3 updateMany (une par élève)
    expect(mockPrisma.invitationReinscription.updateMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1", tenantId: "t1" },
      data: { nbDiplomes: 1 },
    });
    expect(mockNotifyDirection).toHaveBeenCalled();
  });

  it("refuse si la campagne est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null);
    await expect(executerPromotionCampagne("camp-1", {})).rejects.toThrow(
      "Campagne introuvable"
    );
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(executerPromotionCampagne("camp-1", {})).rejects.toThrow(
      "Permissions insuffisantes"
    );
  });
});

// ============================================================
// envoyerInvitations
// ============================================================

describe("envoyerInvitations", () => {
  it("envoie les invitations WhatsApp et met à jour le statut", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      invitations: [
        {
          id: "inv-1",
          parentPhone: "+123",
          eleve: { prenom: "Alice", nom: "Dupont", classe: { nom: "6A" } },
        },
        {
          id: "inv-2",
          parentPhone: null,
          eleve: { prenom: "Bob", nom: "Martin", classe: { nom: "5B" } },
        },
      ],
    });
    mockSendWhatsApp.mockResolvedValue(undefined);
    mockPrisma.invitationReinscription.update.mockResolvedValue({});

    const res = await envoyerInvitations("camp-1", "WHATSAPP");

    expect(res).toEqual({ success: true, envoyees: 2, erreurs: 0 });
    // Seule l'invitation avec un téléphone déclenche sendWhatsAppMessage
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      "+123",
      expect.stringContaining("Alice Dupont")
    );
    expect(mockPrisma.invitationReinscription.update).toHaveBeenCalledTimes(2);
  });

  it("compte les erreurs d'envoi", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      invitations: [
        {
          id: "inv-1",
          parentPhone: "+123",
          eleve: { prenom: "Alice", nom: "Dupont", classe: { nom: "6A" } },
        },
      ],
    });
    mockSendWhatsApp.mockRejectedValue(new Error("API error"));

    const res = await envoyerInvitations("camp-1", "WHATSAPP");
    expect(res).toEqual({ success: true, envoyees: 0, erreurs: 1 });
  });

  it("refuse si la campagne est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null);
    await expect(envoyerInvitations("camp-1")).rejects.toThrow("Campagne introuvable");
  });

  it("accepte le rôle SECRETARY", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u-sec", tenantId: "t1", role: "SECRETARY", siteId: null },
    });
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      invitations: [],
    });
    const res = await envoyerInvitations("camp-1");
    expect(res).toEqual({ success: true, envoyees: 0, erreurs: 0 });
  });

  it("refuse sans permission (TEACHER)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(envoyerInvitations("camp-1")).rejects.toThrow(
      "Permissions insuffisantes"
    );
  });
});

// ============================================================
// confirmerReinscription
// ============================================================

describe("confirmerReinscription", () => {
  it("confirme une réinscription (confirme=true) et met à jour les compteurs", async () => {
    mockPrisma.invitationReinscription.findFirst.mockResolvedValue({
      id: "inv-1",
      campagneId: "camp-1",
      eleveId: "e1",
      tenantId: "t1",
    });
    mockPrisma.invitationReinscription.update.mockResolvedValue({});
    mockPrisma.eleve.update.mockResolvedValue({});
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 3 },
      { statut: "REFUSE", _count: 1 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});

    const res = await confirmerReinscription("inv-1", true);

    expect(res).toEqual({ success: true });
    // Vérifie que la transaction a été appelée avec update invitation + update eleve
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.invitationReinscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1", tenantId: "t1" },
        data: expect.objectContaining({ statut: "CONFIRME" }),
      })
    );
    expect(mockPrisma.eleve.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1", tenantId: "t1" },
        data: { statut: "REINSCRIT" },
      })
    );
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1", tenantId: "t1" },
      data: { nbReinscrits: 3, nbNonReinscrits: 1 },
    });
  });

  it("refuse une réinscription (confirme=false) → statut REFUSE / NON_REINSCRIT", async () => {
    mockPrisma.invitationReinscription.findFirst.mockResolvedValue({
      id: "inv-1",
      campagneId: "camp-1",
      eleveId: "e1",
      tenantId: "t1",
    });
    mockPrisma.invitationReinscription.update.mockResolvedValue({});
    mockPrisma.eleve.update.mockResolvedValue({});
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "REFUSE", _count: 2 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});

    await confirmerReinscription("inv-1", false);

    expect(mockPrisma.invitationReinscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statut: "REFUSE" }),
      })
    );
    expect(mockPrisma.eleve.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { statut: "NON_REINSCRIT" },
      })
    );
  });

  it("refuse si l'invitation est introuvable", async () => {
    mockPrisma.invitationReinscription.findFirst.mockResolvedValue(null);
    await expect(confirmerReinscription("inv-x", true)).rejects.toThrow(
      "Invitation introuvable"
    );
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(confirmerReinscription("inv-1", true)).rejects.toThrow(
      "Permissions insuffisantes"
    );
  });
});

// ============================================================
// marquerSansReponse
// ============================================================

describe("marquerSansReponse", () => {
  it("marque les invitations INVITE en SANS_REPONSE et met à jour les élèves", async () => {
    mockPrisma.invitationReinscription.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.invitationReinscription.findMany.mockResolvedValue([
      { eleveId: "e1" },
      { eleveId: "e2" },
      { eleveId: "e3" },
    ]);
    mockPrisma.eleve.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 5 },
      { statut: "REFUSE", _count: 1 },
      { statut: "SANS_REPONSE", _count: 3 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});

    const res = await marquerSansReponse("camp-1");

    expect(res).toEqual({ success: true, nbMarques: 3 });
    expect(mockPrisma.invitationReinscription.updateMany).toHaveBeenCalledWith({
      where: { campagneId: "camp-1", tenantId: "t1", statut: "INVITE" },
      data: { statut: "SANS_REPONSE" },
    });
    // 3 updateMany sur eleve (un par élève sans réponse)
    expect(mockPrisma.eleve.updateMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1", tenantId: "t1" },
      data: { nbNonReinscrits: 4 }, // 1 REFUSE + 3 SANS_REPONSE
    });
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(marquerSansReponse("camp-1")).rejects.toThrow(
      "Permissions insuffisantes"
    );
  });
});

// ============================================================
// activerNouvelleAnnee
// ============================================================

describe("activerNouvelleAnnee", () => {
  it("active la nouvelle année et termine la campagne", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      nbDiplomes: 2,
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue({
      id: "an-cible",
      libelle: "2026-2027",
    });
    mockActivateAnnee.mockResolvedValue({ success: true });
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 10 },
      { statut: "REFUSE", _count: 2 },
      { statut: "SANS_REPONSE", _count: 3 },
    ]);
    mockPrisma.campagneReinscription.update.mockResolvedValue({});
    mockNotifyDirection.mockResolvedValue(undefined);

    const res = await activerNouvelleAnnee("camp-1");

    expect(res).toEqual({ success: true });
    expect(mockActivateAnnee).toHaveBeenCalledWith("an-cible");
    expect(mockPrisma.campagneReinscription.update).toHaveBeenCalledWith({
      where: { id: "camp-1" },
      data: expect.objectContaining({
        statut: "TERMINEE",
        etapeActuelle: 6,
      }),
    });
    expect(mockNotifyDirection).toHaveBeenCalled();
  });

  it("refuse si la campagne est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null);
    await expect(activerNouvelleAnnee("camp-1")).rejects.toThrow(
      "Campagne introuvable"
    );
  });

  it("refuse si l'année cible est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
    });
    mockPrisma.anneesScolaires.findFirst.mockResolvedValue(null);
    await expect(activerNouvelleAnnee("camp-1")).rejects.toThrow(
      "Année cible introuvable"
    );
  });

  it("refuse sans permission", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", tenantId: "t1", role: "TEACHER", siteId: null },
    });
    await expect(activerNouvelleAnnee("camp-1")).rejects.toThrow(
      "Permissions insuffisantes"
    );
  });
});

// ============================================================
// getStatsCampagne
// ============================================================

describe("getStatsCampagne", () => {
  it("calcule les statistiques et les revenus prévus", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      nbElevesTotal: 10,
      nbDiplomes: 1,
      _count: { invitations: 10 },
    });
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 6 },
      { statut: "REFUSE", _count: 2 },
      { statut: "SANS_REPONSE", _count: 1 },
      { statut: "INVITE", _count: 1 },
    ]);
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", classe: { niveau: "6eme" } },
      { id: "e2", classe: { niveau: "5eme" } },
    ]);
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([
      { niveau: "6eme", fraisRenouvellement: 50000 },
      { niveau: "5eme", fraisRenouvellement: 55000 },
    ]);

    const res = await getStatsCampagne("camp-1");

    expect(res).not.toBeNull();
    expect(res!.statuts).toEqual({
      invite: 1,
      confirme: 6,
      refuse: 2,
      sansReponse: 1,
    });
    expect(res!.revenusPrevus).toBe(105000); // 50000 + 55000
    expect(res!.tauxReinscription).toBe(60); // 6 / 10 * 100
  });

  it("retourne null si la campagne est introuvable", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue(null);
    const res = await getStatsCampagne("camp-x");
    expect(res).toBeNull();
  });

  it("retourne null sans session", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await getStatsCampagne("camp-1");
    expect(res).toBeNull();
  });

  it("gère le cas où aucun tarif n'est configuré (revenusPrevus=0)", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      nbElevesTotal: 5,
      _count: { invitations: 5 },
    });
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([
      { statut: "CONFIRME", _count: 3 },
    ]);
    mockPrisma.eleve.findMany.mockResolvedValue([
      { id: "e1", classe: { niveau: "6eme" } },
    ]);
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([]);

    const res = await getStatsCampagne("camp-1");
    expect(res!.revenusPrevus).toBe(0);
    expect(res!.tauxReinscription).toBe(60); // 3 / 5 * 100
  });

  it("gère nbElevesTotal=0 (tauxReinscription=0, pas de division par zéro)", async () => {
    mockPrisma.campagneReinscription.findFirst.mockResolvedValue({
      id: "camp-1",
      anneeCible: "2026-2027",
      nbElevesTotal: 0,
      _count: { invitations: 0 },
    });
    mockPrisma.invitationReinscription.groupBy.mockResolvedValue([]);
    mockPrisma.eleve.findMany.mockResolvedValue([]);
    mockPrisma.tarifNiveau.findMany.mockResolvedValue([]);

    const res = await getStatsCampagne("camp-1");
    expect(res!.tauxReinscription).toBe(0);
  });
});
