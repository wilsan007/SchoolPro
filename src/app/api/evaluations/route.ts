import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, siteFilterForRelation, requireSiteIdForCreate } from "@/lib/site-filter";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "evaluations:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");

    const siteFilter = siteFilterForRelation(session.user, "classe");
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    const maintenant = await getDemoNow();

    const teacherScope = isTeacherRole(session.user.role as Role)
      ? await getTeacherScope(session.user.tenantId, session.user.id as string, session.user.role as Role, anneeCourante)
      : null;
    const teacherClasseIds = teacherScope?.isRestricted ? teacherScope.classeIds : null;
    if (classeId && teacherClasseIds && !teacherClasseIds.includes(classeId)) {
      return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
    }
    const classeFilter = teacherClasseIds ? { classeId: { in: classeId ? [classeId] : teacherClasseIds } } : {};

    const evaluations = await prisma.evaluation.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...siteFilter,
        ...classeFilter,
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
        date: { lte: maintenant },
      },
      include: {
        classe: { select: { nom: true, niveau: true } },
        matiere: { select: { nom: true, code: true, coefficient: true } },
        periode: { select: { nom: true } },
        _count: { select: { notes: true } }, // Nombre de notes déjà saisies
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(evaluations);
  } catch (error) {
    console.error("[API/evaluations] GET", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  titre: z.string().min(1),
  type: z.enum(["CONTROLE", "DEVOIR", "EXAMEN", "INTERROGATION", "PROJET", "ORAL", "TP"]),
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  periodeId: z.string().min(1),
  date: z.string().transform((str) => new Date(str)),
  duree: z.number().min(1),
  coefficient: z.number().min(0),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "evaluations:write");
    if (denied) return denied;

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error }, { status: 400 });
    }

    const data = parsed.data;

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

    const evaluation = await prisma.evaluation.create({
      data: {
        tenantId: session.user.tenantId,
        titre: data.titre,
        type: data.type,
        classeId: data.classeId,
        matiereId: data.matiereId,
        periodeId: data.periodeId,
        date: data.date,
        duree: data.duree,
        coefficient: data.coefficient,
        description: data.description,
        statut: "PLANIFIE",
      },
      include: {
        classe: true,
        matiere: true,
      }
    });

    try {
      const nbDestinataires = await prisma.eleve.count({
        where: { tenantId: session.user.tenantId, classeId: data.classeId, statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
      });

      if (nbDestinataires > 0) {
        const dateStr = data.date.toLocaleDateString("fr-FR");
        const contenuNotif = `Une nouvelle évaluation est planifiée.\n\n` +
          `Intitulé : ${data.titre}\n` +
          `Matière : ${evaluation.matiere?.nom ?? "—"}\n` +
          `Date : ${dateStr}\n` +
          `Type : ${data.type}\n` +
          `Durée : ${data.duree} min\n` +
          (data.description ? `Description : ${data.description}\n` : "");

        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre: `Nouvelle évaluation planifiée: ${data.titre}`,
            contenu: contenuNotif,
            canal: "IN_APP",
            statut: "ENVOYEE",
            cible: "CLASSE",
            classeId: data.classeId,
            envoyeParId: session.user.id,
            nbDestinataires,
            nbDelivres: nbDestinataires,
            envoyeeAt: new Date(),
          },
        });
      }
    } catch (notifError) {
      console.error("[API/evaluations] Notification échouée:", notifError);
    }

    return NextResponse.json(evaluation);
  } catch (error) {
    console.error("[API/evaluations] POST", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
