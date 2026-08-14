import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";

/**
 * Avancement réel d'un chapitre.
 *
 * Distinct de l'ajustement des dates : ici l'enseignant dit « j'ai commencé »
 * ou « j'ai terminé ». C'est ce qui permet de mesurer l'avancement réel du
 * programme, indépendamment des dates qu'il a pu réajuster entre-temps.
 */
const PatchSchema = z.object({
  anneeId: z.string().min(1),
  statut: z.enum(["PREVU", "EN_COURS", "TRAITE"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapitreId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const { chapitreId } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const tenantId = session.user.tenantId;
  const { anneeId, statut } = parsed.data;

  const existante = await prisma.planificationChapitre.findFirst({
    where: {
      chapitreId,
      anneeId,
      tenantId,
      ...siteFilterForModel("planificationChapitre", session.user),
    },
    select: { id: true, demarreLe: true },
  });
  if (!existante) {
    return erreurJson("PLANIFICATION_INTROUVABLE");
  }

  const maintenant = new Date();

  await prisma.planificationChapitre.updateMany({
    where: { id: existante.id, tenantId },
    data: {
      statut,
      // La date de démarrage n'est posée qu'une fois : rouvrir un chapitre
      // après l'avoir clos ne doit pas effacer quand il a réellement commencé.
      demarreLe: statut === "PREVU" ? null : (existante.demarreLe ?? maintenant),
      traiteLe: statut === "TRAITE" ? maintenant : null,
    },
  });

  revalidatePath("/curriculum");
  return NextResponse.json({ success: true, statut });
}
