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
  const date = searchParams.get("date");

  let query = supabase
    .from("absences")
    .select(`
      id,
      date,
      isRetard,
      statut,
      motif,
      commentaire,
      eleve:eleveId ( id, nom, prenom, photoUrl, classeId )
    `)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(50);

  if (eleveId) query = query.eq("eleveId", eleveId);
  if (date) query = query.gte("date", date);

  const { data: absences, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = absences ?? [];
  const stats = {
    total: list.length,
    injustifiees: list.filter((a: any) => a.statut === "INJUSTIFIEE").length,
    justifiees: list.filter((a: any) => a.statut === "JUSTIFIEE").length,
    enAttente: list.filter((a: any) => a.statut === "EN_ATTENTE").length,
    retards: list.filter((a: any) => a.isRetard).length,
  };

  return NextResponse.json({ absences: list, stats });
}
