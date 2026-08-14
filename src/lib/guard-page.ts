import { redirect } from "next/navigation";
import { roleHasPermission, type Permission } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";

/**
 * Garde d'autorisation pour les Server Components (pages dashboard).
 * Vérifie l'authentification, le tenantId et les permissions RBAC.
 * Redirige vers /login si non authentifié, /select-tenant si pas de tenant,
 * ou /dashboard si permission insuffisante.
 *
 * **Async** : Next.js 15 ne propage pas `redirect()` depuis une fonction
 * synchrone utilitaire — la fonction doit être `await`-ée pour que l'erreur
 * `NEXT_REDIRECT` remonte jusqu'au framework.
 *
 * @example
 * const session = await auth();
 * const { tenantId, role } = await guardPage(session, "facturation:read");
 */
export async function guardPage(
  session: Session | null,
  permission?: Permission | Permission[]
): Promise<{ tenantId: string; userId: string; role: Role; session: Session }> {
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.user.tenantId && session.user.role !== "SUPER_ADMIN") {
    redirect("/select-tenant");
  }

  if (permission) {
    const role = session.user.role as Role;
    const needed = Array.isArray(permission) ? permission : [permission];
    const allowed = needed.some((p) => roleHasPermission(role, p));
    if (!allowed) {
      redirect("/dashboard");
    }
  }

  return {
    tenantId: (session.user.tenantId ?? "") as string,
    userId: session.user.id,
    role: session.user.role as Role,
    session,
  };
}
