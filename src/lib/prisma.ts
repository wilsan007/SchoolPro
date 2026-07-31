import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
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
    // Prisma gère son propre pool de connexions au-dessus de PgBouncer.
    // En mode serverless (Netlify), chaque instance garde un pool persistant
    // tant que le processus vit. Ces paramètres contrôlent ce pool interne.
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
