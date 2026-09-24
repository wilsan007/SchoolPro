"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditFire } from "@/lib/audit";
import { checkPermission } from "@/lib/rbac";

const AnneeScolaireSchema = z.object({
  libelle: z.string().min(1, "Le libellé est requis"),
  dateDebut: z.string().min(1, "La date de début est requise"),
  dateFin: z.string().min(1, "La date de fin est requise"),
});

export async function getAnneesScolaires() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.anneesScolaires.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { dateDebut: "desc" },
  });
}

export async function createAnneeScolaire(data: z.infer<typeof AnneeScolaireSchema>) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const parsed = AnneeScolaireSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  const dateDebut = new Date(v.dateDebut);
  const dateFin = new Date(v.dateFin);

  if (dateFin <= dateDebut) {
    throw new Error("La date de fin doit être postérieure à la date de début");
  }

  const existing = await prisma.anneesScolaires.findFirst({
    where: { tenantId: session.user.tenantId, libelle: v.libelle },
  });
  if (existing) {
    throw new Error("Une année scolaire avec ce libellé existe déjà");
  }

  await prisma.anneesScolaires.create({
    data: {
      tenantId: session.user.tenantId,
      libelle: v.libelle,
      dateDebut,
      dateFin,
      isCurrent: false,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function activateAnneeScolaire(anneeId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId: session.user.tenantId },
  });
  if (!annee) throw new Error("Année scolaire introuvable");

  await prisma.$transaction([
    prisma.anneesScolaires.updateMany({
      where: { tenantId: session.user.tenantId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.anneesScolaires.update({
      where: { id: anneeId, tenantId: session.user.tenantId },
      data: { isCurrent: true },
    }),
    prisma.tenant.update({
      where: { id: session.user.tenantId },
      data: { currentYear: annee.libelle },
    }),
  ]);

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteAnneeScolaire(anneeId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");
  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permissions insuffisantes");

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId: session.user.tenantId },
  });
  if (!annee) throw new Error("Année scolaire introuvable");
  if (annee.isCurrent) throw new Error("Impossible de supprimer l'année scolaire active");

  const hasPeriodes = await prisma.periode.count({
    where: { anneeId, annee: { tenantId: session.user.tenantId } },
  });
  if (hasPeriodes > 0) {
    throw new Error("Impossible de supprimer une année scolaire liée à des périodes");
  }

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "anneesScolaires:delete",
    verdict: "ALLOWED",
    resource: "anneesScolaires",
    resourceId: anneeId,
  });

  await prisma.anneesScolaires.delete({
    where: { id: anneeId, tenantId: session.user.tenantId },
  });

  revalidatePath("/parametres");
  return { success: true };
}
