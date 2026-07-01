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

  // Counts
  const [
    { count: totalEleves },
    { count: totalClasses },
    { count: totalEnseignants },
    { count: totalNotes },
    { count: totalAbsences },
    { count: totalIncidents },
  ] = await Promise.all([
    supabase.from("eleves").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("statut", "ACTIF"),
    supabase.from("classes").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("enseignants").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("absences").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("incidents").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
  ]);

  // Eleves par classe
  const { data: elevesParClasseRaw } = await supabase
    .from("classes")
    .select("id, nom, niveau")
    .eq("tenantId", tenantId)
    .order("nom", { ascending: true });

  const elevesParClasse = await Promise.all(
    (elevesParClasseRaw ?? []).map(async (c) => {
      const { count } = await supabase
        .from("eleves")
        .select("*", { count: "exact", head: true })
        .eq("tenantId", tenantId)
        .eq("classeId", c.id)
        .eq("statut", "ACTIF");
      return { id: c.id, nom: c.nom, niveau: c.niveau, effectif: count ?? 0 };
    })
  );

  // Notes par matière
  const { data: matieresRaw } = await supabase
    .from("matieres")
    .select("id, nom, code, couleur")
    .eq("tenantId", tenantId)
    .order("nom", { ascending: true });

  const notesParMatiere = await Promise.all(
    (matieresRaw ?? []).map(async (m) => {
      const { count } = await supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("tenantId", tenantId)
        .eq("matiereId", m.id);
      return { id: m.id, nom: m.nom, code: m.code, couleur: m.couleur, count: count ?? 0 };
    })
  );

  // Moyennes par classe
  const moyennesParClasse = await Promise.all(
    (elevesParClasse ?? []).map(async (c) => {
      const { data: notes } = await supabase
        .from("notes")
        .select("valeur, noteMax, coefficient")
        .eq("tenantId", tenantId)
        .eq("classeId", c.id);

      const list = notes ?? [];
      const moyenne =
        list.length > 0
          ? list.reduce((acc: number, n: any) => acc + (n.valeur / n.noteMax) * 20 * n.coefficient, 0) /
            list.reduce((acc: number, n: any) => acc + n.coefficient, 0)
          : null;
      return { classeId: c.id, classeNom: c.nom, moyenne };
    })
  );

  return NextResponse.json({
    stats: {
      totalEleves: totalEleves ?? 0,
      totalClasses: totalClasses ?? 0,
      totalEnseignants: totalEnseignants ?? 0,
      totalNotes: totalNotes ?? 0,
      totalAbsences: totalAbsences ?? 0,
      totalIncidents: totalIncidents ?? 0,
    },
    elevesParClasse,
    notesParMatiere,
    moyennesParClasse,
    absencesParMois: totalAbsences ?? 0,
  });
}
