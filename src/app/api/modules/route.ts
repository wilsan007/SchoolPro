import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  listerModulesPourTenant,
  activerModule,
  desactiverModule,
} from "@/lib/modules";

const PatchSchema = z.object({
  action: z.enum(["activer", "desactiver"]),
  moduleCode: z.string().min(1),
});

/**
 * GET /api/modules
 * Liste tous les modules avec leur statut d'activation pour le tenant courant.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

  const denied = checkPermission(session.user.role, "parametres:read");
  if (denied) return denied;

  const modules = await listerModulesPourTenant(session.user.tenantId);
  return Response.json({ modules });
}

/**
 * PATCH /api/modules
 * Active ou désactive un module.
 * Body: { action: "activer" | "desactiver", moduleCode: string }
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  const denied = checkPermission(session.user.role, "parametres:write");
  if (denied) return denied;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES");
  }

  try {
    switch (parsed.data.action) {
      case "activer": {
        const result = await activerModule(
          session.user.tenantId,
          parsed.data.moduleCode,
          session.user.id
        );
        return Response.json(result);
      }

      case "desactiver": {
        const result = await desactiverModule(
          session.user.tenantId,
          parsed.data.moduleCode,
          session.user.id
        );
        return Response.json(result);
      }
    }
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
