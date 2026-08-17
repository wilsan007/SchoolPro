import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { releverTexte, type NiveauLecture } from "@/lib/learnos/releveling";

/**
 * POST /api/learnos/releveling
 * Body: { texte, niveau, matiereNom?, niveauScolaire? }
 *
 * Simplifie un texte au niveau de lecture demandé.
 *
 * ACCÈS : tout rôle avec `curriculum:read` (enseignants, direction).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "curriculum:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const body = await req.json().catch(() => ({}));
  const { texte, niveau, matiereNom, niveauScolaire } = body;

  if (!texte || typeof texte !== "string" || texte.trim().length < 10) {
    return NextResponse.json(
      { error: "Texte trop court (min 10 caractères)" },
      { status: 400 }
    );
  }

  const niveauxValides: NiveauLecture[] = ["ELEMENTAIRE", "FONDAMENTAL", "INTERMEDIAIRE", "AVANCE"];
  if (!niveau || !niveauxValides.includes(niveau)) {
    return NextResponse.json(
      { error: `Niveau invalide. Valeurs acceptées : ${niveauxValides.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const resultat = await releverTexte(tenantId, session.user, {
      texte,
      niveau,
      matiereNom,
      niveauScolaire,
    });
    return NextResponse.json(resultat);
  } catch (error) {
    console.error("[api/releveling]", error);
    return NextResponse.json(
      { error: "Erreur lors du re-leveling" },
      { status: 500 }
    );
  }
}
