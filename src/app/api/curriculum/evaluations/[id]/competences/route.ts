import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  siteFilterForRelation,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { revalidatePath } from "next/cache";

/**
 * Rattachement d'une évaluation aux compétences qu'elle mesure.
 *
 * C'est le maillon qui fait passer une preuve d'apprentissage de la
 * granularité « matière » à la granularité « compétence ». Sans lui, une note
 * dit « 12/20 en maths » ; avec lui, elle dit quelle compétence est acquise —
 * et le graphe de prérequis peut alors expliquer pourquoi l'élève bloque.
 *
 * Les notes déjà saisies ne sont pas perdues : rejouer les événements
 * (`replayEvents`) régénère les preuves avec le nouveau rattachement.
 */

const PutSchema = z.object({
  competences: z
    .array(
      z.object({
        competenceId: z.string().min(1),
        /** Part de l'évaluation consacrée à cette compétence. */
        poids: z.number().min(0.01).max(1).optional(),
      })
    )
    .max(20),
});

/** Vérifie que l'évaluation existe et relève bien du périmètre de l'appelant. */
async function chargerEvaluation(
  id: string,
  tenantId: string,
  claims: SessionSiteClaims
) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  return prisma.evaluation.findFirst({
    where: {
      id,
      tenantId,
      ...siteFilterForRelation(claims, "classe"),
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    select: { id: true, matiereId: true, classe: { select: { siteId: true } } },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:read");
  if (denied) return denied;

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const evaluation = await chargerEvaluation(id, tenantId, session.user);
  if (!evaluation) {
    return erreurJson("EVALUATION_INTROUVABLE");
  }

  const [rattachements, disponibles] = await Promise.all([
    prisma.evaluationCompetence.findMany({
      where: {
        evaluationId: id,
        tenantId,
        ...siteFilterForModel("evaluationCompetence", session.user),
      },
      select: {
        competenceId: true,
        poids: true,
        competence: { select: { code: true, libelle: true } },
      },
    }),
    // Seules les compétences de la matière évaluée : proposer tout le
    // curriculum noierait l'enseignant sous des choix sans rapport.
    prisma.competence.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("competence", session.user),
        chapitre: { matiereId: evaluation.matiereId },
      },
      select: {
        id: true,
        code: true,
        libelle: true,
        chapitre: { select: { nom: true, niveau: true } },
      },
      orderBy: { ordre: "asc" },
    }),
  ]);

  return NextResponse.json({ rattachements, disponibles });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }
  const tenantId = session.user.tenantId;

  const evaluation = await chargerEvaluation(id, tenantId, session.user);
  if (!evaluation) {
    return erreurJson("EVALUATION_INTROUVABLE");
  }

  const demandes = parsed.data.competences;

  // Les compétences doivent appartenir au tenant, au périmètre de l'appelant,
  // ET à la matière évaluée : rattacher une évaluation de maths à une
  // compétence d'histoire produirait des preuves fausses.
  if (demandes.length > 0) {
    const valides = await prisma.competence.count({
      where: {
        id: { in: demandes.map((d) => d.competenceId) },
        tenantId,
        ...siteFilterForModel("competence", session.user),
        chapitre: { matiereId: evaluation.matiereId },
      },
    });
    if (valides !== new Set(demandes.map((d) => d.competenceId)).size) {
      return erreurJson("COMPETENCES_HORS_MATIERE");
    }
  }

  // Remplacement intégral : la liste reçue devient la vérité, ce qui permet de
  // retirer un rattachement depuis l'écran.
  await prisma.$transaction([
    prisma.evaluationCompetence.deleteMany({ where: { evaluationId: id, tenantId } }),
    ...(demandes.length > 0
      ? [
          prisma.evaluationCompetence.createMany({
            data: demandes.map((d) => ({
              tenantId,
              siteId: evaluation.classe?.siteId ?? null,
              evaluationId: id,
              competenceId: d.competenceId,
              poids: d.poids ?? 1,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath(`/evaluations/${id}`);
  return NextResponse.json({ success: true, count: demandes.length });
}
