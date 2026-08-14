import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { listerAnneesAvecResume, definirAnneeCourante } from "@/lib/annee-scolaire";

/**
 * GET /api/parametres/annees-scolaires
 * Liste les années scolaires du tenant avec résumé.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

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

  const body = await req.json().catch(() => null);
  if (!body) return erreurJson("DONNEES_INVALIDES");

  const tenantId = session.user.tenantId;

  if (body.action === "creer") {
    const { libelle, dateDebut, dateFin } = body;
    if (!libelle || !dateDebut || !dateFin) {
      return erreurJson("DONNEES_INVALIDES");
    }

    // Vérifier qu'il n'y a pas déjà une année avec le même libellé
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
        isCurrent: body.definirCourante ?? false,
      },
    });

    if (body.definirCourante) {
      await definirAnneeCourante(annee.id, tenantId);
    }

    return Response.json(annee, { status: 201 });
  }

  if (body.action === "definirCourante") {
    const { anneeId } = body;
    if (!anneeId) return erreurJson("DONNEES_INVALIDES");

    const annee = await definirAnneeCourante(anneeId, tenantId);
    return Response.json(annee);
  }

  return erreurJson("DONNEES_INVALIDES");
}
