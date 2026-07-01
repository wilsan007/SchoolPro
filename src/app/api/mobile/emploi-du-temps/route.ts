import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("emplois_temps")
    .select(`
      id,
      jour,
      heureDebut,
      heureFin,
      salle,
      classe:classeId ( id, nom ),
      matiere:matiereId ( id, nom, code, couleur ),
      enseignant:enseignantId ( id, user:userId ( name ) )
    `)
    .eq("tenantId", user.tenantId)
    .order("jour", { ascending: true })
    .order("heureDebut", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emploi: data ?? [] });
}
