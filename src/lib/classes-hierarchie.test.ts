import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests d'intégration de la hiérarchie de classes.
 *
 * `getClassesHierarchie` groupe les classes par catégorie → niveau → classe
 * en appliquant le filtrage par tenant, site, année scolaire et scope
 * enseignant. Ces tests valident l'organisation, le filtrage et les
 * utilitaires d'aplatissement / extraction.
 */

// ------------------------------------------------------------
// Mocks des dépendances
// ------------------------------------------------------------

vi.mock("@/lib/prisma", () => ({
  default: {
    classe: {
      findMany: vi.fn(),
    },
    eleve: {
      groupBy: vi.fn(),
    },
    enseignant: {
      findFirst: vi.fn(),
    },
    affectationEnseignant: {
      findMany: vi.fn(),
    },
    emploiTemps: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/annee-scolaire", () => ({
  getAnneeCouranteLibelle: vi.fn(),
}));

vi.mock("@/lib/teacher-classes", () => ({
  getTeacherScope: vi.fn(),
  isTeacherRole: vi.fn(),
}));

// ------------------------------------------------------------
// Imports APRÈS les mocks
// ------------------------------------------------------------

import prisma from "@/lib/prisma";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import {
  getClassesHierarchie,
  aplatirHierarchie,
  extraireClasseIds,
  type ClassesHierarchie,
} from "@/lib/classes-hierarchie";
import type { Role } from "@prisma/client";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const TENANT = "tenant-1";
const ANNEE = "2025-2026";

/** Construit un faux résultat de prisma.classe.findMany. */
function mockClasse(
  id: string,
  nom: string,
  niveau: string,
  opts: {
    filiere?: string | null;
    siteId?: string | null;
    siteNom?: string | null;
    structureType?: string | null;
    structureNom?: string | null;
  } = {}
) {
  return {
    id,
    nom,
    niveau,
    filiere: opts.filiere ?? null,
    siteId: opts.siteId ?? null,
    site: opts.siteNom ? { nom: opts.siteNom } : null,
    structure:
      opts.structureType || opts.structureNom
        ? { type: opts.structureType ?? null, nom: opts.structureNom ?? null }
        : null,
  };
}

/** Utilisateur directeur (accès tous sites). */
const adminUser = {
  id: "user-admin",
  role: "TENANT_ADMIN" as Role,
  siteId: null,
  siteIds: [],
  tenantHasSites: true,
};

/** Utilisateur enseignant (scope restreint). */
const teacherUser = {
  id: "user-teacher",
  role: "TEACHER" as Role,
  siteId: "site-a",
  siteIds: ["site-a"],
  tenantHasSites: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAnneeCouranteLibelle).mockResolvedValue(ANNEE);
  vi.mocked(isTeacherRole).mockReturnValue(false);
});

// ------------------------------------------------------------
// getClassesHierarchie
// ------------------------------------------------------------

describe("getClassesHierarchie — organisation par catégorie → niveau → classe", () => {
  it("regroupe les classes par catégorie puis par niveau", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme", { siteId: "site-a", siteNom: "Campus A" }),
      mockClasse("c2", "6ème B", "6eme", { siteId: "site-a", siteNom: "Campus A" }),
      mockClasse("c3", "3ème A", "3eme", { siteId: "site-a", siteNom: "Campus A" }),
      mockClasse("c4", "Seconde S", "seconde", { siteId: "site-a", siteNom: "Campus A" }),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    // Catégories attendues : Collège (6ème, 3ème) et Lycée (Seconde)
    const categories = result.map((c) => c.categorie);
    expect(categories).toContain("Collège");
    expect(categories).toContain("Lycée");

    const college = result.find((c) => c.categorie === "Collège")!;
    expect(college.niveaux.map((n) => n.niveau)).toEqual(["6eme", "3eme"]);
    expect(college.niveaux[0].classes.map((c) => c.nom)).toEqual(["6ème A", "6ème B"]);
    expect(college.niveaux[1].classes.map((c) => c.nom)).toEqual(["3ème A"]);

    const lycee = result.find((c) => c.categorie === "Lycée")!;
    expect(lycee.niveaux).toHaveLength(1);
    expect(lycee.niveaux[0].niveau).toBe("seconde");
  });

  it("ordonne les catégories selon SCHOOL_GROUP_ORDER (Primaire → Collège → Lycée → Autre)", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "Terminale S", "terminale"),
      mockClasse("c2", "CP A", "cp"),
      mockClasse("c3", "6ème A", "6eme"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    expect(result.map((c) => c.categorie)).toEqual(["Primaire", "Collège", "Lycée"]);
  });

  it("utilise la Structure en priorité pour déterminer la catégorie", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      // niveau "seconde" → Lycée par getSchoolGroup, mais Structure PRIMAIRE → Primaire
      mockClasse("c1", "Classe Spéciale", "seconde", { structureType: "PRIMAIRE" }),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    expect(result[0].categorie).toBe("Primaire");
  });

  it("Structure MATERNELLE → catégorie Autre", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "Petite Section", "maternelle", { structureType: "MATERNELLE" }),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    expect(result[0].categorie).toBe("Autre");
  });

  it("fallback sur getSchoolGroup(niveau) quand aucune Structure", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "CM2 A", "cm2"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    expect(result[0].categorie).toBe("Primaire");
  });
});

