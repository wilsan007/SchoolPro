import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import {
  appliquerAretes,
  proposerPrerequis,
} from "@/lib/learnos/prerequis-proposes";
import { revalidatePath } from "next/cache";

/**
 * Proposition et application du graphe de prérequis.
 *
 *   POST  { matiereId }          → propositions, N'ÉCRIT RIEN
 *   PATCH { matiereId, aretes }  → applique les arêtes retenues
 *
 * Les deux verbes sont séparés à dessein : proposer coûte un appel de modèle
 * et ne doit avoir aucun effet ; appliquer écrit et ne doit coûter aucun
 * appel. Les confondre ferait relancer le modèle à chaque validation.
 */

const ProposerSchema = z.object({ matiereId: z.string().min(1) });

const AppliquerSchema = z.object({
  matiereId: z.string().min(1),
  aretes: z
    .array(z.object({ competence: z.string().min(1), prerequis: z.string().min(1) }))
    .min(1)
    .max(200),
});

/** La matière existe-t-elle dans le périmètre de l'appelant ? */
async function matiereAccessible(
  tenantId: string,
  matiereId: string,
  claims: Parameters<typeof siteFilterForModel>[1]
) {
  const matiere = await prisma.matiere.findFirst({
    where: { id: matiereId, tenantId, ...siteFilterForModel("matiere", claims) },
    select: { id: true, siteId: true },
  });
  return matiere;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const parsed = ProposerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const tenantId = session.user.tenantId;
  const matiere = await matiereAccessible(tenantId, parsed.data.matiereId, session.user);
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  try {
    const proposition = await proposerPrerequis(
      tenantId,
      matiere.id,
      session.user,
      matiere.siteId
    );
    return NextResponse.json(proposition);
  } catch (error) {
    // Aucun fournisseur joignable : ce n'est pas une erreur de l'enseignant.
    // Le curriculum reste entièrement modifiable à la main.
    if (error instanceof AiAllProvidersFailedError) {
      return erreurJson("IA_INDISPONIBLE");
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const parsed = AppliquerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const tenantId = session.user.tenantId;
  const matiere = await matiereAccessible(tenantId, parsed.data.matiereId, session.user);
  if (!matiere) return erreurJson("MATIERE_INTROUVABLE");

  // `appliquerAretes` revalide tout : ce qui revient du navigateur n'est pas
  // ce qui en est parti.
  const resultat = await appliquerAretes(
    tenantId,
    matiere.id,
    session.user,
    parsed.data.aretes
  );

  revalidatePath("/curriculum");
  return NextResponse.json(resultat);
}
