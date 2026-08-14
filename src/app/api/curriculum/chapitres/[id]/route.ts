import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";

const PatchSchema = z.object({
  nom: z.string().min(2).max(150).optional(),
  niveau: z.string().min(1).max(50).optional(),
  ordre: z.number().int().min(0).optional(),
  objectifs: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const tenantId = session.user.tenantId;

  const existant = await prisma.chapitre.findFirst({
    where: { id, tenantId, ...siteFilterForModel("chapitre", session.user) },
    select: { id: true },
  });
  if (!existant) {
    return erreurJson("CHAPITRE_INTROUVABLE");
  }

  const chapitre = await prisma.chapitre.update({
    where: { id },
    data: parsed.data,
  });

  revalidatePath("/curriculum");
  return NextResponse.json(chapitre);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:delete");
  if (denied) return denied;

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const existant = await prisma.chapitre.findFirst({
    where: { id, tenantId, ...siteFilterForModel("chapitre", session.user) },
    select: { id: true, _count: { select: { competences: true } } },
  });
  if (!existant) {
    return erreurJson("CHAPITRE_INTROUVABLE");
  }

  // Supprimer en cascade emporterait les compétences, et avec elles les preuves
  // d'apprentissage et profils déjà constitués. On refuse plutôt que de
  // détruire silencieusement un historique pédagogique.
  if (existant._count.competences > 0) {
    return erreurJson("CHAPITRE_A_DES_COMPETENCES", {
      nb: existant._count.competences,
    });
  }

  await prisma.chapitre.delete({ where: { id } });

  revalidatePath("/curriculum");
  return NextResponse.json({ success: true });
}
