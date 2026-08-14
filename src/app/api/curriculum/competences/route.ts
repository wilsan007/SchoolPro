import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { validerPrerequis } from "@/lib/learnos/curriculum";
import { revalidatePath } from "next/cache";

/**
 * Compétences du curriculum (LEARNOS).
 *
 * Le champ `prerequis` est ce qui donne au système sa capacité à expliquer un
 * blocage — « les fractions ne sont pas acquises » plutôt qu'un constat
 * d'échec sans cause. C'est aussi ce graphe qui décide qu'une difficulté
 * devient une obligation d'accompagnement (P9-A).
 */

const CreateSchema = z.object({
  chapitreId: z.string().min(1),
  code: z.string().min(1).max(40),
  libelle: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  ordre: z.number().int().min(0).optional(),
  prerequisIds: z.array(z.string()).max(20).optional(),
});

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
  const { chapitreId, code, libelle, description, ordre, prerequisIds } = parsed.data;
  const tenantId = session.user.tenantId;

  const chapitre = await prisma.chapitre.findFirst({
    where: { id: chapitreId, tenantId, ...siteFilterForModel("chapitre", session.user) },
    select: { id: true, siteId: true },
  });
  if (!chapitre) {
    return erreurJson("CHAPITRE_INTROUVABLE");
  }

  // Le code est unique par tenant : on le signale clairement plutôt que de
  // laisser remonter une violation de contrainte.
  const doublon = await prisma.competence.findFirst({
    where: { tenantId, code },
    select: { id: true },
  });
  if (doublon) {
    return erreurJson("CODE_COMPETENCE_DEJA_UTILISE", { code });
  }

  const prerequisValides = await validerPrerequis(tenantId, session.user, prerequisIds);
  if ("erreur" in prerequisValides) {
    return erreurJson(prerequisValides.erreur);
  }

  const competence = await prisma.competence.create({
    data: {
      tenantId,
      siteId: chapitre.siteId,
      chapitreId,
      code,
      libelle,
      description: description ?? null,
      ordre: ordre ?? 0,
      prerequis: { connect: prerequisValides.ids.map((id) => ({ id })) },
    },
    include: { prerequis: { select: { id: true, code: true, libelle: true } } },
  });

  revalidatePath("/curriculum");
  return NextResponse.json(competence, { status: 201 });
}
