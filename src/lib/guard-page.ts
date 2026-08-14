import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canAccessRoute, roleHasAnyPermission, type Permission } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";

/**
 * Garde d'autorisation pour les Server Components (pages dashboard).
 *
 * Deuxième barrière, derrière le middleware. Elle existe parce que le
 * middleware peut être contourné (appel direct d'un Server Component via une
 * Server Action, route interceptée, futur changement de matcher) et parce
 * qu'une page rendue est déjà une fuite de données : le refus doit être
 * prononcé avant la première requête Prisma.
 *
 * Sans argument `permission`, la règle est retrouvée dans le registre à
 * partir du chemin réinjecté par le middleware (`x-pathname`). C'est la forme
 * à préférer : la permission n'est déclarée qu'une fois, dans
 * `@/lib/permissions`, et ne peut donc plus diverger du middleware ni du menu.
 *
 * **Async** : Next.js 15 ne propage pas `redirect()` depuis une fonction
 * synchrone utilitaire — la fonction doit être `await`-ée pour que l'erreur
 * `NEXT_REDIRECT` remonte jusqu'au framework.
 *
 * @example
 * const session = await auth();
 * const { tenantId, role } = await guardPage(session);
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

  const role = session.user.role as Role;

  if (permission) {
    if (!roleHasAnyPermission(role, permission)) {
      redirect("/acces-bloque");
    }
  } else {
    const pathname = (await headers()).get("x-pathname");
    // Pas d'en-tête = le middleware n'a pas vu la requête. On ne peut alors
    // rien conclure du chemin ; on laisse passer plutôt que de bloquer une
    // page légitime, la garde explicite restant disponible.
    if (pathname && !canAccessRoute(role, pathname)) {
      redirect("/acces-bloque");
    }
  }

  return {
    tenantId: (session.user.tenantId ?? "") as string,
    userId: session.user.id,
    role,
    session,
  };
}
