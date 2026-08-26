import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { anneeActive } from "@/lib/annee-scolaire";
import {
  tableauSuiviProgramme,
  semaineCourantePourAnnee,
} from "@/lib/learnos/suivi-programme";

/**
 * GET /api/cahier-journal/suivi-programme
 *
 * Tableau de suivi du programme pour la direction / CPE.
 *
 * Query params :
 *  - semaine  (optionnel) — numéro de semaine scolaire (défaut: semaine courante)
 *  - anneeId  (optionnel) — ID de l'année scolaire (défaut: année courante)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Permission : cahier-journal:read (détenu par la direction, l'inspection et
  // les enseignants). Le tableau de suivi est une vue agrégée du cahier-journal.
  const denied = checkPermission(session.user.role, "cahier-journal:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);

  // Résoudre l'année scolaire.
  const anneeIdParam = searchParams.get("anneeId");
  const annee = anneeIdParam
    ? await prisma.anneesScolaires.findFirst({
        where: { id: anneeIdParam, tenantId },
        select: { id: true },
      })
    : await anneeActive(tenantId);

  if (!annee) {
    return NextResponse.json(
      { error: "Aucune année scolaire trouvée" },
      { status: 404 },
    );
  }

  // Résoudre la semaine.
  const semaineParam = searchParams.get("semaine");
  let semaine: number;
  if (semaineParam) {
    const parsed = parseInt(semaineParam, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 36) {
      return NextResponse.json(
        { error: "Numéro de semaine invalide (1-36)" },
        { status: 400 },
      );
    }
    semaine = parsed;
  } else {
    semaine = await semaineCourantePourAnnee(tenantId, annee.id);
  }

  const resultat = await tableauSuiviProgramme(
    tenantId,
    session.user,
    annee.id,
    semaine,
  );

  return NextResponse.json(resultat);
}
