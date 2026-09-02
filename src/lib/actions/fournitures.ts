"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteFilterForModel, siteIdForCreate } from "@/lib/site-scope";
import { isTeacherRole, getTeacherScope } from "@/lib/teacher-classes";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ============================================================
// SCHÉMAS DE VALIDATION
// ============================================================

const DemandeFournitureSchema = z.object({
  niveau: z.string().min(1, "Le niveau est requis"),
  matiereId: z.string().optional().nullable(),
  type: z.enum(["LIVRE", "CAHIER", "INSTRUMENT", "AUTRE"]),
  nom: z.string().min(1, "Le nom est requis"),
  description: z.string().optional().nullable(),
  quantite: z.number().int().min(1).default(1),
  format: z.string().optional().nullable(),
  prixEstime: z.number().optional().nullable(),
});

export type DemandeFournitureFormData = z.infer<typeof DemandeFournitureSchema>;

// ============================================================
// LECTURE — ENSEIGNANT
// ============================================================

/// Récupère les niveaux distincts des classes de l'enseignant connecté.
export async function getNiveauxForEnseignant(): Promise<string[]> {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const role = session.user.role;
  if (!isTeacherRole(role as any)) return [];

  const scope = await getTeacherScope(session.user.tenantId, session.user.id, role as any);
  if (scope.classeIds.length === 0) return [];

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const classes = await prisma.classe.findMany({
    where: {
      id: { in: scope.classeIds },
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { niveau: true },
    distinct: ["niveau"],
  });
  return classes.map((c) => c.niveau).sort();
}

/// Récupère les matières de l'enseignant connecté.
export async function getMatieresForEnseignant(): Promise<{ id: string; nom: string }[]> {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const role = session.user.role;
  if (!isTeacherRole(role as any)) return [];

  const scope = await getTeacherScope(session.user.tenantId, session.user.id, role as any);
  if (scope.matiereIds.length === 0) return [];

  return prisma.matiere.findMany({
    where: { id: { in: scope.matiereIds }, tenantId: session.user.tenantId, ...siteFilterForModel("matiere", session.user) },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });
}

/// Récupère les demandes de fourniture de l'enseignant connecté.
export async function getMesDemandesFournitures() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // eslint-disable-next-line ecolpro/require-site-filter -- lookup by userId+tenantId
  const enseignant = await prisma.enseignant.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!enseignant) return [];

  return prisma.demandeFourniture.findMany({
    where: {
      enseignantId: enseignant.id,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("demandeFourniture", session.user),
    },
    include: {
      matiere: { select: { nom: true } },
    },
    orderBy: [{ niveau: "asc" }, { type: "asc" }, { createdAt: "desc" }],
  });
}

// ============================================================
// ÉCRITURE — ENSEIGNANT
// ============================================================

export async function creerDemandeFourniture(data: DemandeFournitureFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  const role = session.user.role;
  if (!isTeacherRole(role as any)) throw new Error("Réservé aux enseignants");

  const parsed = DemandeFournitureSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;

  // eslint-disable-next-line ecolpro/require-site-filter -- lookup by userId+tenantId
  const enseignant = await prisma.enseignant.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!enseignant) throw new Error("Enseignant non trouvé");

  await prisma.demandeFourniture.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: siteIdForCreate(session.user),
      enseignantId: enseignant.id,
      niveau: v.niveau,
      matiereId: v.matiereId || null,
      type: v.type,
      nom: v.nom,
      description: v.description || null,
      quantite: v.quantite,
      format: v.format || null,
      prixEstime: v.prixEstime ?? null,
      statut: "PROPOSEE",
    },
  });

  revalidatePath("/fournitures/enseignant");
  return { success: true };
}

export async function supprimerDemandeFourniture(id: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // eslint-disable-next-line ecolpro/require-site-filter -- lookup by userId+tenantId
  const enseignant = await prisma.enseignant.findFirst({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!enseignant) throw new Error("Enseignant non trouvé");

  // L'enseignant ne peut supprimer que ses propres demandes non encore validées
  await prisma.demandeFourniture.deleteMany({
    where: {
      id,
      enseignantId: enseignant.id,
      tenantId: session.user.tenantId,
      statut: "PROPOSEE",
    },
  });

  revalidatePath("/fournitures/enseignant");
  return { success: true };
}

// ============================================================
// LECTURE — SECRÉTARIAT / DIRECTION
// ============================================================

/// Récupère toutes les demandes de fourniture (tous enseignants confondus).
export async function getAllDemandesFournitures() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.demandeFourniture.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("demandeFourniture", session.user),
    },
    include: {
      enseignant: { select: { user: { select: { name: true } } } },
      matiere: { select: { nom: true } },
    },
    orderBy: [{ niveau: "asc" }, { statut: "asc" }, { type: "asc" }],
  });
}

/// Récupère les niveaux distincts qui ont des demandes.
export async function getNiveauxAvecDemandes() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  const result = await prisma.demandeFourniture.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("demandeFourniture", session.user),
    },
    select: { niveau: true },
    distinct: ["niveau"],
  });
  return result.map((r) => r.niveau).sort();
}

