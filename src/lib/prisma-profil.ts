import { appendFile } from "node:fs";
import { Prisma } from "@prisma/client";

/**
 * Journal de diagnostic des requêtes Prisma — INACTIF par défaut.
 *
 * Activé seulement si `PRISMA_PROFIL` contient un chemin de fichier : chaque
 * opération y ajoute une ligne JSON (début, durée, taille du résultat,
 * modèle.opération). Sur une
 * base distante, le temps d'une page tient au NOMBRE d'allers-retours et à
 * leur enchaînement, pas au CPU : ce journal permet de les compter et de voir
 * lesquels s'exécutent l'un après l'autre.
 *
 *   PRISMA_PROFIL=/tmp/prisma.jsonl npx next dev
 */
export function extensionProfil(fichier: string) {
  return Prisma.defineExtension({
    name: "profil-requetes",
    query: {
      async $allOperations({ model, operation, args, query }) {
        const debut = Date.now();
        let resultat: unknown;
        try {
          resultat = await query(args);
          return resultat;
        } finally {
          const ms = Date.now() - debut;
          // Taille approximative du résultat : sur une liaison lente, c'est le
          // volume rapatrié — pas le temps d'exécution — qui fait la durée.
          let ko = 0;
          try {
            ko = Math.round((JSON.stringify(resultat, (_, v) => (typeof v === "bigint" ? String(v) : v))?.length ?? 0) / 1024);
          } catch {
            ko = -1;
          }
          const lignes = Array.isArray(resultat) ? resultat.length : undefined;
          const ligne = JSON.stringify({ t: debut, ms, ko, lignes, op: `${model ?? "$brut"}.${operation}` });
          appendFile(fichier, `${ligne}\n`, () => {});
        }
      },
    },
  });
}
