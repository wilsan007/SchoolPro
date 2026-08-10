import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import {
  listTargetingOptions,
  resolveAudience,
  scopeLabel,
  MAX_AUDIENCE,
  type AudienceScope,
} from "@/lib/messaging-audience";

const ScopeSchema: z.ZodType<AudienceScope> = z.union([
  z.object({ kind: z.literal("TENANT") }),
  z.object({ kind: z.literal("SITE"), id: z.string().min(1) }),
  z.object({ kind: z.literal("STRUCTURE"), id: z.string().min(1) }),
  z.object({ kind: z.literal("NIVEAU"), value: z.string().min(1) }),
  z.object({ kind: z.literal("CLASSE"), id: z.string().min(1) }),
]);

const PreviewSchema = z.object({
  scope: ScopeSchema,
  group: z.enum(["ALL", "PARENTS", "ELEVES", "ENSEIGNANTS", "PERSONNEL", "DIRECTION"]),
});

/**
 * GET /api/messages/audience
 * Options de ciblage disponibles pour l'utilisateur courant : portées et
 * publics autorisés par son rôle, sites/structures/niveaux/classes de son
 * périmètre. Un seul appel, pas de cascade de requêtes côté client.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "messages:write");
    if (denied) return denied;

    const options = await listTargetingOptions({
      id: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
      siteId: session.user.siteId ?? null,
      siteIds: session.user.siteIds ?? [],
      tenantHasSites: session.user.tenantHasSites,
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error("[API/messages/audience GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/messages/audience
 * Aperçu d'une audience avant envoi : combien de personnes, réparties
 * comment, et combien n'ont pas de compte donc ne recevront rien.
 *
 * Ne jamais diffuser à l'aveugle est le point sur lequel les outils grand
 * public (Intercom, Mailchimp) ont raison contre les logiciels scolaires
 * historiques : l'émetteur voit son audience avant de valider.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "messages:write");
    if (denied) return denied;

    const parsed = PreviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ciblage invalide" }, { status: 400 });
    }

    const actor = {
      id: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
      siteId: session.user.siteId ?? null,
      siteIds: session.user.siteIds ?? [],
      tenantHasSites: session.user.tenantHasSites,
    };

    const resolved = await resolveAudience(actor, parsed.data);

    return NextResponse.json({
      count: resolved.userIds.length,
      breakdown: resolved.breakdown,
      sansCompte: resolved.sansCompte,
      label: resolved.label || (await scopeLabel(actor, parsed.data.scope)),
      truncated: resolved.truncated,
      max: MAX_AUDIENCE,
    });
  } catch (error) {
    console.error("[API/messages/audience POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
