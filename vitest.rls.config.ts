import { defineConfig } from "vitest/config";
import path from "path";

/**
 * EcolPro — Configuration Vitest des tests d'ISOLATION (RLS)
 *
 * Séparée de vitest.config.ts pour deux raisons :
 *   - ces tests parlent à un vrai PostgreSQL (le labo fidèle à la
 *     production, `make test-db-up`) : ils n'ont rien à faire dans la
 *     suite unitaire, qui doit rester instantanée et sans dépendance ;
 *   - ils s'exécutent en environnement `node`, pas `jsdom`.
 *
 * Lancement : make rls-test   (ou : pnpm test:rls)
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rls/**/*.test.ts"],
    // Les tests partagent une base : les faire tourner en série évite
    // qu'un jeu de données en écrase un autre.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
