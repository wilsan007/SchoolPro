import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

// Cache navigateur 60s : les données analytics changent peu d'une minute à l'autre.
const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "analytics:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const maintenant = await getDemoNow();

  const anneeId = await anneeActiveId(tenantId);

  // Filtres réutilisés
  const eleveFilter = siteFilterForModel("eleve", session.user);
  const classeFilter = siteFilterForModel("classe", session.user);
  const examenFilter = siteFilterForModel("examen", session.user);
  const absenceFilter = siteFilterForModel("absence", session.user);

  // Bornes temporelles
  const trenteJoursAgo = new Date(maintenant);
  trenteJoursAgo.setDate(trenteJoursAgo.getDate() - 30);
  const sixMoisAgo = new Date(maintenant);
  sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6);

  // Batch 1 (7 requêtes en parallèle — reste sous la limite du pool Supabase)
  const [
    totalEleves,
    elevesParClasse,
    notesPubliees,
    absencesData,
    bulletinsData,
    incidents,
    examens,
  ] = await Promise.all([
    // Total élèves actifs
    prisma.eleve.count({ where: { tenantId, ...eleveFilter, statut: "ACTIF" } }),

    // Élèves par classe
    prisma.classe.findMany({
      where: { tenantId, ...classeFilter },
      select: {
        nom: true, niveau: true,
        _count: { select: { eleves: { where: { statut: "ACTIF" } } } },
      },
    }),

    // Toutes les notes publiées pour calcul de moyennes
    prisma.note.findMany({
      where: { tenantId, ...siteFilterForModel("note", session.user), isPubliee: true },
      select: {
        valeur: true, noteMax: true, coefficient: true,
        eleve: { select: { id: true, nom: true, prenom: true, classeId: true } },
        matiere: { select: { nom: true } },
        classe: { select: { nom: true, niveau: true } },
        createdAt: true,
      },
    }),

    // Absences des 30 derniers jours (pour graphique)
    prisma.absence.groupBy({
      by: ["statut", "date"],
      where: { tenantId, ...absenceFilter,
        date: { gte: trenteJoursAgo },
      },
      _count: { id: true },
      orderBy: { date: "asc" },
    }),

    // Bulletins publiés
    prisma.bulletin.findMany({
      where: { tenantId, ...siteFilterForModel("bulletin", session.user), isPublie: true },
      select: {
        moyenneGenerale: true, rang: true, decision: true,
        eleve: { select: { id: true, nom: true, prenom: true, classeId: true } },
        periode: { select: { nom: true, numero: true } },
      },
    }),

    // Incidents par mois (6 derniers mois)
    prisma.incident.groupBy({
      by: ["type", "statut"],
      where: { tenantId, ...siteFilterForModel("incident", session.user),
        date: { gte: sixMoisAgo },
      },
      _count: { id: true },
    }),

    // Examens
    prisma.examen.findMany({
      where: { tenantId, ...examenFilter },
      select: { intitule: true, statut: true, dateDebut: true },
    }),
  ]);

  // Batch 2 (4 requêtes en parallèle — les anciennes requêtes séquentielles)
  const [allAbsences, elevesParSexe, paiements, allAbsencesWithEleve] = await Promise.all([
    // Absences injustifiées par élève (pour prédiction décrochage)
    prisma.absence.groupBy({
      by: ["eleveId", "statut"],
      where: { tenantId, ...absenceFilter, statut: "INJUSTIFIEE" },
      _count: { id: true },
    }),
    // Répartition par sexe
    prisma.eleve.groupBy({
      by: ["sexe"],
      where: { tenantId, ...eleveFilter, statut: "ACTIF" },
      _count: true,
    }),
    // Revenus (6 derniers mois)
    prisma.paiement.findMany({
      where: { ...siteFilterForModel("paiement", session.user), facture: { tenantId, ...(anneeId ? { anneeId } : {}) }, date: { gte: sixMoisAgo } },
      select: { montant: true, devise: true, date: true },
    }),
    // Absences par classe — filtrées sur l'année active pour éviter de scanner toute la table
    prisma.absence.findMany({
      where: { tenantId, ...absenceFilter, date: { gte: sixMoisAgo } },
      select: { eleve: { select: { classeId: true, classe: { select: { nom: true } } } } },
    }),
  ]);

  // ─── Calcul des moyennes par élève ───────────────────────────────────────────

  const moyennesParEleve: Record<string, { notes: { valeur: number; noteMax: number; coefficient: number }[]; nom: string; prenom: string; classeId: string | null }> = {};

  for (const note of notesPubliees) {
    const id = note.eleve.id;
    if (!moyennesParEleve[id]) {
      moyennesParEleve[id] = {
        notes: [],
        nom: note.eleve.nom,
        prenom: note.eleve.prenom,
        classeId: note.eleve.classeId,
      };
    }
    moyennesParEleve[id].notes.push({
      valeur: note.valeur,
      noteMax: note.noteMax,
      coefficient: note.coefficient,
    });
  }

  const moyennesEleves = Object.entries(moyennesParEleve).map(([id, d]) => {
    const totalCoeff = d.notes.reduce((s, n) => s + n.coefficient, 0);
    const totalPondere = d.notes.reduce((s, n) => {
      return s + (n.valeur / n.noteMax) * 20 * n.coefficient;
    }, 0);
    const moyenne = totalCoeff > 0 ? Math.round((totalPondere / totalCoeff) * 100) / 100 : null;
    return { id, nom: d.nom, prenom: d.prenom, classeId: d.classeId, moyenne };
  }).filter((e) => e.moyenne !== null).sort((a, b) => (b.moyenne ?? 0) - (a.moyenne ?? 0));

  // ─── Taux de réussite (moyenne >= 10) ────────────────────────────────────────

  const enReussite = moyennesEleves.filter((e) => (e.moyenne ?? 0) >= 10).length;
  const tauxReussite = moyennesEleves.length > 0
    ? Math.round((enReussite / moyennesEleves.length) * 100)
    : 0;

  // ─── Top 5 et bottom 5 élèves ────────────────────────────────────────────────

  const top5 = moyennesEleves.slice(0, 5);
  const bottom5 = moyennesEleves.slice(-5).reverse();

  // ─── Prédiction décrochage (heuristique) ─────────────────────────────────────
  // Critères : moyenne < 8 OU absences injustifiées > 5
  // allAbsences est déjà récupéré dans le batch 2 ci-dessus.

  const absencesParEleve: Record<string, number> = {};
  for (const a of allAbsences) {
    absencesParEleve[a.eleveId] = (absencesParEleve[a.eleveId] ?? 0) + a._count.id;
  }

  const elevesArisque = moyennesEleves
    .filter((e) => (e.moyenne ?? 20) < 8 || (absencesParEleve[e.id] ?? 0) > 5)
    .map((e) => ({
      ...e,
      absencesInjust: absencesParEleve[e.id] ?? 0,
      risque: (e.moyenne ?? 20) < 6 ? "ELEVE" : "MOYEN",
    }))
    .sort((a, b) => (a.moyenne ?? 0) - (b.moyenne ?? 0))
    .slice(0, 10);

  // ─── Absences par jour (30 derniers jours) ────────────────────────────────────

  const absencesParJour: Record<string, { injust: number; just: number; attente: number }> = {};
  for (const a of absencesData) {
    const jour = new Date(a.date).toISOString().slice(0, 10);
    if (!absencesParJour[jour]) absencesParJour[jour] = { injust: 0, just: 0, attente: 0 };
    if (a.statut === "INJUSTIFIEE") absencesParJour[jour].injust += a._count.id;
    else if (a.statut === "JUSTIFIEE") absencesParJour[jour].just += a._count.id;
    else absencesParJour[jour].attente += a._count.id;
  }

  const absencesChartData = Object.entries(absencesParJour)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ─── Moyenne par matière ──────────────────────────────────────────────────────

  const moyennesParMatiere: Record<string, { valeurs: number[]; noteMax: number }> = {};
  for (const note of notesPubliees) {
    const m = note.matiere.nom;
    if (!moyennesParMatiere[m]) moyennesParMatiere[m] = { valeurs: [], noteMax: note.noteMax };
    moyennesParMatiere[m].valeurs.push((note.valeur / note.noteMax) * 20);
  }
  const matieresData = Object.entries(moyennesParMatiere).map(([matiere, d]) => ({
    matiere,
    moyenne: Math.round(d.valeurs.reduce((s, v) => s + v, 0) / d.valeurs.length * 100) / 100,
    nbNotes: d.valeurs.length,
  })).sort((a, b) => b.moyenne - a.moyenne);

  // ─── Moyenne par matière par classe ───────────────────────────────────────────

  const moyennesParMatiereParClasse: Record<string, Record<string, number[]>> = {};
  for (const note of notesPubliees) {
    const cn = note.classe?.nom ?? "N/A";
    const m = note.matiere.nom;
    if (!moyennesParMatiereParClasse[cn]) moyennesParMatiereParClasse[cn] = {};
    if (!moyennesParMatiereParClasse[cn][m]) moyennesParMatiereParClasse[cn][m] = [];
    moyennesParMatiereParClasse[cn][m].push((note.valeur / note.noteMax) * 20);
  }
  const matieresParClasse = Object.entries(moyennesParMatiereParClasse).map(([classe, matieres]) => ({
    classe,
    niveau: notesPubliees.find((n) => n.classe?.nom === classe)?.classe?.niveau ?? "",
    matieres: Object.entries(matieres).map(([matiere, vals]) => ({
      matiere,
      moyenne: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
      nbNotes: vals.length,
    })).sort((a, b) => b.moyenne - a.moyenne),
  })).sort((a, b) => a.classe.localeCompare(b.classe));

  // ─── Réponse ──────────────────────────────────────────────────────────────────
  // elevesParSexe, paiements et allAbsencesWithEleve sont déjà récupérés dans le batch 2.

  const garcons = elevesParSexe.find((g) => g.sexe === "M")?._count ?? 0;
  const filles = elevesParSexe.find((g) => g.sexe === "F")?._count ?? 0;

  // Revenue par mois (6 derniers mois)
  const revenueByMonth: Record<string, number> = {};
  for (const p of paiements) {
    const monthKey = new Date(p.date).toLocaleDateString("fr-FR", { month: "short" });
    revenueByMonth[monthKey] = (revenueByMonth[monthKey] ?? 0) + p.montant;
  }
  const revenueData = Object.entries(revenueByMonth).map(([month, montant]) => ({ month, montant }));

  // Absence rate by class (données déjà récupérées dans le batch 2, filtrées sur 6 mois)
  const absencesByClasse: Record<string, number> = {};
  for (const a of allAbsencesWithEleve) {
    const cn = a.eleve.classe?.nom ?? "Sans classe";
    absencesByClasse[cn] = (absencesByClasse[cn] ?? 0) + 1;
  }
  const absenceParClasse = Object.entries(absencesByClasse).map(([classe, count]) => ({ classe, count }));

  // Moyennes par classe (for radar chart)
  const moyennesParClasse: Record<string, number[]> = {};
  for (const note of notesPubliees) {
    const cn = note.classe?.nom ?? "N/A";
    if (!moyennesParClasse[cn]) moyennesParClasse[cn] = [];
    moyennesParClasse[cn].push((note.valeur / note.noteMax) * 20);
  }
  const classeRadarData = Object.entries(moyennesParClasse).map(([classe, vals]) => ({
    classe,
    moyenne: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
  }));

  return NextResponse.json({
    synthese: {
      totalEleves,
      tauxReussite,
      enReussite,
      elevesAEvaluer: moyennesEleves.length,
      incidentsOuverts: incidents.filter((i) => i.statut === "OUVERT").reduce((s, i) => s + i._count.id, 0),
      examensEnCours: examens.filter((e) => e.statut === "EN_COURS").length,
    },
    top5,
    bottom5,
    elevesArisque,
    absencesChartData,
    matieresData,
    matieresParClasse,
    elevesParClasse: elevesParClasse.map((c) => ({
      classe: c.nom,
      niveau: c.niveau,
      effectif: c._count.eleves,
    })),
    bulletinsStats: {
      total: bulletinsData.length,
      reussite: bulletinsData.filter((b) => (b.moyenneGenerale ?? 0) >= 10).length,
      passage: bulletinsData.filter((b) => b.decision === "Passage").length,
    },
    genderDist: { garcons, filles },
    revenueData,
    absenceParClasse,
    classeRadarData,
  }, { headers: CACHE_HEADERS });
}
