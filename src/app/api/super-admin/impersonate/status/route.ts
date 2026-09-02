import { NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/rbac";

/**
 * GET /api/super-admin/impersonate/status
 *
 * Retourne l'état d'impersonation courant pour la bannière.
 */
export async function GET() {
  const gate = await authorizeSuperAdmin();
  if (!gate.ok) return gate.response;

  const { session } = gate;
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
