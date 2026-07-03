import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "analytics:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  // Données agrégées en parallèle
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
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } }),

    // Élèves par classe
    prisma.classe.findMany({
      where: { tenantId },
      select: {
        nom: true, niveau: true,
        _count: { select: { eleves: { where: { statut: "ACTIF" } } } },
      },
    }),

    // Toutes les notes publiées pour calcul de moyennes
    prisma.note.findMany({
      where: { tenantId, isPubliee: true },
      select: {
        valeur: true, noteMax: true, coefficient: true,
        eleve: { select: { id: true, nom: true, prenom: true, classeId: true } },
        matiere: { select: { nom: true } },
        classe: { select: { nom: true, niveau: true } },
        createdAt: true,
      },
    }),

    // Absences des 30 derniers jours
    prisma.absence.groupBy({
      by: ["statut", "date"],
      where: {
        tenantId,
        date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _count: { id: true },
      orderBy: { date: "asc" },
    }),

    // Bulletins publiés
    prisma.bulletin.findMany({
      where: { tenantId, isPublie: true },
      select: {
        moyenneGenerale: true, rang: true, decision: true,
        eleve: { select: { id: true, nom: true, prenom: true, classeId: true } },
        periode: { select: { nom: true, numero: true } },
      },
    }),

    // Incidents par mois (6 derniers mois)
    prisma.incident.groupBy({
      by: ["type", "statut"],
      where: {
        tenantId,
        date: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      },
      _count: { id: true },
    }),

    // Examens
    prisma.examen.findMany({
      where: { tenantId },
      select: { intitule: true, statut: true, dateDebut: true },
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

  const absencesParEleve: Record<string, number> = {};
  const allAbsences = await prisma.absence.groupBy({
    by: ["eleveId", "statut"],
    where: { tenantId, statut: "INJUSTIFIEE" },
    _count: { id: true },
  });
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

  // Gender distribution
  const [garcons, filles] = await Promise.all([
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF", sexe: "M" } }),
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF", sexe: "F" } }),
  ]);

  // Revenue (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const paiements = await prisma.paiement.findMany({
    where: { facture: { tenantId }, date: { gte: sixMonthsAgo } },
    select: { montant: true, devise: true, date: true },
  });
  const revenueByMonth: Record<string, number> = {};
  for (const p of paiements) {
    const monthKey = new Date(p.date).toLocaleDateString("fr-FR", { month: "short" });
    revenueByMonth[monthKey] = (revenueByMonth[monthKey] ?? 0) + p.montant;
  }
  const revenueData = Object.entries(revenueByMonth).map(([month, montant]) => ({ month, montant }));

  // Absence rate by class
  const absencesByClasse: Record<string, number> = {};
  const allAbsencesWithEleve = await prisma.absence.findMany({
    where: { tenantId },
    select: { eleve: { select: { classeId: true, classe: { select: { nom: true } } } } },
  });
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
  });
}
