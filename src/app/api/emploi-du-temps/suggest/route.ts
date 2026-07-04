import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { suggestSlots } from "@/lib/emploi-du-temps/suggest";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const matiereId = searchParams.get("matiereId");
    const enseignantId = searchParams.get("enseignantId") || undefined;
    const duree = parseInt(searchParams.get("duree") || "60", 10);

    if (!classeId || !matiereId) {
      return NextResponse.json({ error: "classeId et matiereId requis" }, { status: 400 });
    }

    const result = await suggestSlots({ tenantId, classeId, matiereId, enseignantId, duree });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API/emploi-du-temps/suggest]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
