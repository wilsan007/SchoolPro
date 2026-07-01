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
  const matiereId = searchParams.get("matiereId");

  let notesQuery = supabase
    .from("notes")
    .select(`
      id,
      valeur,
      noteMax,
      coefficient,
      date,
      intitule,
      type,
      eleve:eleveId ( id, nom, prenom ),
      matiere:matiereId ( id, nom, code, couleur, coefficient ),
      classe:classeId ( id, nom )
    `)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(50);

  if (eleveId) notesQuery = notesQuery.eq("eleveId", eleveId);
  if (matiereId) notesQuery = notesQuery.eq("matiereId", matiereId);

  const [
    { data: notes, error: notesError },
    { data: matieres, error: matieresError },
    { data: classes, error: classesError },
  ] = await Promise.all([
    notesQuery,
    supabase
      .from("matieres")
      .select("id, nom, code, couleur, coefficient")
      .eq("tenantId", user.tenantId)
      .order("nom", { ascending: true }),
    supabase
      .from("classes")
      .select("id, nom, niveau")
      .eq("tenantId", user.tenantId)
      .order("nom", { ascending: true }),
  ]);

  if (notesError || matieresError || classesError) {
    return NextResponse.json(
      { error: notesError?.message || matieresError?.message || classesError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ notes: notes ?? [], matieres: matieres ?? [], classes: classes ?? [] });
}
