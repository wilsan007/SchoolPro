import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:delete");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;

    const existing = await prisma.emploiTemps.findFirst({
      where: { id, tenantId, ...siteFilterForModel("emploiTemps", session.user) },
    });
    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    await prisma.emploiTemps.delete({ where: { id } });

    revalidatePath("/emploi-du-temps");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/emploi-du-temps/:id DELETE]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;
    const body = await req.json();

    const existing = await prisma.emploiTemps.findFirst({
      where: { id, tenantId, ...siteFilterForModel("emploiTemps", session.user) },
    });
    if (!existing) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

    const newJour = body.jour ?? existing.jour;
    const newHeureDebut = body.heureDebut ?? existing.heureDebut;
    const newHeureFin = body.heureFin ?? existing.heureFin;
    const newSalle = body.salle !== undefined ? body.salle : existing.salle;
    const newEnseignantId = body.enseignantId !== undefined ? (body.enseignantId || null) : existing.enseignantId;

    // Check class overlap (excluding self)
    // Two creneaux with different groups (e.g. "Salle 101 (Groupe A)" vs "Salle 102 (Groupe B)")
    // can share the same time slot — only same-group or no-group overlaps are conflicts.
    const classOverlaps = await prisma.emploiTemps.findMany({
      where: {
        id: { not: id },
        tenantId,
        classeId: existing.classeId,
        jour: newJour,
        OR: [
          { heureDebut: { lte: newHeureDebut }, heureFin: { gt: newHeureDebut } },
          { heureDebut: { lt: newHeureFin }, heureFin: { gte: newHeureFin } },
          { heureDebut: { gte: newHeureDebut }, heureFin: { lte: newHeureFin } },
        ],
        ...siteFilterForModel("emploiTemps", session.user),
      },
    });

    // Parse group from salle label: "Salle 101 (Groupe A)" -> "A"
    function parseGroup(salle: string | null): string | null {
      if (!salle) return null;
      const m = salle.match(/\(Groupe (\w+)\)$/);
      return m ? m[1] : null;
    }

    const newGroup = parseGroup(newSalle);
    for (const other of classOverlaps) {
      const otherGroup = parseGroup(other.salle);
      // Two different groups (A + B) can share the same slot
      if (newGroup && otherGroup && newGroup !== otherGroup) continue;
      // Same group, or one/both have no group = conflict
      return NextResponse.json(
        { error: "Ce créneau chevauche un cours existant pour cette classe. Seuls deux groupes différents (A et B) peuvent partager le même créneau." },
        { status: 409 }
      );
    }

    // Check teacher conflict (if teacher assigned)
    if (newEnseignantId) {
      const teacherConflict = await prisma.emploiTemps.findFirst({
        where: {
          id: { not: id },
          tenantId,
          enseignantId: newEnseignantId,
          jour: newJour,
          OR: [
            { heureDebut: { lte: newHeureDebut }, heureFin: { gt: newHeureDebut } },
            { heureDebut: { lt: newHeureFin }, heureFin: { gte: newHeureFin } },
            { heureDebut: { gte: newHeureDebut }, heureFin: { lte: newHeureFin } },
          ],
          ...siteFilterForModel("emploiTemps", session.user),
        },
      });
      if (teacherConflict) {
        return NextResponse.json({ error: "L'enseignant est déjà assigné à un autre cours à cet horaire" }, { status: 409 });
      }
    }

    // Check room conflict (if room assigned)
    if (newSalle) {
      const roomConflict = await prisma.emploiTemps.findFirst({
        where: {
          id: { not: id },
          tenantId,
          salle: newSalle,
          jour: newJour,
          OR: [
            { heureDebut: { lte: newHeureDebut }, heureFin: { gt: newHeureDebut } },
            { heureDebut: { lt: newHeureFin }, heureFin: { gte: newHeureFin } },
            { heureDebut: { gte: newHeureDebut }, heureFin: { lte: newHeureFin } },
          ],
          ...siteFilterForModel("emploiTemps", session.user),
        },
      });
      if (roomConflict) {
        return NextResponse.json({ error: "La salle est déjà occupée à cet horaire" }, { status: 409 });
      }
    }

    const updated = await prisma.emploiTemps.update({
      where: { id },
      data: {
        ...(body.jour && { jour: body.jour }),
        ...(body.salle !== undefined && { salle: body.salle }),
        ...(body.heureDebut && { heureDebut: body.heureDebut }),
        ...(body.heureFin && { heureFin: body.heureFin }),
        ...(body.enseignantId !== undefined && { enseignantId: body.enseignantId || null }),
      },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
    });

    revalidatePath("/emploi-du-temps");
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/emploi-du-temps/:id PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
