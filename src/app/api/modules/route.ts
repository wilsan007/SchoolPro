import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { erreurJson } from "@/lib/erreurs-api";
import {
  listerModulesPourTenant,
  activerModule,
  desactiverModule,
} from "@/lib/modules";

/**
 * GET /api/modules
 * Liste tous les modules avec leur statut d'activation pour le tenant courant.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");

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

  const body = await req.json().catch(() => null);
  if (!body?.action || !body?.moduleCode) {
    return erreurJson("DONNEES_INVALIDES");
  }

  try {
    switch (body.action) {
      case "activer": {
        const result = await activerModule(
          session.user.tenantId,
          body.moduleCode,
          session.user.id
        );
        return Response.json(result);
      }

      case "desactiver": {
        const result = await desactiverModule(
          session.user.tenantId,
          body.moduleCode,
          session.user.id
        );
        return Response.json(result);
      }

      default:
        return erreurJson("DONNEES_INVALIDES");
    }
  } catch (e) {
    return erreurJson("ERREUR_SERVEUR", undefined, {
      detail: e instanceof Error ? e.message : undefined,
    });
  }
}
