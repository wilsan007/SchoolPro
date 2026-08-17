import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import prisma from "@/lib/prisma";
import { detecterDecalageSemaine } from "@/lib/learnos/alerte-decalage";
import { getDemoNow } from "@/lib/demo-now";

/**
 * GET /api/learnos/alerte-decalage?semaine=N
 *
 * Détecte les décalages entre le programme prévu et ce qui a été
 * réellement enseigné pour une semaine donnée (par défaut : la
 * semaine précédente).
 *
 * ACCÈS : PRINCIPAL, TENANT_ADMIN, SUPER_ADMIN uniquement.
 * L'IA n'est pas utilisée — ce sont des comptages Prisma purs.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  // Réservé à la direction : analytics:read ne suffit pas, car un
  // enseignant l'a pour ses classes. On vérifie le rôle directement.
  const role = session.user.role;
  if (role !== "PRINCIPAL" && role !== "TENANT_ADMIN" && role !== "SUPER_ADMIN") {
    return erreurJson("NON_AUTORISE");
  }

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const semaineParam = searchParams.get("semaine");
  const semaine = semaineParam ? parseInt(semaineParam, 10) : undefined;

  // Résoudre l'année courante.
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  if (!annee) {
    return NextResponse.json(
      { error: "Aucune année scolaire active" },
      { status: 404 }
    );
  }

  try {
    const maintenant = await getDemoNow();
    const resultat = await detecterDecalageSemaine(
      tenantId,
      annee.id,
      session.user,
      semaine,
      maintenant
    );
    return NextResponse.json(resultat);
  } catch (error) {
    console.error("[api/alerte-decalage]", error);
    return NextResponse.json(
      { error: "Erreur lors de la détection des décalages" },
      { status: 500 }
    );
  }
}
