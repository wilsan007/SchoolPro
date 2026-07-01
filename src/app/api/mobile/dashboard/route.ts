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

  // Stats counts
  const [{ count: totalEleves }, { count: totalClasses }, { count: totalNotes }] = await Promise.all([
    supabase.from("eleves").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("statut", "ACTIF"),
    supabase.from("classes").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
  ]);

  // Absences today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: totalAbsencesToday } = await supabase
    .from("absences")
    .select("*", { count: "exact", head: true })
    .eq("tenantId", tenantId)
    .gte("date", today.toISOString());

  // Recent absences with eleve
  const { data: absencesRecentes } = await supabase
    .from("absences")
    .select(`
      id,
      date,
      isRetard,
      statut,
      motif,
      eleve:eleveId ( id, nom, prenom, photoUrl )
    `)
    .eq("tenantId", tenantId)
    .order("date", { ascending: false })
    .limit(5);

  // Recent notes with eleve and matiere
  const { data: notesRecentes } = await supabase
    .from("notes")
    .select(`
      id,
      valeur,
      noteMax,
      date,
      intitule,
      eleve:eleveId ( id, nom, prenom ),
      matiere:matiereId ( nom, code )
    `)
    .eq("tenantId", tenantId)
    .order("date", { ascending: false })
    .limit(5);

  // Upcoming evaluations
  const { data: prochainsExamens } = await supabase
    .from("evaluations")
    .select(`
      id,
      titre,
      date,
      classe:classeId ( nom ),
      matiere:matiereId ( nom )
    `)
    .eq("tenantId", tenantId)
    .eq("statut", "PLANIFIE")
    .order("date", { ascending: true })
    .limit(5);

  return NextResponse.json({
    stats: {
      totalEleves: totalEleves ?? 0,
      totalClasses: totalClasses ?? 0,
      totalAbsencesToday: totalAbsencesToday ?? 0,
      totalNotes: totalNotes ?? 0,
    },
    absencesRecentes: absencesRecentes ?? [],
    notesRecentes: notesRecentes ?? [],
    prochainsExamens: prochainsExamens ?? [],
  });
}
