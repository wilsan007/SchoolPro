import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Numérotation atomique des factures.
 *
 * Les numéros étaient calculés par `prisma.facture.count() + 1` : deux
 * créations simultanées obtenaient le même numéro, et une suppression faisait
 * réémettre un numéro déjà remis à une famille.
 *
 * Le compteur vit en base (table `facture_sequences`), derrière la fonction
 * SQL `next_facture_numeros` qui réserve un bloc sous verrou pour tout
 * l'établissement, tous sites confondus. L'index unique
 * `(tenantId, numero)` interdit tout doublon, d'où qu'il vienne.
 * Voir migration_numerotation_factures.sql.
 *
 * Appelée dans une transaction interactive, la réservation est annulée avec
 * elle ; hors transaction, un échec de création laisse un trou dans la
 * séquence, jamais un doublon.
 */

type RawClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export function formatNumeroFacture(prefixe: string | number, sequence: number): string {
  return `FAC-${prefixe}-${String(sequence).padStart(5, "0")}`;
}

export async function reserverNumerosFacture(
  tenantId: string,
  prefixe: string | number,
  nombre: number,
  client: RawClient = prisma,
): Promise<string[]> {
  if (nombre <= 0) return [];
  const rows = await client.$queryRaw<{ premier: number }[]>`
    SELECT next_facture_numeros(${tenantId}, ${String(prefixe)}, ${nombre}::int) AS premier`;
  const premier = Number(rows[0]?.premier);
  if (!Number.isInteger(premier) || premier < 1) {
    throw new Error("Numérotation des factures indisponible");
  }
  return Array.from({ length: nombre }, (_, i) => formatNumeroFacture(prefixe, premier + i));
}

export async function reserverNumeroFacture(
  tenantId: string,
  prefixe: string | number,
  client: RawClient = prisma,
): Promise<string> {
  const [numero] = await reserverNumerosFacture(tenantId, prefixe, 1, client);
  return numero;
}
