import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { releverTexte, type NiveauLecture } from "@/lib/learnos/releveling";

const NiveauxValides: NiveauLecture[] = [
  "ELEMENTAIRE",
  "FONDAMENTAL",
  "INTERMEDIAIRE",
  "AVANCE",
];

const BodySchema = z.object({
  texte: z.string().min(10),
  niveau: z.enum(["ELEMENTAIRE", "FONDAMENTAL", "INTERMEDIAIRE", "AVANCE"]),
  matiereNom: z.string().optional(),
  niveauScolaire: z.string().optional(),
});

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
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { texte, niveau, matiereNom, niveauScolaire } = parsed.data;

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
