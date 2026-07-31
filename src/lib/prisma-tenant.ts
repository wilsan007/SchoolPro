import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Wrapper Prisma qui force le tenantId sur toutes les requêtes.
 * Utiliser à la place de `prisma` dans les routes API et server actions.
 *
 * @example
 * const { prisma: tp, tenantId } = await tenantPrisma();
 * const eleves = await tp.eleve.findMany(); // tenantId filtré automatiquement
 */
export async function tenantPrisma() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;

  if (!tenantId) {
    throw new Error("Aucun tenant actif");
  }

  return {
    tenantId,
    prisma: new Proxy(prisma, {
      get(target, model: string) {
        const delegate = (target as never)[model];
        return new Proxy(delegate, {
          get(_delegate, method: string) {
            const fn = (_delegate as never)[method];
            if (typeof fn !== "function") return fn;

            return async (...args: unknown[]) => {
              // Injecter tenantId dans le where clause
              const [firstArg] = args;
              if (firstArg && typeof firstArg === "object" && !Array.isArray(firstArg)) {
                const arg = firstArg as Record<string, unknown>;
                if ("where" in arg && arg.where && typeof arg.where === "object") {
                  const where = arg.where as Record<string, unknown>;
                  if (!("tenantId" in where)) {
                    where.tenantId = tenantId;
                  }
                } else if (!("where" in arg) && method === "findUnique") {
                  // findUnique avec where direct
                  arg.where = { ...(arg.where as object), tenantId };
                }
              }
              return (fn as (...a: unknown[]) => unknown).apply(_delegate, args);
            };
          },
        });
      },
    }),
  };
}
