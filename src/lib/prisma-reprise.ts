import { Prisma } from "@prisma/client";

/**
 * Codes Prisma d'une connexion perdue en cours de route — pas d'une requête
 * fausse : P1001 (base injoignable), P1008 (délai dépassé), P1017 (connexion
 * fermée par le serveur). Le pooler distant coupe parfois une connexion
 * pendant une lecture longue ; la même lecture, relancée, aboutit.
 */
const CODES_CONNEXION = new Set(["P1001", "P1008", "P1017"]);

function connexionPerdue(erreur: unknown): boolean {
  if (erreur instanceof Prisma.PrismaClientKnownRequestError) return CODES_CONNEXION.has(erreur.code);
  if (erreur instanceof Prisma.PrismaClientInitializationError) {
    return !!erreur.errorCode && CODES_CONNEXION.has(erreur.errorCode);
  }
  // Certaines coupures remontent sans code, avec ce seul message.
  return erreur instanceof Error && /Server has closed the connection|Can't reach database server/.test(erreur.message);
}

/**
 * Exécute une LECTURE et la relance une fois si la connexion a été perdue.
 *
 * À réserver aux lectures : rejouer une écriture dont on ignore si elle a été
 * appliquée la doublerait. Toute autre erreur est propagée telle quelle.
 */
export async function lectureAvecReprise<T>(lire: () => Promise<T>): Promise<T> {
  try {
    return await lire();
  } catch (erreur) {
    if (!connexionPerdue(erreur)) throw erreur;
    return lire();
  }
}