describe("getClassesHierarchie — filtrage", () => {
  it("filtre par année scolaire (annee passée à findMany)", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser, { anneeCourante: "2024-2025" });

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as { where: { annee?: string } };
    expect(where.where.annee).toBe("2024-2025");
  });

  it("résout l'année courante automatiquement si non fournie", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser);

    expect(getAnneeCouranteLibelle).toHaveBeenCalledWith(TENANT);
    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as { where: { annee?: string } };
    expect(where.where.annee).toBe(ANNEE);
  });

  it("n'ajoute pas de filtre annee si anneeCourante est null", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser, { anneeCourante: null });

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as { where: Record<string, unknown> };
    expect(where.where.annee).toBeUndefined();
  });

  it("exclut les classes archivées (deletedAt: null)", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser, { anneeCourante: ANNEE });

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as { where: { deletedAt: unknown } };
    expect(where.where.deletedAt).toBeNull();
  });

  it("applique le filtre de site pour un enseignant (scope SITES)", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, teacherUser, { anneeCourante: ANNEE });

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    // Le filtre de site est encapsulé dans AND
    expect(where.where.AND).toBeDefined();
    expect(Array.isArray(where.where.AND)).toBe(true);
  });

  it("n'applique pas de filtre de site pour un TENANT_ADMIN (scope ALL)", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser, { anneeCourante: ANNEE });

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as {
      where: { AND?: unknown[] };
    };
    // Scope ALL → pas de filtre AND sur siteId
    expect(where.where.AND).toBeUndefined();
  });
});

describe("getClassesHierarchie — scope enseignant", () => {
  it("un enseignant ne voit que ses classes (getTeacherScope)", async () => {
    vi.mocked(isTeacherRole).mockReturnValue(true);
    vi.mocked(getTeacherScope).mockResolvedValue({
      classeIds: ["c1", "c2"],
      matiereIds: ["m1"],
      isRestricted: true,
    });
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme"),
      mockClasse("c2", "6ème B", "6eme"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, teacherUser, {
      anneeCourante: ANNEE,
    });

    expect(getTeacherScope).toHaveBeenCalledWith(TENANT, "user-teacher", "TEACHER", ANNEE);

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(where.where.id).toEqual({ in: ["c1", "c2"] });

    // Seules les classes c1 et c2 sont retournées
    const allIds = result.flatMap((cat) => cat.niveaux.flatMap((n) => n.classes.map((c) => c.id)));
    expect(allIds).toEqual(["c1", "c2"]);
  });

  it("utilise classeIdsRestriction si fourni (n'appelle pas getTeacherScope)", async () => {
    vi.mocked(isTeacherRole).mockReturnValue(true);
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c-x", "3ème X", "3eme"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, teacherUser, {
      anneeCourante: ANNEE,
      classeIdsRestriction: ["c-x"],
    });

    expect(getTeacherScope).not.toHaveBeenCalled();

    const where = vi.mocked(prisma.classe.findMany).mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(where.where.id).toEqual({ in: ["c-x"] });
  });

  it("un non-enseignant n'est pas restreint par getTeacherScope", async () => {
    vi.mocked(isTeacherRole).mockReturnValue(false);
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, adminUser, { anneeCourante: ANNEE });

    expect(getTeacherScope).not.toHaveBeenCalled();
  });

  it("passe l'année courante à getTeacherScope", async () => {
    vi.mocked(isTeacherRole).mockReturnValue(true);
    vi.mocked(getTeacherScope).mockResolvedValue({
      classeIds: [],
      matiereIds: [],
      isRestricted: true,
    });
    vi.mocked(prisma.classe.findMany).mockResolvedValue([] as never);

    await getClassesHierarchie(TENANT, teacherUser, { anneeCourante: "2030-2031" });

    expect(getTeacherScope).toHaveBeenCalledWith(TENANT, "user-teacher", "TEACHER", "2030-2031");
  });
});

describe("getClassesHierarchie — effectifs", () => {
  it("calcule les effectifs par classe via eleve.groupBy", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme"),
      mockClasse("c2", "6ème B", "6eme"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([
      { classeId: "c1", _count: 25 },
      { classeId: "c2", _count: 18 },
    ] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    const allClasses = result.flatMap((cat) => cat.niveaux.flatMap((n) => n.classes));
    expect(allClasses.find((c) => c.id === "c1")?.effectif).toBe(25);
    expect(allClasses.find((c) => c.id === "c2")?.effectif).toBe(18);
  });

  it("effectif = 0 si aucune donnée groupBy pour la classe", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme"),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    const allClasses = result.flatMap((cat) => cat.niveaux.flatMap((n) => n.classes));
    expect(allClasses[0].effectif).toBe(0);
  });

  it("avecEffectifs=false → n'appelle pas eleve.groupBy", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme"),
    ] as never);

    await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
      avecEffectifs: false,
    });

    expect(prisma.eleve.groupBy).not.toHaveBeenCalled();
  });

  it("inclus le nom du site dans chaque classe", async () => {
    vi.mocked(prisma.classe.findMany).mockResolvedValue([
      mockClasse("c1", "6ème A", "6eme", { siteId: "site-a", siteNom: "Campus A" }),
    ] as never);
    vi.mocked(prisma.eleve.groupBy).mockResolvedValue([] as never);

    const result = await getClassesHierarchie(TENANT, adminUser, {
      anneeCourante: ANNEE,
    });

    const cls = result.flatMap((cat) => cat.niveaux.flatMap((n) => n.classes))[0];
    expect(cls.siteId).toBe("site-a");
    expect(cls.siteNom).toBe("Campus A");
  });
});

