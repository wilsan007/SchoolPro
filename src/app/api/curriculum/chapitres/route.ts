import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";

/**
 * Chapitres du curriculum (LEARNOS).
 *
 * Le chapitre est le premier maillon de la chaîne : sans lui, pas de
 * compétence, donc pas de preuve rattachée, donc aucun profil de maîtrise ni
 * aucune recommandation. C'est l'écran de saisie qui rend tout le reste
 * opérant.
 */

const CreateSchema = z.object({
  matiereId: z.string().min(1),
  nom: z.string().min(2).max(150),
  niveau: z.string().min(1).max(50),
  ordre: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const matiereId = searchParams.get("matiereId");
  const niveau = searchParams.get("niveau");

  const chapitres = await prisma.chapitre.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilterForModel("chapitre", session.user),
      ...(matiereId ? { matiereId } : {}),
      ...(niveau ? { niveau } : {}),
    },
    include: {
      matiere: { select: { id: true, nom: true, code: true, couleur: true } },
      competences: {
        where: siteFilterForModel("competence", session.user),
        orderBy: { ordre: "asc" },
        select: {
          id: true,
          code: true,
          libelle: true,
          description: true,
          ordre: true,
          prerequis: { select: { id: true, code: true, libelle: true } },
        },
      },
    },
    orderBy: [{ niveau: "asc" }, { ordre: "asc" }],
  });

  return NextResponse.json({ chapitres });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }
  const { matiereId, nom, niveau, ordre } = parsed.data;
  const tenantId = session.user.tenantId;

  // La matière doit appartenir au tenant ET au périmètre de l'utilisateur :
  // sans ce contrôle, `matiereId` permettrait de greffer un chapitre sur la
  // matière d'un autre site.
  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", session.user) },
    select: { id: true, siteId: true },
  });
  if (!matiere) {
    return erreurJson("MATIERE_INTROUVABLE");
  }

  const chapitre = await prisma.chapitre.create({
    data: {
      tenantId,
      // Le chapitre hérite du site de sa matière : une seule source de vérité
      // pour le rattachement, plutôt que le site « sélectionné » à l'écran.
      siteId: matiere.siteId,
      matiereId,
      nom,
      niveau,
      ordre: ordre ?? 0,
    },
    include: { competences: true },
  });

  revalidatePath("/curriculum");
  return NextResponse.json(chapitre, { status: 201 });
}
