import { PrismaClient } from "@prisma/client";
import { withRlsExtension } from "@/lib/prisma-rls";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaBackground: PrismaClient | undefined;
};

/**
 * Client applicatif.
 *
 * `withRlsExtension` pose le contexte multi-tenant (tenant, sites,
 * super-admin) avant chaque opération, pour que les politiques RLS de
 * PostgreSQL puissent s'appliquer. Tant que `RLS_MODE` vaut `off` — la
 * valeur par défaut — l'enveloppe est un passe-plat strict : le client
 * renvoyé est le client Prisma d'origine, sans surcoût ni changement de
 * comportement. Voir src/lib/prisma-rls.ts pour la procédure de bascule
 * (off → warn → enforce).
 *
 * CHOIX DE L'URL :
 *   — Dev : `DIRECT_URL` (mode session, port 5432) — 5x plus rapide grâce
 *     aux prepared statements. Supabase limite à 15 connexions en mode
 *     session, mais après optimisation des requêtes concurrentes (max ~16
 *     sur /direction batch 2, dont 10 findMany take:50 qui se terminent
 *     en <100ms), le pool ne s'épuise plus.
 *   — Prod : `DATABASE_URL` (pooler transaction, port 6543) — nécessaire
 *     en serverless pour limiter les connexions.
 *   — Background : `DIRECT_URL` (mode session) — séquentiel, peu concurrent.
 *
 * Sur un VPS (PostgreSQL local), on passera en mode session direct sans
 * pgbouncer : plus de limite de connexions, prepared statements actifs.
 */
const appDbUrl =
  process.env.NODE_ENV === "production"
    ? process.env.DATABASE_URL
    : process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  withRlsExtension(new PrismaClient({
    log: ["error"],
    datasources: {
      db: {
        url: appDbUrl,
      },
    },
  }));

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
  withRlsExtension(
    new PrismaClient({
      log: ["error"],
      datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
    })
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBackground = prismaBackground;
}
