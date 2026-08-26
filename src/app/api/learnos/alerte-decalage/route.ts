import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import prisma from "@/lib/prisma";
import { detecterDecalageSemaine } from "@/lib/learnos/alerte-decalage";
import { getDemoNow } from "@/lib/demo-now";
import { anneeALaDate } from "@/lib/annee-scolaire";

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

  // Résoudre l'année active au sens chronologique (respecte la Time Machine
  // et le trou estival : pendant les vacances, c'est la dernière année
  // terminée, pas la prochaine marquée isCurrent qui n'a pas commencé).
  const maintenant = await getDemoNow();
  const annee = await anneeALaDate(tenantId, maintenant);

  if (!annee) {
    return NextResponse.json(
      { error: "Aucune année scolaire active" },
      { status: 404 }
    );
  }

  // En période estivale (l'année active n'a pas encore commencé), il n'y a
  // ni planification ni enseignement : on retourne un résultat vide plutôt
  // que de chercher des décalages sur une année qui n'existe pas encore.
  if (annee.dateDebut > maintenant) {
    return NextResponse.json({
      resume: { total: 0, decalages: 0, declaresSeuls: 0, alignes: 0 },
      details: [],
      semaine: 0,
      debut: annee.dateDebut.toISOString(),
      fin: annee.dateDebut.toISOString(),
    });
  }

  try {
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
