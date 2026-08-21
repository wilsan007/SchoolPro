import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { z } from "zod";

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
    const denied = checkPermission(session.user.role, "curriculum:read");
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
        devoirs: { select: { id: true, titre: true, dateRendu: true, statut: true } },
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
    const denied = checkPermission(session.user.role, "curriculum:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    // Ownership check before update (custom ESLint rule).
    const existing = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
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
    const denied = checkPermission(session.user.role, "curriculum:write");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.seancePedagogique.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        ...siteFilterForModel("seancePedagogique", session.user),
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
