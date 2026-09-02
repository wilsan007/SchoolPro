import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import prisma from "@/lib/prisma";
import { siteFilterForModel, siteFilterForRelation } from "@/lib/site-scope";
import { proposerCommentaires } from "@/lib/learnos/commentaires-bulletin";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * POST /api/learnos/commentaires-bulletin
 * Body: { eleveId, periodeId, matiereId }
 *
 * Propose des commentaires de bulletin par IA.
 * L'IA propose, l'enseignant valide — rien n'est persisté ici.
 *
 * ACCÈS : TEACHER, CLASS_TEACHER, SUBJECT_LEAD, TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "bulletins:write");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const body = await req.json().catch(() => ({}));
  const { eleveId, periodeId, matiereId } = body;

  if (!eleveId || !periodeId || !matiereId) {
    return NextResponse.json(
      { error: "eleveId, periodeId et matiereId sont requis" },
      { status: 400 }
    );
  }

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const filtreAnneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  const filtreAnneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};

  // Charger les données agrégées de l'élève.
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, deletedAt: null, ...siteFilterForModel("eleve", session.user) },
    select: {
      id: true,
      classe: { select: { id: true, niveau: true, nom: true } },
    },
  });
  if (!eleve) return erreurJson("ELEVE_INTROUVABLE");

  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", session.user) },
    select: { id: true, nom: true },
  });
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  // Notes de l'élève dans cette matière pour cette période.
  const notes = await prisma.note.findMany({
    where: {
      tenantId,
      eleveId,
      matiereId,
      periodeId,
      ...siteFilterForRelation(session.user, "classe"),
      ...filtreAnneeClasse,
    },
    select: { valeur: true, noteMax: true, date: true },
    orderBy: { date: "asc" },
  });

  // Moyenne classe dans la matière pour cette période.
  const notesClasse = await prisma.note.findMany({
    where: {
      tenantId,
      matiereId,
      periodeId,
      classeId: eleve.classe?.id,
      ...siteFilterForRelation(session.user, "classe"),
      ...filtreAnneeClasse,
    },
    select: { valeur: true, noteMax: true, eleveId: true },
  });

  // Moyenne de l'élève.
  const moyenneEleve = notes.length > 0
    ? (notes.reduce((s, n) => s + (n.valeur / n.noteMax) * 20, 0) / notes.length)
    : null;

  // Moyenne de la classe.
  const parEleve = new Map<string, number[]>();
  for (const n of notesClasse) {
    const arr = parEleve.get(n.eleveId) ?? [];
    arr.push((n.valeur / n.noteMax) * 20);
    parEleve.set(n.eleveId, arr);
  }
  const moyennesClasse = [...parEleve.values()].map(
    (arr) => arr.reduce((s, v) => s + v, 0) / arr.length
  );
  const moyenneClasse = moyennesClasse.length > 0
    ? moyennesClasse.reduce((s, m) => s + m, 0) / moyennesClasse.length
    : null;

  // Rang de l'élève.
  let rang = null;
  if (moyenneEleve !== null) {
    const mieux = moyennesClasse.filter((m) => m > moyenneEleve).length;
    rang = mieux + 1;
  }

  // Moyenne générale.
  const toutesNotes = await prisma.note.findMany({
    where: { tenantId, eleveId, periodeId, ...siteFilterForRelation(session.user, "classe"), ...filtreAnneeClasse },
    select: { valeur: true, noteMax: true },
  });
  const moyenneGenerale = toutesNotes.length > 0
    ? (toutesNotes.reduce((s, n) => s + (n.valeur / n.noteMax) * 20, 0) / toutesNotes.length)
    : null;

  // Heures d'absence.
  const absences = await prisma.absence.count({
    where: {
      tenantId,
      eleveId,
      ...siteFilterForModel("absence", session.user),
      ...filtreAnneeEleve,
    },
  });

  // Tendance : comparer moyenne actuelle vs période précédente.
  const periode = await prisma.periode.findFirst({
    where: { id: periodeId, annee: { tenantId } },
    select: { id: true, numero: true, anneeId: true },
  });

  const periodePrecedente = periode
    ? await prisma.periode.findFirst({
        where: {
          anneeId: periode.anneeId,
          numero: periode.numero - 1,
        },
        select: { id: true },
      })
    : null;

  let tendance: "HAUSSE" | "BAISSE" | "STABLE" | "INCONNU" = "INCONNU";
  if (periodePrecedente) {
    const notesPrec = await prisma.note.findMany({
      where: {
        tenantId,
        eleveId,
        matiereId,
        periodeId: periodePrecedente.id,
        ...siteFilterForRelation(session.user, "classe"),
        ...filtreAnneeClasse,
      },
      select: { valeur: true, noteMax: true },
    });
    if (notesPrec.length > 0 && moyenneEleve !== null) {
      const moyennePrec = notesPrec.reduce((s, n) => s + (n.valeur / n.noteMax) * 20, 0) / notesPrec.length;
      const diff = moyenneEleve - moyennePrec;
      if (diff > 0.5) tendance = "HAUSSE";
      else if (diff < -0.5) tendance = "BAISSE";
      else tendance = "STABLE";
    }
  }

  try {
    const commentaires = await proposerCommentaires(
      tenantId,
      session.user,
      {
        moyenneMatiere: moyenneEleve !== null ? Math.round(moyenneEleve * 100) / 100 : null,
        moyenneClasse: moyenneClasse !== null ? Math.round(moyenneClasse * 100) / 100 : null,
        rangMatiere: rang,
        effectif: parEleve.size,
        moyenneGenerale: moyenneGenerale !== null ? Math.round(moyenneGenerale * 100) / 100 : null,
        heuresAbsence: absences,
        matiereNom: matiere.nom,
        niveauScolaire: eleve.classe?.niveau ?? "non spécifié",
        tendance,
        nombreNotes: notes.length,
      },
      session.user.id
    );
    return NextResponse.json(commentaires);
  } catch (error) {
    console.error("[api/commentaires-bulletin]", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération des commentaires" },
      { status: 500 }
    );
  }
}
