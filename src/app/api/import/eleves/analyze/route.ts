import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireSiteIdForCreate } from "@/lib/site-scope";
import { preparerPlan } from "@/lib/import-eleves-server";

/**
 * POST /api/import/eleves/analyze
 *
 * Première étape de l'import : lire le fichier et dire ce qui se passerait,
 * **sans rien écrire**. L'utilisateur voit combien d'élèves seraient créés,
 * mis à jour ou ignorés, et pourquoi, avant de confirmer.
 *
 * C'est la mesure qui aurait empêché les 78 fiches en double : l'ancien
 * import écrivait d'abord et affichait le bilan ensuite, si bien qu'un
 * réimport était constaté une fois les dégâts faits.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });

    const { plan } = await preparerPlan(
      {
        id: session.user.id,
        tenantId: session.user.tenantId,
        role: session.user.role,
        siteId: session.user.siteId ?? null,
        siteIds: session.user.siteIds ?? [],
        tenantHasSites: session.user.tenantHasSites,
      },
      await file.arrayBuffer()
    );

    if (plan.lignes.length === 0) {
      return NextResponse.json(
        { error: "Aucune ligne exploitable. Vérifiez les en-têtes : nom, classe et date de naissance sont requis." },
        { status: 400 }
      );
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("[API/import/eleves/analyze]", error);
    const message = error instanceof Error ? error.message : "Erreur lors de l'analyse";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
