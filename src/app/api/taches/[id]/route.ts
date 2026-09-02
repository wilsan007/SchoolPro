import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";
import { checkPermission } from "@/lib/rbac";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

const UpdateSchema = z.object({
  titre: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: z.string().optional(),
  priorite: z.enum(["BASSE", "NORMALE", "HAUTE", "URGENTE"]).optional(),
  statut: z.enum(["A_FAIRE", "EN_COURS", "FAIT", "ANNULE"]).optional(),
  classeId: z.string().optional().nullable(),
  matiereId: z.string().optional().nullable(),
  echeance: z.string().datetime().optional().nullable(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:read");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("tache", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const tache = await prisma.tache.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    include: {
      assigneeA: { select: { name: true, email: true } },
      creePar: { select: { name: true } },
      classe: { select: { nom: true } },
      matiere: { select: { nom: true } },
    },
  });

  if (!tache) {
    return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
  }

  return NextResponse.json(tache);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:write");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("tache", session.user);

  try {
    const json = await request.json();
    const data = UpdateSchema.parse(json);

    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    if (data.classeId && isTeacherRole(session.user.role as Role)) {
      const scope = await getTeacherScope(
        session.user.tenantId,
        session.user.id as string,
        session.user.role as Role,
        anneeCourante
      );
      if (scope.isRestricted && !scope.classeIds.includes(data.classeId)) {
        return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
      }
    }
    if (data.matiereId && isTeacherRole(session.user.role as Role)) {
      const scope = await getTeacherScope(
        session.user.tenantId,
        session.user.id as string,
        session.user.role as Role,
        anneeCourante
      );
      if (scope.isRestricted && !scope.matiereIds.includes(data.matiereId)) {
        return NextResponse.json({ error: "Matière hors de votre périmètre" }, { status: 403 });
      }
    }

    const existing = await prisma.tache.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilter,
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
    }

    // Détecter le changement de statut vers FAIT.
    const becameFait =
      data.statut === "FAIT" && existing.statut !== "FAIT";

    // Détecter le changement vers EN_COURS (pas de notification).
    // const becameEnCours =
    //   data.statut === "EN_COURS" && existing.statut !== "EN_COURS";

    const tache = await prisma.tache.update({
      where: { id },
      data: {
        ...(data.titre !== undefined && { titre: data.titre }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.priorite !== undefined && { priorite: data.priorite }),
        ...(data.statut !== undefined && { statut: data.statut }),
        ...(data.classeId !== undefined && { classeId: data.classeId }),
        ...(data.matiereId !== undefined && { matiereId: data.matiereId }),
        ...(data.echeance !== undefined && {
          echeance: data.echeance ? new Date(data.echeance) : null,
        }),
        // Quand le statut passe à FAIT, enregistrer la date d'accomplissement.
        ...(becameFait && { dateFaite: new Date() }),
      },
      include: {
        assigneeA: { select: { name: true, email: true } },
        creePar: { select: { name: true } },
      },
    });

    // Notifier le créateur quand la tâche est marquée comme FAITE.
    // Les notifications ne doivent pas bloquer l'action principale.
    if (becameFait && existing.creeParId) {
      try {
        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre: "Tâche terminée",
            contenu: `La tâche « ${existing.titre} » a été marquée comme terminée par ${session.user.name ?? "un utilisateur"}.`,
            canal: "IN_APP",
            cible: "TOUS",
            envoyeParId: session.user.id,
            nbDestinataires: 1,
            nbDelivres: 1,
            statut: "ENVOYEE",
            envoyeeAt: new Date(),
          },
        });
      } catch (notifErr) {
        console.error("[Taches PATCH] Notification créateur échouée:", notifErr);
      }
    }

    return NextResponse.json(tache);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Taches PATCH] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:delete");
  if (denied) return denied;

  const { id } = await params;
  const siteFilter = siteFilterForModel("tache", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  const existing = await prisma.tache.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Tâche introuvable" }, { status: 404 });
  }

  await prisma.tache.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
