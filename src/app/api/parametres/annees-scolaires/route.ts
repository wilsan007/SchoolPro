import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { listerAnneesAvecResume, definirAnneeCourante } from "@/lib/annee-scolaire";

const PostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("creer"),
    libelle: z.string().min(1),
    dateDebut: z.string().min(1),
    dateFin: z.string().min(1),
    definirCourante: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("definirCourante"),
    anneeId: z.string().min(1),
  }),
]);

/**
 * GET /api/parametres/annees-scolaires
 * Liste les années scolaires du tenant avec résumé.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "parametres:read");
  if (denied) return denied;

  const annees = await listerAnneesAvecResume(session.user.tenantId);
  return Response.json({ annees });
}

/**
 * POST /api/parametres/annees-scolaires
 * Crée une nouvelle année scolaire ou définit l'année courante.
 * Body: { action: "creer" | "definirCourante", ... }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const tenantId = session.user.tenantId;
  const body = parsed.data;

  if (body.action === "creer") {
    const { libelle, dateDebut, dateFin, definirCourante } = body;

    const existante = await prisma.anneesScolaires.findFirst({
      where: { tenantId, libelle },
    });
    if (existante) {
      return erreurJson("SLUG_DEJA_UTILISE", undefined, {
        detail: "Une année avec ce libellé existe déjà",
      });
    }

    const annee = await prisma.anneesScolaires.create({
      data: {
        tenantId,
        libelle,
        dateDebut: new Date(dateDebut),
        dateFin: new Date(dateFin),
        isCurrent: definirCourante ?? false,
      },
    });

    if (definirCourante) {
      await definirAnneeCourante(annee.id, tenantId);
    }

    return Response.json(annee, { status: 201 });
  }

  const { anneeId } = body;
  const annee = await definirAnneeCourante(anneeId, tenantId);
  return Response.json(annee);
}