/// Récupère les classes groupées par niveau.
export async function getClassesParNiveau() {
  const session = await auth();
  if (!session?.user?.tenantId) return {} as Record<string, { id: string; nom: string }[]>;

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, nom: true, niveau: true },
    orderBy: { nom: "asc" },
  });

  const parNiveau: Record<string, { id: string; nom: string }[]> = {};
  for (const c of classes) {
    if (!parNiveau[c.niveau]) parNiveau[c.niveau] = [];
    parNiveau[c.niveau].push({ id: c.id, nom: c.nom });
  }
  return parNiveau;
}

/// Récupère les listes de fournitures publiées par classe.
export async function getListesFournituresPubliees() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.listeFournitureClasse.findMany({
    where: {
      tenantId: session.user.tenantId,
      statut: "PUBLIEE",
      ...siteFilterForModel("listeFournitureClasse", session.user),
    },
    include: {
      classe: { select: { nom: true, niveau: true } },
      items: { include: { matiere: { select: { nom: true } } } },
    },
    orderBy: { classe: { nom: "asc" } },
  });
}

// ============================================================
// ÉCRITURE — SECRÉTARIAT / DIRECTION
// ============================================================

/// Valide une demande de fourniture.
export async function validerDemandeFourniture(id: string, commentaire?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  await prisma.demandeFourniture.updateMany({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("demandeFourniture", session.user),
    },
    data: {
      statut: "VALIDEE",
      valideeParId: session.user.id,
      valideeLe: new Date(),
      commentaireValidation: commentaire || null,
    },
  });

  revalidatePath("/fournitures");
  return { success: true };
}

/// Rejette une demande de fourniture.
export async function rejeterDemandeFourniture(id: string, commentaire?: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  await prisma.demandeFourniture.updateMany({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("demandeFourniture", session.user),
    },
    data: {
      statut: "REJETEE",
      valideeParId: session.user.id,
      valideeLe: new Date(),
      commentaireValidation: commentaire || null,
    },
  });

  revalidatePath("/fournitures");
  return { success: true };
}

/// Publie les listes de fournitures pour toutes les classes d'un niveau.
/// Compile les demandes VALIDEE pour ce niveau et crée une
/// ListeFournitureClasse pour chaque classe de ce niveau.
export async function publierListePourNiveau(niveau: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const tenantId = session.user.tenantId;

  // 1. Récupérer les demandes validées pour ce niveau
  const demandesValidees = await prisma.demandeFourniture.findMany({
    where: {
      tenantId,
      niveau,
      statut: "VALIDEE",
      ...siteFilterForModel("demandeFourniture", session.user),
    },
  });

  if (demandesValidees.length === 0) {
    throw new Error(`Aucune demande validée pour le niveau ${niveau}`);
  }

  // 2. Récupérer toutes les classes de ce niveau
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      niveau,
      deletedAt: null,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, siteId: true },
  });

  if (classes.length === 0) {
    throw new Error(`Aucune classe trouvée pour le niveau ${niveau}`);
  }

  // 3. Pour chaque classe, créer ou mettre à jour la liste
  for (const classe of classes) {
    // Vérifier si une liste existe déjà
    const existing = await prisma.listeFournitureClasse.findFirst({
      where: { classeId: classe.id, tenantId },
      include: { items: true },
    });

    if (existing) {
      // Mettre à jour : supprimer les anciens items et recréer
      await prisma.listeFournitureItem.deleteMany({
        where: { listeId: existing.id },
      });
      await prisma.listeFournitureClasse.update({
        where: { id: existing.id },
        data: {
          statut: "PUBLIEE",
          publieeParId: session.user.id,
          publieeLe: new Date(),
          items: {
            create: demandesValidees.map((d) => ({
              type: d.type,
              nom: d.nom,
              description: d.description,
              quantite: d.quantite,
              format: d.format,
              prixEstime: d.prixEstime,
              matiereId: d.matiereId,
              sourceDemandeId: d.id,
            })),
          },
        },
      });
    } else {
      // Créer
      await prisma.listeFournitureClasse.create({
        data: {
          tenantId,
          siteId: classe.siteId,
          classeId: classe.id,
          niveau,
          statut: "PUBLIEE",
          publieeParId: session.user.id,
          publieeLe: new Date(),
          items: {
            create: demandesValidees.map((d) => ({
              type: d.type,
              nom: d.nom,
              description: d.description,
              quantite: d.quantite,
              format: d.format,
              prixEstime: d.prixEstime,
              matiereId: d.matiereId,
              sourceDemandeId: d.id,
            })),
          },
        },
      });
    }
  }

  revalidatePath("/fournitures");
  revalidatePath("/eleves");
  revalidatePath("/parents");
  return { success: true, nbClasses: classes.length, nbItems: demandesValidees.length };
}

// ============================================================
// LECTURE — ÉLÈVE / PARENT
// ============================================================

/// Récupère la liste de fournitures publiée pour une classe donnée.
export async function getListeFournitureForClasse(classeId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) return null;

  return prisma.listeFournitureClasse.findFirst({
    where: {
      classeId,
      tenantId: session.user.tenantId,
      statut: "PUBLIEE",
      ...siteFilterForModel("listeFournitureClasse", session.user),
    },
    include: {
      items: {
        include: { matiere: { select: { nom: true } } },
        orderBy: [{ type: "asc" }, { nom: "asc" }],
      },
    },
  });
}
