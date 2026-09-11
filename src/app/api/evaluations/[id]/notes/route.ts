import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { applyRlsContext } from "@/lib/prisma-rls";
import { siteFilterForRelation, siteFilterForModel } from "@/lib/site-filter";
import { publishEvents, publishEvent, type NoteRecordedPayload, type EvaluationCompletedPayload } from "@/lib/learnos/events";
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

    // IA-H1 (audit v2) : préserver les identifiants de notes existantes
    // en utilisant upsert au lieu de deleteMany + createMany. Les preuves
    // LEARNOS sont rattachées à note.id ; un nouvel identifiant crée une
    // nouvelle preuve et l'ancienne reste orpheline, faussant les profils.
    const notesWithValeur = updates.filter(n => n.valeur !== null);
    const notesSansValeur = updates.filter(n => n.valeur === null);

    // Supprimer les notes effacées (valeur null) — pas de upsert pour celles-ci.
    const eleveIdsSansValeur = notesSansValeur.map(n => n.eleveId);

    // Exécuter les upserts et suppressions dans une transaction.
    const savedNotes = await prisma.$transaction(async (tx) => {
      // ISO-4 : poser le contexte RLS en première instruction de la transaction.
      await applyRlsContext(tx);
      // Supprimer les notes effacées (valeur null) dans la transaction.
      if (eleveIdsSansValeur.length > 0) {
        // eslint-disable-next-line ecolpro/require-tenant-id -- tenantId dans le where
        await tx.note.deleteMany({
          where: {
            evaluationId,
            tenantId: tenantIdStr,
            eleveId: { in: eleveIdsSansValeur },
          },
        });
      }

      // Upsert chaque note via la transaction.
      const results = [];
      for (const n of notesWithValeur) {
        const saved = await tx.note.upsert({
          where: {
            evaluationId_eleveId: {
              evaluationId,
              eleveId: n.eleveId,
            },
          },
          create: {
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
          },
          update: {
            valeur: n.valeur as number,
            commentaire: n.commentaire ?? "",
            saisieParId: userIdStr,
          },
        });
        results.push(saved);
      }
      return results;
    });

    // Mettre à jour le statut de l'évaluation si nécessaire
    const evaluationTerminee = notesWithValeur.length > 0 && evaluation.statut === "PLANIFIE";
    if (evaluationTerminee) {
      await prisma.evaluation.update({
        where: { id: evaluationId },
        data: { statut: "TERMINE" }
      });
    }

    // Observation LEARNOS. Les upserts ont retourné les lignes avec leurs
    // identifiants réels (préservés en cas de correction).
    if (savedNotes.length > 0) {
      await publishEvents(
        savedNotes.map((note) => ({
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

      // Publier l'événement evaluation.completed si l'évaluation vient d'être terminée.
      if (evaluationTerminee) {
        await publishEvent({
          tenantId: tenantIdStr,
          siteId: evaluation.classe?.siteId ?? null,
          eventType: "evaluation.completed" as const,
          aggregateType: "evaluation",
          aggregateId: evaluationId,
          payload: {
            evaluationId,
            classeId: evaluation.classeId,
            matiereId: evaluation.matiereId,
            periodeId: evaluation.periodeId,
            eleveIds: savedNotes.map((n) => n.eleveId),
            nombreNotes: savedNotes.length,
            dateEvaluation: evaluation.date.toISOString(),
            completeeParId: userIdStr,
          } satisfies EvaluationCompletedPayload,
        });
      }
    }

    revalidateTag("dashboard-data");

    return NextResponse.json({ success: true, count: savedNotes.length });
  } catch (error) {
    console.error("[API/evaluations/notes] PUT", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
