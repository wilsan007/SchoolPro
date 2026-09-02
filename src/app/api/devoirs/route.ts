import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  siteIdForCreate,
  isRelationScopedRole,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

const CreateDevoirSchema = z.object({
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  titre: z.string().min(1).max(200),
  description: z.string().optional(),
  dateRendu: z.coerce.date(),
  type: z.enum(["EXERCICE", "LECTURE", "REVISION", "PROJET", "AUTRE"]).default("AUTRE"),
});

const PatchDevoirSchema = z.object({
  id: z.string().min(1),
  statut: z.enum(["A_FAIRE", "EN_COURS", "RENDU", "CORRIGE"]),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "cours:read");
  if (denied) return denied;

  // Les familles accèdent aux devoirs via la page `/travail` qui applique
  // `eleveScopeFilter` côté serveur ; cette route API est un outil du
  // personnel.
  if (isRelationScopedRole(session.user.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");

  const claims = session.user as Parameters<typeof siteFilterForModel>[1];

  // Filtrer par année scolaire courante via la relation classe.
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Date simulée par la Time Machine : ne pas retourner les devoirs dont
  // la date de rendu est dans le futur (relativement à la date simulée).
  const maintenant = await getDemoNow();

  const devoirs = await prisma.devoir.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("devoir", claims),
      ...(classeId && { classeId }),
      ...(anneeCourante && { classe: { annee: anneeCourante } }),
      dateRendu: { lte: maintenant },
    },
    include: {
      classe: { select: { nom: true } },
      matiere: { select: { nom: true, couleur: true } },
    },
    orderBy: { dateRendu: "desc" },
  });

  return NextResponse.json({ devoirs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "notes:write");
  if (denied) return denied;

  const body = await req.json();
  const parsed = CreateDevoirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Enseignant : restreindre la création à ses classes et matières.
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  if (isTeacherRole(session.user.role as Role)) {
    const teacherScope = await getTeacherScope(
      session.user.tenantId,
      session.user.id as string,
      session.user.role as Role,
      anneeCourante
    );
    if (teacherScope.isRestricted && !teacherScope.classeIds.includes(data.classeId)) {
      return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
    }
    if (teacherScope.isRestricted && !teacherScope.matiereIds.includes(data.matiereId)) {
      return NextResponse.json({ error: "Matière hors de votre périmètre" }, { status: 403 });
    }
  }

  const siteId = siteIdForCreate(session.user as { siteId?: string | null });

  // Résoudre l'enseignant connecté (nullable pour la direction).
  let enseignantId: string | undefined;
  if (
    session.user.role === "TEACHER" ||
    session.user.role === "CLASS_TEACHER"
  ) {
    const ens = await prisma.enseignant.findFirst({
      where: { userId: session.user.id, tenantId: session.user.tenantId, ...siteFilterForModel("enseignant", session.user) },
      select: { id: true },
    });
    enseignantId = ens?.id;
  }

  const devoir = await prisma.devoir.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: siteId ?? null,
      classeId: data.classeId,
      matiereId: data.matiereId,
      enseignantId: enseignantId ?? null,
      titre: data.titre,
      description: data.description ?? null,
      dateRendu: data.dateRendu,
      statut: "A_FAIRE",
      type: data.type,
    },
    include: {
      classe: { select: { nom: true } },
      matiere: { select: { nom: true, couleur: true } },
    },
  });

  try {
    const nbEleves = await prisma.eleve.count({
      where: { classeId: data.classeId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
    });

    const dateRenduStr = devoir.dateRendu.toLocaleDateString("fr-FR");
    const contenuNotif = `Matière: ${devoir.matiere.nom}\nClasse: ${devoir.classe.nom}\nÀ rendre le: ${dateRenduStr}${devoir.description ? `\n\nConsignes: ${devoir.description}` : ""}`;

    await prisma.notification.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId ?? null,
        titre: `Nouveau devoir: ${devoir.titre}`,
        contenu: contenuNotif,
        canal: "IN_APP",
        statut: "ENVOYEE",
        cible: "CLASSE",
        classeId: data.classeId,
        envoyeParId: session.user.id,
        nbDestinataires: nbEleves,
        nbDelivres: nbEleves,
        envoyeeAt: new Date(),
      },
    });
  } catch (notifError) {
    console.error("[API/devoirs] Notification échouée:", notifError);
  }

  return NextResponse.json(
    {
      devoir: {
        id: devoir.id,
        titre: devoir.titre,
        description: devoir.description,
        dateRendu: devoir.dateRendu.toISOString(),
        statut: devoir.statut,
        type: devoir.type,
        classe: { nom: devoir.classe.nom },
        matiere: { nom: devoir.matiere.nom, couleur: devoir.matiere.couleur },
      },
    },
    { status: 201 }
  );
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "notes:write");
  if (denied) return denied;

  const body = await req.json();
  const parsed = PatchDevoirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { id, statut } = parsed.data;

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const existing = await prisma.devoir.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    select: { id: true, statut: true, classeId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Devoir introuvable" }, { status: 404 });
  }

  // Enseignant : s'assurer que le devoir appartient à l'une de ses classes.
  if (isTeacherRole(session.user.role as Role)) {
    const teacherScope = await getTeacherScope(
      session.user.tenantId,
      session.user.id as string,
      session.user.role as Role
    );
    if (teacherScope.isRestricted && !teacherScope.classeIds.includes(existing.classeId)) {
      return NextResponse.json({ error: "Devoir hors de votre périmètre" }, { status: 403 });
    }
  }

  const updated = await prisma.devoir.update({
    where: { id },
    data: { statut },
    include: {
      classe: { select: { nom: true } },
      matiere: { select: { nom: true, couleur: true } },
    },
  });

  if (statut === "CORRIGE" && existing.statut !== "CORRIGE") {
    try {
      const nbEleves = await prisma.eleve.count({
        where: { classeId: existing.classeId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
      });

      await prisma.notification.create({
        data: {
          tenantId: session.user.tenantId,
          titre: `Devoir corrigé: ${updated.titre}`,
          contenu: `Les corrections du devoir ${updated.titre} sont disponibles.`,
          canal: "IN_APP",
          statut: "ENVOYEE",
          cible: "CLASSE",
          classeId: existing.classeId,
          envoyeParId: session.user.id,
          nbDestinataires: nbEleves,
          nbDelivres: nbEleves,
          envoyeeAt: new Date(),
        },
      });
    } catch (notifError) {
      console.error("[API/devoirs] Notification échouée:", notifError);
    }
  }

  return NextResponse.json({
    devoir: {
      id: updated.id,
      titre: updated.titre,
      description: updated.description,
      dateRendu: updated.dateRendu.toISOString(),
      statut: updated.statut,
      type: updated.type,
      classe: { nom: updated.classe.nom },
      matiere: { nom: updated.matiere.nom, couleur: updated.matiere.couleur },
    },
  });
}
