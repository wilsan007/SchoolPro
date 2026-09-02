import { PrismaClient } from "@prisma/client";
import { withRlsExtension } from "@/lib/prisma-rls";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaBackground: PrismaClient | undefined;
};

/**
 * Ajoute (ou met à jour) `connection_limit` et `pool_timeout` dans la
 * query string d'une URL Postgres. Utilisé pour borner le client de fond
 * afin de ne pas épuiser le pool session Supabase (15 connexions max).
 */
function withConnectionLimit(url: string | undefined, limit: number): string | undefined {
  if (!url) return url;
  const [base, qs] = url.split("?");
  const params = new URLSearchParams(qs ?? "");
  params.set("connection_limit", String(limit));
  params.set("pool_timeout", "30");
  return qs === undefined ? `${base}?${params}` : `${base}?${params}`;
}

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
 *   — Dev : `DATABASE_URL` (pooler transaction, port 6543) — limite ~200
 *     connexions, évite l'erreur `EMAXCONNSESSION` (pool session = 15).
 *     Coût : ~5x plus lent (pas de prepared statements en mode transaction),
 *     acceptable en dev. Pour forcer le mode session rapide le temps d'un
 *     profilage, poser `PRISMA_DEV_DIRECT=true` (revient à l'ancien comportement,
 *     risqué si plusieurs dev servers / onglets tournent).
 *   — Prod : `DATABASE_URL` (pooler transaction, port 6543) — nécessaire
 *     en serverless pour limiter les connexions.
 *   — Background : `DIRECT_URL` (mode session) plafonné à 3 connexions —
 *     séquentiel, peu concurrent, garde les prepared statements.
 *
 * Sur un VPS (PostgreSQL local), on passera en mode session direct sans
 * pgbouncer : plus de limite de connexions, prepared statements actifs.
 */
const useDirectInDev =
  process.env.NODE_ENV !== "production" &&
  process.env.PRISMA_DEV_DIRECT === "true";
const appDbUrl = useDirectInDev
  ? process.env.DIRECT_URL ?? process.env.DATABASE_URL
  : process.env.DATABASE_URL;

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
 *
 * PLAFOND DE CONNEXIONS
 * Le mode session Supabase est limité à 15 connexions projet. Pour ne pas
 * épuiser le pool (EMAXCONNSESSION) quand l'app et les scripts tournent en
 * parallèle, on borne ce client à 3 connexions via `connection_limit=3` et
 * un `pool_timeout=30` pour attendre une place plutôt que de planter.
 */
const backgroundDbUrl = withConnectionLimit(
  process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  3,
);
export const prismaBackground =
  globalForPrisma.prismaBackground ??
  withRlsExtension(
    new PrismaClient({
      log: ["error"],
      datasources: { db: { url: backgroundDbUrl } },
    })
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBackground = prismaBackground;
}
