import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Client Supabase côté serveur avec la service role key.
 * Bypass le RLS — à utiliser UNIQUEMENT dans les endpoints API sécurisés
 * où le tenantId est extrait du JWT vérifié.
 */
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Crée un client Supabase avec le tenantId injecté en session locale.
 * RLS utilise current_setting('app.tenant_id') pour filtrer automatiquement.
 */
export async function createTenantClient(tenantId: string) {
  const client = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  // Injecte le tenantId dans la session PostgreSQL pour RLS
  await client.rpc("set_tenant_context", { p_tenant_id: tenantId });

  return client;
}
