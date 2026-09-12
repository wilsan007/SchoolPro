"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";

const MatiereSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  code: z.string().min(1, "Le code est requis"),
  coefficient: z.number().min(0.5).default(1),
  couleur: z.string().optional(),
  niveau: z.string().optional(),
});

export type MatiereFormData = z.infer<typeof MatiereSchema>;

export async function getMatieresForSettings() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  return prisma.matiere.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("matiere", session.user),
    },
    orderBy: { nom: "asc" },
  });
}

export async function createMatiere(data: MatiereFormData) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const parsed = MatiereSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const v = parsed.data;
  await prisma.matiere.create({
    data: {
      tenantId: session.user.tenantId,
      nom: v.nom,
      code: v.code,
      coefficient: v.coefficient,
      couleur: v.couleur || null,
      niveau: v.niveau || null,
    },
  });

  revalidatePath("/parametres");
  return { success: true };
}

export async function deleteMatiere(matiereId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  const matiere = await prisma.matiere.findFirst({
    where: {
      id: matiereId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("matiere", session.user),
    },
  });
  if (!matiere) throw new Error("Matière non trouvée");

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "matiere:delete",
    verdict: "ALLOWED",
    resource: "matiere",
    resourceId: matiereId,
  });

  await prisma.matiere.delete({ where: { id: matiereId } });

  revalidatePath("/parametres");
  return { success: true };
}
