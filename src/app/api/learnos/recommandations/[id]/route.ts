import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Décision humaine sur une recommandation.
 *
 * Accepter ou écarter est un acte d'enseignant, pas un calcul : le moteur
 * (P9-A) préserve ces deux statuts au recalcul, sans quoi le système
 * ressusciterait indéfiniment une recommandation délibérément écartée.
 */

const PatchSchema = z.object({
  statut: z.enum(["ACCEPTEE", "ECARTEE"]),
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
    return erreurJson("STATUT_INVALIDE");
  }
  const tenantId = session.user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const existante = await prisma.recommandation.findFirst({
    where: {
      id,
      tenantId,
      ...siteFilterForModel("recommandation", session.user),
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
    },
    select: { id: true },
  });
  if (!existante) {
    return erreurJson("RECOMMANDATION_INTROUVABLE");
  }

  // `updateMany` pour exiger le tenant dans le `where` : une écriture ne se
  // contente pas d'un identifiant.
  await prisma.recommandation.updateMany({
    where: {
      id,
      tenantId,
      ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
    },
    data: {
      statut: parsed.data.statut,
      decideParId: session.user.id,
      decideeLe: new Date(),
    },
  });

  revalidatePath("/recommandations");
  return NextResponse.json({ success: true, statut: parsed.data.statut });
}
