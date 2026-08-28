// @ts-nocheck — Cloudflare Workers file, types fournis par @cloudflare/workers-types
// (non inclus dans le build Next.js ; voir tsconfig.json qui exclut ce fichier)
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  SCHOOLPRO_CONTAINER: DurableObjectNamespace;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_APP_NAME?: string;
  [key: string]: DurableObjectNamespace | string | undefined;
}

/**
 * Container class — gère le lifecycle du container Next.js.
 * Le container écoute sur le port 3000 (Next.js standalone server).
 */
export class SchoolProContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "5m";

  // Les secrets Cloudflare sont passés au container automatiquement.
  // Les vars non-secrètes sont définies ici :
  envVars = {
    NODE_ENV: "production",
  };

  override onStart() {
    console.log("[SchoolPro] Container started");
  }

  override onStop() {
    console.log("[SchoolPro] Container stopped");
  }

  override onError(error: unknown) {
    console.error("[SchoolPro] Container error:", error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Toutes les requêtes vont vers une seule instance du container
    // (Next.js gère lui-même le routing interne : pages, API routes, etc.)
    const container = getContainer(env.SCHOOLPRO_CONTAINER);
    return await container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
