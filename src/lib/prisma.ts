import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaBackground: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

/**
 * Client destiné aux traitements de fond (scripts, drainage, tâches planifiées).
 *
 * POURQUOI UN SECOND CLIENT
 * `DATABASE_URL` pointe sur le pooler en **mode transaction** (port 6543) : le
 * bon choix pour le serverless, où le nombre de connexions est le vrai risque.
 * Mais Prisma y perd les *prepared statements* et paie ~5 allers-retours par
 * requête — mesuré à 980 ms contre 192 ms sur le pooler en **mode session**
 * (`DIRECT_URL`, port 5432).
 *
 * Un traitement de fond est séquentiel et peu concurrent : le mode session lui
 * convient, et le rend cinq fois plus rapide. Repli sur `DATABASE_URL` si
 * `DIRECT_URL` n'est pas renseigné.
 */
export const prismaBackground =
  globalForPrisma.prismaBackground ??
  new PrismaClient({
    log: ["error"],
    datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBackground = prismaBackground;
}
