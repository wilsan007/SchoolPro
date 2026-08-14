import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";

/**
 * Planification des compétences à l'intérieur d'un chapitre.
 *
 * Comme pour les chapitres, l'enregistrement est **groupé** : l'écran envoie
 * toutes les compétences d'un chapitre d'un coup. Une compétence sans ligne
 * explicite hérite de la plage de son chapitre — c'est le comportement par
 * défaut, et retirer toutes les lignes d'un chapitre revient à revenir à cet
 * héritage.
 */

const PutSchema = z.object({
  anneeId: z.string().min(1),
  classeId: z.string().nullable().optional(),
  lignes: z
    .array(
      z.object({
        competenceId: z.string().min(1),
        semaineDebut: z.number().int().min(1).max(60),
        semaineFin: z.number().int().min(1).max(60),
      })
    )
    .max(200),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }
  const { anneeId, classeId, lignes } = parsed.data;
  const tenantId = session.user.tenantId;

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { id: true },
  });
  if (!annee) {
    return erreurJson("ANNEE_INTROUVABLE");
  }

  const invalide = lignes.find((l) => l.semaineFin < l.semaineDebut);
  if (invalide) {
    return erreurJson("SEMAINES_INVERSEES");
  }

  // Vérifier que les compétences relèvent du périmètre de l'appelant.
  const competences = await prisma.competence.findMany({
    where: {
      id: { in: lignes.map((l) => l.competenceId) },
      tenantId,
      ...siteFilterForModel("competence", session.user),
    },
    select: { id: true, siteId: true },
  });
  if (competences.length !== new Set(lignes.map((l) => l.competenceId)).size) {
    return erreurJson("COMPETENCES_HORS_PERIMETRE");
  }
  const siteParCompetence = new Map(competences.map((c) => [c.id, c.siteId]));

  // Remplacement intégral : la liste reçue fait foi.
  await prisma.$transaction([
    prisma.planificationCompetence.deleteMany({
      where: {
        tenantId,
        anneeId,
        classeId: classeId ?? null,
        competenceId: { in: lignes.map((l) => l.competenceId) },
      },
    }),
    ...(lignes.length > 0
      ? [
          prisma.planificationCompetence.createMany({
            data: lignes.map((l) => ({
              tenantId,
              siteId: siteParCompetence.get(l.competenceId) ?? null,
              anneeId,
              classeId: classeId ?? null,
              competenceId: l.competenceId,
              semaineDebut: l.semaineDebut,
              semaineFin: l.semaineFin,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/curriculum");
  return NextResponse.json({ success: true, count: lignes.length });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const anneeId = searchParams.get("anneeId");
  const classeId = searchParams.get("classeId");

  if (!anneeId) {
    return erreurJson("DONNEES_INVALIDES", { champ: "anneeId" });
  }

  const planifications = await prisma.planificationCompetence.findMany({
    where: {
      tenantId: session.user.tenantId,
      anneeId,
      classeId: classeId ?? null,
      ...siteFilterForModel("planificationCompetence", session.user),
    },
    select: {
      competenceId: true,
      semaineDebut: true,
      semaineFin: true,
      statut: true,
    },
    orderBy: { semaineDebut: "asc" },
  });

  return NextResponse.json({ planifications });
}
