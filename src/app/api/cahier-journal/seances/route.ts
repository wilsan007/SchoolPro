import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";

const STATUTS = ["PLANIFIEE", "EFFECTUEE", "ANNULEE", "REPORTEE"] as const;
const RYTHMES = ["EN_AVANCE", "A_TEMPS", "EN_RETARD", "NON_EVALUEE"] as const;

const CreateSchema = z.object({
  classeId: z.string().min(1),
  matiereId: z.string().min(1),
  enseignantId: z.string().optional().nullable(),
  chapitreId: z.string().optional().nullable(),
  planificationId: z.string().optional().nullable(),
  date: z.string().min(1),
  dureePrevue: z.number().int().min(15).max(480).default(60),
  dureeReelle: z.number().int().min(0).max(480).optional().nullable(),
  statut: z.enum(STATUTS).default("PLANIFIEE"),
  semaine: z.number().int().min(1).max(36),
  contenu: z.string().max(5000).optional().nullable(),
  rythme: z.enum(RYTHMES).default("NON_EVALUEE"),
  presents: z.number().int().min(0).max(500).optional().nullable(),
  absents: z.number().int().min(0).max(500).optional().nullable(),
  competences: z
    .array(
      z.object({
        competenceId: z.string().min(1),
        niveau: z.enum(["ABORDEE", "CONSOLIDEE", "MAITRISEE"]).default("ABORDEE"),
      }),
    )
    .default([]),
  fichiers: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        type: z.string().min(1),
        size: z.number().int().positive(),
        data: z.string().min(1),
      }),
    )
    .max(5)
    .optional(),
});

/**
 * Liste les séances pédagogiques du tenant, filtrées par classe, matière,
 * semaine ou statut. Respecte l'isolation site.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "curriculum:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const matiereId = searchParams.get("matiereId");
    const semaine = searchParams.get("semaine");
    const statut = searchParams.get("statut");
    const enseignantId = searchParams.get("enseignantId");

    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    // Scope enseignant : un prof ne voit que ses classes et matières,
    // pour l'année courante uniquement.
    const role = session.user.role as Role;
    const teacherScope = isTeacherRole(role)
      ? await getTeacherScope(
          session.user.tenantId,
          session.user.id,
          role,
          anneeCourante,
        )
      : null;
    const scopeFilter = teacherScope?.isRestricted
      ? {
          AND: [
            ...(teacherScope.classeIds.length > 0
              ? [{ classeId: { in: teacherScope.classeIds } }]
              : [{ id: "__none__" as const }]),
            ...(teacherScope.matiereIds.length > 0
              ? [{ matiereId: { in: teacherScope.matiereIds } }]
              : [{ id: "__none__" as const }]),
          ],
        }
      : {};

    const seances = await prisma.seancePedagogique.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...scopeFilter,
        ...(classeId ? { classeId } : {}),
        ...(matiereId ? { matiereId } : {}),
        ...(semaine ? { semaine: Number(semaine) } : {}),
        ...(statut ? { statut: statut as (typeof STATUTS)[number] } : {}),
        ...(enseignantId ? { enseignantId } : {}),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      include: {
        matiere: { select: { id: true, nom: true, code: true, couleur: true } },
        enseignant: {
          select: { id: true, user: { select: { id: true, name: true } } },
        },
        chapitre: { select: { id: true, nom: true } },
        classe: { select: { id: true, nom: true, niveau: true } },
        competences: {
          include: {
            competence: { select: { id: true, code: true, libelle: true } },
          },
        },
        devoirs: { select: { id: true, titre: true, dateRendu: true, statut: true } },
        commentaires: {
          include: {
            auteur: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { devoirs: true } },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ seances });
  } catch (error) {
    console.error("[API/cahier-journal/seances GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Crée une séance pédagogique.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "curriculum:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const data = parsed.data;

    // ── Validation du périmètre enseignant ──
    // Un prof ne peut créer une séance que pour une classe + matière
    // auxquelles il est affecté, pour l'année courante. La direction
    // (PRINCIPAL, ADMIN, etc.) n'est pas restreinte.
    const role = session.user.role as Role;
    if (isTeacherRole(role)) {
      const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
      const scope = await getTeacherScope(
        session.user.tenantId,
        session.user.id,
        role,
        anneeCourante,
      );
      if (
        scope.isRestricted &&
        (!scope.classeIds.includes(data.classeId) ||
          !scope.matiereIds.includes(data.matiereId))
      ) {
        return erreurJson("NON_AUTORISE", undefined, {
          details: "Enseignant non affecté à cette classe/matière",
        });
      }
    }

    const seance = await prisma.seancePedagogique.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: session.user.siteId ?? null,
        classeId: data.classeId,
        matiereId: data.matiereId,
        enseignantId: data.enseignantId ?? null,
        chapitreId: data.chapitreId ?? null,
        planificationId: data.planificationId ?? null,
        date: new Date(data.date),
        dureePrevue: data.dureePrevue,
        dureeReelle: data.dureeReelle ?? null,
        statut: data.statut,
        semaine: data.semaine,
        contenu: data.contenu ?? null,
        rythme: data.rythme,
        presents: data.presents ?? null,
        absents: data.absents ?? null,
        ...(data.fichiers
          ? { fichiers: data.fichiers as unknown as Prisma.InputJsonValue }
          : {}),
        competences: {
          create: data.competences.map((c) => ({
            competenceId: c.competenceId,
            niveau: c.niveau,
          })),
        },
      },
      include: {
        matiere: { select: { id: true, nom: true, code: true, couleur: true } },
        classe: { select: { id: true, nom: true, niveau: true } },
        competences: {
          include: {
            competence: { select: { id: true, code: true, libelle: true } },
          },
        },
      },
    });

    return NextResponse.json(seance, { status: 201 });
  } catch (error) {
    console.error("[API/cahier-journal/seances POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
