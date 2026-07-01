import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const tenantId = user.tenantId;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const classeId = searchParams.get("classeId");

  let query = supabase
    .from("eleves")
    .select(`
      id,
      matricule,
      nom,
      prenom,
      dateNaissance,
      sexe,
      statut,
      photoUrl,
      classe:classeId ( id, nom, niveau )
    `)
    .eq("tenantId", tenantId)
    .order("nom", { ascending: true })
    .limit(100);

  if (classeId) query = query.eq("classeId", classeId);
  if (q) {
    query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,matricule.ilike.%${q}%`);
  }

  const { data: eleves, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ eleves: eleves ?? [] });
}
