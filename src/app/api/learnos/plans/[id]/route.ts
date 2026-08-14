import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { validerPlan, refuserPlan } from "@/lib/learnos/plan-engine";
import { revalidatePath } from "next/cache";

/**
 * Décision humaine sur un parcours proposé.
 *
 * C'est le passage obligé du système : le moteur propose, un enseignant engage
 * l'établissement. Sans cet écran, les parcours restaient lettre morte —
 * calculés, justifiés, et jamais mis en œuvre.
 */
const PatchSchema = z.object({
  action: z.enum(["valider", "refuser"]),
  motif: z.string().max(300).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "eleves:read");
  if (denied) return denied;

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const tenantId = session.user.tenantId;

  // Le parcours doit relever du périmètre de l'appelant : un enseignant d'un
  // site ne valide pas l'accompagnement d'un élève d'un autre site.
  const plan = await prisma.planProgression.findFirst({
    where: { id, tenantId, ...siteFilterForModel("planProgression", session.user) },
    select: { id: true },
  });
  if (!plan) {
    return erreurJson("PARCOURS_INTROUVABLE");
  }

  const ok =
    parsed.data.action === "valider"
      ? await validerPlan(tenantId, id, session.user.id)
      : await refuserPlan(tenantId, id, parsed.data.motif);

  if (!ok) {
    return erreurJson("PARCOURS_DEJA_TRAITE");
  }

  revalidatePath("/recommandations");
  return NextResponse.json({ success: true, action: parsed.data.action });
}
