import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { erreurJson } from "@/lib/erreurs-api";
import { PREFERENCES_PAR_DEFAUT } from "@/lib/learnos/alertes-parent";

/**
 * Préférences de notification d'une famille.
 *
 * ISOLATION — aucune identification par paramètre
 * -----------------------------------------------
 * La route ne prend jamais de `parentId` : elle résout la fiche parent depuis
 * `session.user.id`. Accepter un identifiant permettrait à un parent de
 * couper — ou de rouvrir — les notifications d'une autre famille.
 *
 * Se désinscrire des alertes ne coupe PAS les réponses aux questions posées :
 * ce sont deux choses différentes, et les confondre priverait la famille du
 * seul canal qu'elle maîtrise.
 */

const PatchSchema = z.object({
  alertesActives: z.boolean().optional(),
  niveauMinimal: z.enum(["INFO", "ATTENTION", "URGENT"]).optional(),
  langue: z.enum(["fr", "en", "so"]).nullable().optional(),
});

/** La fiche parent du compte connecté, ou `null`. */
async function parentDuCompte(tenantId: string, userId: string) {
  // Pas de filtre de site : les préférences appartiennent à la famille, et le
  // rôle PARENT n'est de toute façon pas borné par site (voir site-scope.ts).
  // eslint-disable-next-line ecolpro/require-site-filter
  return prisma.parent.findFirst({
    where: { tenantId, userId },
    select: { id: true },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  if (session.user.role !== "PARENT") return erreurJson("NON_AUTORISE");

  const parent = await parentDuCompte(session.user.tenantId, session.user.id);
  if (!parent) return erreurJson("NON_AUTORISE");

  // `findFirst` avec `tenantId` plutôt que `findUnique` sur `parentId` : la
  // clé unique seule ne prouve pas l'appartenance au tenant.
  const prefs = await prisma.preferencesParent.findFirst({
    where: { parentId: parent.id, tenantId: session.user.tenantId },
    select: { alertesActives: true, niveauMinimal: true, langue: true, plafondHebdomadaire: true },
  });

  return NextResponse.json(prefs ?? PREFERENCES_PAR_DEFAUT);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  if (session.user.role !== "PARENT") return erreurJson("NON_AUTORISE");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }

  const tenantId = session.user.tenantId;
  const parent = await parentDuCompte(tenantId, session.user.id);
  if (!parent) return erreurJson("NON_AUTORISE");

  // Le plafond hebdomadaire n'est PAS modifiable ici : c'est une protection
  // posée par l'établissement, pas un réglage de confort. Un parent qui veut
  // moins de messages relève le seuil de gravité.
  const prefs = await prisma.preferencesParent.upsert({
    where: { parentId: parent.id },
    create: {
      tenantId,
      parentId: parent.id,
      alertesActives: parsed.data.alertesActives ?? PREFERENCES_PAR_DEFAUT.alertesActives,
      niveauMinimal: parsed.data.niveauMinimal ?? PREFERENCES_PAR_DEFAUT.niveauMinimal,
      langue: parsed.data.langue ?? null,
    },
    update: parsed.data,
    select: { alertesActives: true, niveauMinimal: true, langue: true, plafondHebdomadaire: true },
  });

  return NextResponse.json(prefs);
}