// ------------------------------------------------------------
// aplatirHierarchie
// ------------------------------------------------------------

describe("aplatirHierarchie", () => {
  it("convertit une hiérarchie en liste plate de { id, nom, niveau }", () => {
    const hierarchie: ClassesHierarchie = [
      {
        categorie: "Collège",
        label: "college",
        niveaux: [
          {
            niveau: "6eme",
            classes: [
              { id: "c1", nom: "6ème A", niveau: "6eme", filiere: null, siteId: null, siteNom: null, effectif: 0 },
              { id: "c2", nom: "6ème B", niveau: "6eme", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
          {
            niveau: "3eme",
            classes: [
              { id: "c3", nom: "3ème A", niveau: "3eme", filiere: "Scientifique", siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
      {
        categorie: "Lycée",
        label: "lycee",
        niveaux: [
          {
            niveau: "seconde",
            classes: [
              { id: "c4", nom: "Seconde S", niveau: "seconde", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
    ];

    const plate = aplatirHierarchie(hierarchie);

    expect(plate).toEqual([
      { id: "c1", nom: "6ème A", niveau: "6eme" },
      { id: "c2", nom: "6ème B", niveau: "6eme" },
      { id: "c3", nom: "3ème A", niveau: "3eme" },
      { id: "c4", nom: "Seconde S", niveau: "seconde" },
    ]);
  });

  it("retourne un tableau vide pour une hiérarchie vide", () => {
    expect(aplatirHierarchie([])).toEqual([]);
  });

  it("préserve l'ordre des catégories et des niveaux", () => {
    const hierarchie: ClassesHierarchie = [
      {
        categorie: "Primaire",
        label: "primaire",
        niveaux: [
          {
            niveau: "cp",
            classes: [
              { id: "p1", nom: "CP A", niveau: "cp", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
      {
        categorie: "Collège",
        label: "college",
        niveaux: [
          {
            niveau: "6eme",
            classes: [
              { id: "k1", nom: "6ème A", niveau: "6eme", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
    ];

    const plate = aplatirHierarchie(hierarchie);
    expect(plate.map((c) => c.id)).toEqual(["p1", "k1"]);
  });
});

// ------------------------------------------------------------
// extraireClasseIds
// ------------------------------------------------------------

describe("extraireClasseIds", () => {
  it("extrait tous les IDs de classes de la hiérarchie", () => {
    const hierarchie: ClassesHierarchie = [
      {
        categorie: "Collège",
        label: "college",
        niveaux: [
          {
            niveau: "6eme",
            classes: [
              { id: "c1", nom: "6ème A", niveau: "6eme", filiere: null, siteId: null, siteNom: null, effectif: 0 },
              { id: "c2", nom: "6ème B", niveau: "6eme", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
      {
        categorie: "Lycée",
        label: "lycee",
        niveaux: [
          {
            niveau: "seconde",
            classes: [
              { id: "c3", nom: "Seconde S", niveau: "seconde", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
    ];

    expect(extraireClasseIds(hierarchie)).toEqual(["c1", "c2", "c3"]);
  });

  it("retourne un tableau vide pour une hiérarchie vide", () => {
    expect(extraireClasseIds([])).toEqual([]);
  });

  it("retourne un tableau vide si aucune classe dans les niveaux", () => {
    const hierarchie: ClassesHierarchie = [
      {
        categorie: "Collège",
        label: "college",
        niveaux: [{ niveau: "6eme", classes: [] }],
      },
    ];
    expect(extraireClasseIds(hierarchie)).toEqual([]);
  });

  it("préserve l'ordre de parcours (catégorie → niveau → classe)", () => {
    const hierarchie: ClassesHierarchie = [
      {
        categorie: "Primaire",
        label: "primaire",
        niveaux: [
          {
            niveau: "cp",
            classes: [
              { id: "a", nom: "A", niveau: "cp", filiere: null, siteId: null, siteNom: null, effectif: 0 },
              { id: "b", nom: "B", niveau: "cp", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
          {
            niveau: "ce1",
            classes: [
              { id: "c", nom: "C", niveau: "ce1", filiere: null, siteId: null, siteNom: null, effectif: 0 },
            ],
          },
        ],
      },
    ];

    expect(extraireClasseIds(hierarchie)).toEqual(["a", "b", "c"]);
  });
});
