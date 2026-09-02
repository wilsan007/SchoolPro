import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation, siteFilterForModel } from "@/lib/site-filter";
import { publishEvents, type NoteRecordedPayload } from "@/lib/learnos/events";
import { revalidateTag } from "next/cache";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// GET : Récupérer la grille de notes (élèves de la classe + leurs notes actuelles pour cette évaluation)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "evaluations:read");
    if (denied) return denied;

    const evaluationId = (await params).id;
    const siteFilter = siteFilterForRelation(session.user, "classe");
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    const evaluation = await prisma.evaluation.findFirst({
      where: { id: evaluationId, tenantId: session.user.tenantId, ...siteFilter, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) },
      include: {
        classe: {
          include: {
            eleves: { where: siteFilterForModel("eleve", session.user), orderBy: { prenom: 'asc' } },
          },
        },
        notes: true,
      }
    });

    if (!evaluation) {
      return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
    }

    // Fusionner les élèves avec leurs notes existantes
    const grille = evaluation.classe.eleves.map(eleve => {
      const existingNote = evaluation.notes.find(n => n.eleveId === eleve.id);
      return {
        eleveId: eleve.id,
        matricule: eleve.matricule,
        nom: eleve.nom,
        prenom: eleve.prenom,
        noteId: existingNote?.id ?? null,
        valeur: existingNote?.valeur ?? null,
        commentaire: existingNote?.commentaire ?? "",
      };
    });

    return NextResponse.json({ evaluation, grille });
  } catch (error) {
    console.error("[API/evaluations/notes] GET", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const UpdateNotesSchema = z.object({
  notes: z.array(
    z.object({
      eleveId: z.string().min(1),
      valeur: z.number().nullable(),
      commentaire: z.string().optional().nullable(),
    })
  )
});

// PUT : Sauvegarder massivement les notes
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "evaluations:write");
    if (denied) return denied;

    const evaluationId = (await params).id;
    const siteFilter2 = siteFilterForRelation(session.user, "classe");
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    const evaluation = await prisma.evaluation.findFirst({
      where: {
        id: evaluationId,
        tenantId: session.user.tenantId,
        ...siteFilter2,
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      // Le site de la classe situe les événements LEARNOS émis plus bas.
      include: { classe: { select: { siteId: true } } },
    });

    if (!evaluation) {
      return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
    }

    // ── Verrouillage des bulletins : si un bulletin VERROUILLE ou PUBLIE
    //    existe pour la période de cette évaluation, la saisie de notes
    //    est bloquée. Seul un TENANT_ADMIN / SUPER_ADMIN peut outrepasser.
    if (evaluation.periodeId) {
      const estAdmin = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";
      if (!estAdmin) {
        const bulletinVerrouille = await prisma.bulletin.findFirst({
          where: {
            tenantId: session.user.tenantId,
            ...siteFilterForModel("bulletin", session.user),
            periodeId: evaluation.periodeId,
            statut: { in: ["VERROUILLE", "PUBLIE"] },
            ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}),
          },
          select: { id: true, periode: { select: { nom: true } } },
        });
        if (bulletinVerrouille) {
          return NextResponse.json(
            {
              error: `Les bulletins de « ${bulletinVerrouille.periode.nom} » sont verrouillés. La saisie de notes n'est plus possible. Contactez un administrateur pour déverrouiller.`,
            },
            { status: 403 }
          );
        }
      }
    }

    const body = await req.json();
    const parsed = UpdateNotesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error }, { status: 400 });
    }

    const updates = parsed.data.notes;

    const tenantIdStr = session.user.tenantId as string;
    const userIdStr = session.user.id as string;

    const notesToCreate = updates
      .filter(n => n.valeur !== null)
      .map(n => ({
        tenantId: tenantIdStr,
        eleveId: n.eleveId,
        classeId: evaluation.classeId,
        matiereId: evaluation.matiereId,
        periodeId: evaluation.periodeId,
        evaluationId: evaluation.id,
        valeur: n.valeur as number,
        noteMax: 20,
        coefficient: evaluation.coefficient,
        type: evaluation.type,
        intitule: evaluation.titre,
        date: evaluation.date,
        commentaire: n.commentaire ?? "",
        saisieParId: userIdStr,
      }));

    await prisma.$transaction([
      prisma.note.deleteMany({ where: { evaluationId, tenantId: tenantIdStr } }),
      prisma.note.createMany({ data: notesToCreate })
    ]);

    // Mettre à jour le statut de l'évaluation si nécessaire
    if (notesToCreate.length > 0 && evaluation.statut === "PLANIFIE") {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { statut: "TERMINE" }
      });
    }

    // Observation LEARNOS. `createMany` ne rend pas les lignes écrites : on les
    // relit pour disposer des identifiants réels, indispensables au rattachement
    // preuve → note. Relecture après la transaction, donc sans l'allonger.
    if (notesToCreate.length > 0) {
      const enregistrees = await prisma.note.findMany({
        where: {
          evaluationId,
          tenantId: tenantIdStr,
          ...siteFilterForModel("note", session.user),
        },
        select: {
          id: true, eleveId: true, classeId: true, matiereId: true, periodeId: true,
          valeur: true, noteMax: true, coefficient: true, type: true, intitule: true,
          date: true, saisieParId: true,
        },
      });

      await publishEvents(
        enregistrees.map((note) => ({
          tenantId: tenantIdStr,
          siteId: evaluation.classe?.siteId ?? null,
          eventType: "note.recorded" as const,
          aggregateType: "note",
          aggregateId: note.id,
          payload: {
            noteId: note.id,
            eleveId: note.eleveId,
            classeId: note.classeId,
            matiereId: note.matiereId,
            periodeId: note.periodeId,
            evaluationId,
            valeur: note.valeur,
            noteMax: note.noteMax,
            coefficient: note.coefficient,
            type: note.type,
            intitule: note.intitule,
            date: note.date.toISOString(),
            saisieParId: note.saisieParId,
          } satisfies NoteRecordedPayload,
        }))
      );
    }

    revalidateTag("dashboard-data");

    return NextResponse.json({ success: true, count: notesToCreate.length });
  } catch (error) {
    console.error("[API/evaluations/notes] PUT", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
