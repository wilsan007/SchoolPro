import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { erreurJson } from "@/lib/erreurs-api";

/**
 * GET /api/super-admin/impersonate/status
 *
 * Retourne l'état d'impersonation courant pour la bannière.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return erreurJson("NON_AUTORISE");
  }

  const impersonating = (session.user as { impersonating?: boolean }).impersonating ?? false;
  const impersonatedTenantName =
    (session.user as { impersonatedTenantName?: string | null }).impersonatedTenantName ?? null;
  const impersonatedUserEmail =
    (session.user as { impersonatedUserEmail?: string | null }).impersonatedUserEmail ?? null;

  return NextResponse.json({
    impersonating,
    impersonatedTenantName,
    impersonatedUserEmail,
  });
}
