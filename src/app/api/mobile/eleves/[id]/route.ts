import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifyMobileToken, mobileUnauthorized } from "@/lib/mobile-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyMobileToken(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { id } = await params;

  // Fetch eleve with relations
  const { data: eleve, error } = await supabase
    .from("eleves")
    .select(`
      id,
      matricule,
      nom,
      prenom,
      dateNaissance,
      lieuNaissance,
      nationalite,
      sexe,
      photoUrl,
      statut,
      regime,
      groupeSanguin,
      allergies,
      contactUrgenceNom,
      contactUrgencePhone,
      classe:classeId ( id, nom, niveau )
    `)
    .eq("id", id)
    .eq("tenantId", user.tenantId)
    .single();

  if (error || !eleve) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  // Fetch parents
  const { data: parents } = await supabase
    .from("eleve_parents")
    .select(`
      lien,
      isGardien,
      parent:parentId ( id, nom, prenom, phone, phone2, email, profession )
    `)
    .eq("eleveId", id);

  // Fetch recent notes
  const { data: notes } = await supabase
    .from("notes")
    .select(`
      id,
      valeur,
      noteMax,
      coefficient,
      date,
      intitule,
      matiere:matiereId ( nom, code, couleur, coefficient )
    `)
    .eq("eleveId", id)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(20);

  // Fetch recent absences
  const { data: absences } = await supabase
    .from("absences")
    .select("id, date, isRetard, statut, motif")
    .eq("eleveId", id)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(10);

  // Fetch recent incidents
  const { data: incidents } = await supabase
    .from("incidents")
    .select("id, type, statut, gravite, description, date")
    .eq("eleveId", id)
    .eq("tenantId", user.tenantId)
    .order("date", { ascending: false })
    .limit(5);

  return NextResponse.json({
    eleve: {
      ...eleve,
      parents: parents ?? [],
      notes: notes ?? [],
      absences: absences ?? [],
      incidents: incidents ?? [],
    },
  });
}
