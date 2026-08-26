import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-filter";
import { anneeActiveId } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");
    const eleveId = searchParams.get("eleveId");

    // Isolation par site ET périmètre personnel : le rôle PARENT dispose de
    // `bulletins:read` et pouvait, sans ce filtre, lister les bulletins de tous
    // les élèves du tenant — ou cibler n'importe quel `eleveId`.
    const scopeFilter = eleveScopeFilter(session.user, "eleve");
    const anneeId = await anneeActiveId(session.user.tenantId);

    const where: any = mergeFilters(
      {
        tenantId: session.user.tenantId,
        ...(periodeId ? { periodeId } : {}),
        ...(eleveId ? { eleveId } : {}),
        ...(!eleveId && classeId ? { eleve: { classeId } } : {}),
        ...(anneeId ? { periode: { anneeId } } : {}),
      },
      scopeFilter
    );

    const bulletins = await prisma.bulletin.findMany({
      where,
      include: {
        eleve: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            matricule: true,
            classe: { select: { nom: true } }
          }
        },
        periode: {
          select: { nom: true, numero: true }
        }
      },
      orderBy: [
        { eleve: { nom: "asc" } }
      ]
    });

    // Inclure le statut de verrouillage dans la réponse
    const bulletinsAvecStatut = bulletins.map((b) => ({
      ...b,
      verrouille: b.statut === "VERROUILLE" || b.statut === "PUBLIE",
    }));

    return NextResponse.json({ bulletins: bulletinsAvecStatut });
  } catch (error) {
    console.error("[API/bulletins/list]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
