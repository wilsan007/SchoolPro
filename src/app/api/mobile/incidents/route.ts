import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  let query = supabase
    .from("incidents")
    .select(`
      id,
      type,
      statut,
      gravite,
      description,
      lieu,
      date,
      eleve:eleveId ( id, nom, prenom, photoUrl ),
      rapportePar:rapporteParId ( id, name )
    `)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(limit);

  if (eleveId) query = query.eq("eleveId", eleveId);

  const { data: incidents, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = incidents ?? [];
  const stats = {
    total: list.length,
    enAttente: list.filter((i: any) => i.statut === "OUVERT" || i.statut === "EN_TRAITEMENT").length,
    resolus: list.filter((i: any) => i.statut === "RESOLU").length,
    graves: list.filter((i: any) => i.gravite >= 3).length,
  };

  return NextResponse.json({ incidents: list, stats });
}
