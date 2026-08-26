import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { publishEvent } from "@/lib/learnos/events";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";

const STATUTS = ["PLANIFIEE", "EFFECTUEE", "ANNULEE", "REPORTEE"] as const;
const RYTHMES = ["EN_AVANCE", "A_TEMPS", "EN_RETARD", "NON_EVALUEE"] as const;

const PatchSchema = z.object({
  statut: z.enum(STATUTS).optional(),
  date: z.string().optional(),
  dureePrevue: z.number().int().min(15).max(480).optional(),
  dureeReelle: z.number().int().min(0).max(480).nullable().optional(),
  contenu: z.string().max(5000).nullable().optional(),
  rythme: z.enum(RYTHMES).optional(),
  presents: z.number().int().min(0).max(500).nullable().optional(),
  absents: z.number().int().min(0).max(500).nullable().optional(),
  chapitreId: z.string().nullable().optional(),
  planificationId: z.string().nullable().optional(),
  enseignantId: z.string().nullable().optional(),
  competences: z
    .array(
      z.object({
        competenceId: z.string().min(1),
        niveau: z.enum(["ABORDEE", "CONSOLIDEE", "MAITRISEE"]).default("ABORDEE"),
      }),
    )
    .optional(),
  objectifs: z.array(z.string()).nullable().optional(),
  activites: z
    .array(z.object({ nom: z.string(), duree: z.number(), type: z.string() }))
    .nullable()
    .optional(),
  supports: z
    .array(
      z.object({
        type: z.string(),
        lien: z.string(),
        description: z.string().optional(),
      }),
    )
    .nullable()
    .optional(),
  differentiation: z
    .array(
      z.object({
        eleve: z.string().optional(),
        groupe: z.string().optional(),
        adaptation: z.string(),
      }),
    )
    .nullable()
    .optional(),
  planLeconId: z.string().nullable().optional(),
});

/**
 * Détail d'une séance pédagogique.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:read");
    if (denied) return denied;

    const { id } = await params;
    const seance = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
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
        devoirs: { select: { id: true, titre: true, dateRendu: true, statut: true, type: true } },
        planLecon: {
          select: {
            id: true,
            titre: true,
            objectifs: true,
            etapes: true,
            differentiation: true,
          },
        },
        commentaires: {
          include: {
            auteur: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!seance) return erreurJson("SEANCE_INTROUVABLE");
    return NextResponse.json(seance);
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Modifie une séance pédagogique (clôture, ajout de contenu, etc.).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    // Ownership check before update (custom ESLint rule).
    // Un enseignant ne peut modifier que ses propres séances (classe + matière
    // de son périmètre, pour l'année courante).
    const role = session.user.role as Role;
    const teacherScope = isTeacherRole(role)
      ? await getTeacherScope(
          session.user.tenantId,
          session.user.id,
          role,
          await getAnneeCouranteLibelle(session.user.tenantId),
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

    const existing = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...scopeFilter,
      },
    });
    if (!existing) return erreurJson("SEANCE_INTROUVABLE");

    const data: Record<string, unknown> = {};
    if (parsed.data.statut !== undefined) data.statut = parsed.data.statut;
    if (parsed.data.date !== undefined) data.date = new Date(parsed.data.date);
    if (parsed.data.dureePrevue !== undefined) data.dureePrevue = parsed.data.dureePrevue;
    if (parsed.data.dureeReelle !== undefined) data.dureeReelle = parsed.data.dureeReelle;
    if (parsed.data.contenu !== undefined) data.contenu = parsed.data.contenu;
    if (parsed.data.rythme !== undefined) data.rythme = parsed.data.rythme;
    if (parsed.data.presents !== undefined) data.presents = parsed.data.presents;
    if (parsed.data.absents !== undefined) data.absents = parsed.data.absents;
    if (parsed.data.chapitreId !== undefined) data.chapitreId = parsed.data.chapitreId;
    if (parsed.data.planificationId !== undefined) data.planificationId = parsed.data.planificationId;
    if (parsed.data.enseignantId !== undefined) data.enseignantId = parsed.data.enseignantId;
    if (parsed.data.objectifs !== undefined) data.objectifs = parsed.data.objectifs as unknown as Prisma.InputJsonValue;
    if (parsed.data.activites !== undefined) data.activites = parsed.data.activites as unknown as Prisma.InputJsonValue;
    if (parsed.data.supports !== undefined) data.supports = parsed.data.supports as unknown as Prisma.InputJsonValue;
    if (parsed.data.differentiation !== undefined) data.differentiation = parsed.data.differentiation as unknown as Prisma.InputJsonValue;
    if (parsed.data.planLeconId !== undefined) data.planLeconId = parsed.data.planLeconId;

    // Mise à jour des compétences abordées (remplacement complet).
    if (parsed.data.competences !== undefined) {
      data.competences = {
        deleteMany: {},
        create: parsed.data.competences.map((c) => ({
          competenceId: c.competenceId,
          niveau: c.niveau,
        })),
      };
    }

    const updated = await prisma.seancePedagogique.update({
      where: { id },
      data,
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

    // Publication d'un fait observé pour LEARNOS : la clôture d'une séance
    // déclenche la boucle du cahier-journal (mise à jour des planifications).
    // On ne publie que si le statut VIENT de passer à EFFECTUEE — un
    // re-clôture ne doit pas relancer la boucle inutilement.
    if (parsed.data.statut === "EFFECTUEE" && existing.statut !== "EFFECTUEE") {
      const competences =
        updated.competences?.map((c) => ({
          competenceId: c.competenceId,
          niveau: c.niveau,
        })) ?? [];
      // eslint-disable-next-line ecolpro/require-tenant-id -- seanceId is already tenant-verified above
      const devoirsCount = await prisma.devoir.count({ where: { seanceId: id } });
      // `void` et non `await` : la réponse HTTP ne doit pas attendre l'écriture
      // de l'événement. L'outbox garantit la livraison même si la fonction est
      // gelée aussitôt après.
      void publishEvent({
        tenantId: session.user.tenantId,
        siteId: updated.siteId ?? null,
        eventType: "seance.cloturee",
        aggregateType: "seancePedagogique",
        aggregateId: id,
        payload: {
          seanceId: id,
          classeId: updated.classeId,
          matiereId: updated.matiereId,
          chapitreId: updated.chapitreId ?? null,
          enseignantId: updated.enseignantId ?? null,
          semaine: updated.semaine,
          competences,
          devoirsDonnes: devoirsCount,
          presents: updated.presents ?? null,
          absents: updated.absents ?? null,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Supprime une séance pédagogique.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:write");
    if (denied) return denied;

    const { id } = await params;
    // Un enseignant ne peut supprimer que ses propres séances (classe + matière
    // de son périmètre, pour l'année courante).
    const role = session.user.role as Role;
    const teacherScope = isTeacherRole(role)
      ? await getTeacherScope(
          session.user.tenantId,
          session.user.id,
          role,
          await getAnneeCouranteLibelle(session.user.tenantId),
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

    const existing = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
        ...scopeFilter,
      },
    });
    if (!existing) return erreurJson("SEANCE_INTROUVABLE");

    await prisma.seancePedagogique.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API/cahier-journal/seances/:id DELETE]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
