import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import {
  publishEvent,
  type NoteUpdatedPayload,
  type NoteDeletedPayload,
} from "@/lib/learnos/events";
import { revalidateTag } from "next/cache";
import { auditFire } from "@/lib/audit";

// PATCH : modifier une note existante
const UpdateNoteSchema = z.object({
  valeur: z.number().min(0).max(100),
  noteMax: z.number().min(1).max(100).optional(),
  coefficient: z.number().min(0.5).max(10).optional(),
  commentaire: z.string().optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "notes:write");
    if (denied) return denied;

    const noteId = (await params).id;
    const body = await req.json();
    const parsed = UpdateNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Récupérer la note ancienne pour le snapshot et valider le périmètre.
    const noteAncienne = await prisma.note.findFirst({
      where: {
        id: noteId,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("note", session.user),
      },
      select: {
        id: true,
        eleveId: true,
        classeId: true,
        matiereId: true,
        periodeId: true,
        evaluationId: true,
        valeur: true,
        noteMax: true,
        coefficient: true,
        type: true,
        intitule: true,
        date: true,
        classe: { select: { siteId: true } },
      },
    });

    if (!noteAncienne) {
      return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      valeur: parsed.data.valeur,
      saisieParId: session.user.id,
    };
    if (parsed.data.noteMax !== undefined) updateData.noteMax = parsed.data.noteMax;
    if (parsed.data.coefficient !== undefined) updateData.coefficient = parsed.data.coefficient;
    if (parsed.data.commentaire !== undefined) updateData.commentaire = parsed.data.commentaire;

    const noteModifiee = await prisma.note.update({
      where: { id: noteId, tenantId: session.user.tenantId },
      data: updateData,
    });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "note:update",
      verdict: "ALLOWED",
      resource: "note",
      resourceId: noteId,
    });

    // Publier l'événement note.updated pour LEARNOS
    await publishEvent({
      tenantId: session.user.tenantId,
      siteId: noteAncienne.classe?.siteId ?? null,
      eventType: "note.updated",
      aggregateType: "note",
      aggregateId: noteId,
      payload: {
        noteId,
        eleveId: noteAncienne.eleveId,
        classeId: noteAncienne.classeId,
        matiereId: noteAncienne.matiereId,
        periodeId: noteAncienne.periodeId,
        evaluationId: noteAncienne.evaluationId,
        valeurAncienne: noteAncienne.valeur,
        noteMaxAncienne: noteAncienne.noteMax,
        valeur: noteModifiee.valeur,
        noteMax: noteModifiee.noteMax,
        coefficient: noteModifiee.coefficient,
        type: noteAncienne.type,
        intitule: noteAncienne.intitule,
        date: noteAncienne.date.toISOString(),
        modifieeParId: session.user.id,
      } satisfies NoteUpdatedPayload,
    });

    revalidateTag("dashboard-data");

    return NextResponse.json({ success: true, note: noteModifiee });
  } catch (error) {
    console.error("[API/notes/[id] PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE : supprimer une note
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "notes:write");
    if (denied) return denied;

    const noteId = (await params).id;

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("note", session.user),
      },
      select: {
        id: true,
        eleveId: true,
        classeId: true,
        matiereId: true,
        valeur: true,
        noteMax: true,
        coefficient: true,
        type: true,
        intitule: true,
        date: true,
        classe: { select: { siteId: true } },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Note introuvable" }, { status: 404 });
    }

    await prisma.note.delete({ where: { id: noteId, tenantId: session.user.tenantId } });

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "note:delete",
      verdict: "ALLOWED",
      resource: "note",
      resourceId: noteId,
    });

    // Publier l'événement note.deleted pour LEARNOS
    await publishEvent({
      tenantId: session.user.tenantId,
      siteId: note.classe?.siteId ?? null,
      eventType: "note.deleted",
      aggregateType: "note",
      aggregateId: noteId,
      payload: {
        noteId,
        eleveId: note.eleveId,
        classeId: note.classeId,
        matiereId: note.matiereId,
        valeur: note.valeur,
        noteMax: note.noteMax,
        coefficient: note.coefficient,
        type: note.type,
        intitule: note.intitule,
        date: note.date.toISOString(),
        supprimeParId: session.user.id,
      } satisfies NoteDeletedPayload,
    });

    revalidateTag("dashboard-data");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/notes/[id] DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
