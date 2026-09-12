import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase-generated";

/**
 * Helper pour appeler une fonction RPC Supabase dont le nom n'est pas
 * dans les types générés par `supabase gen types typescript`.
 *
 * `supabase gen types` ne détecte pas les fonctions RPC personnalisées
 * (SECURITY DEFINER). Ce helper contourne la vérification de type sur
 * le nom de fonction et les arguments, tout en typant le retour.
 *
 * Usage :
 *   const { data, error } = await rpc(supabase, "eleves_with_rls", {
 *     p_tenant_id: "tenant-ambouli",
 *     p_limit: 10,
 *   });
 *   // data est typé comme EleveRlsRow[] | null
 */

type TypedClient = SupabaseClient<Database>;

export async function rpc<T>(
  client: TypedClient,
  fnName: string,
  args: Record<string, unknown>
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  // Le cast `as never` est nécessaire car les fonctions RPC personnalisées
  // ne sont pas dans les types générés par `supabase gen types`.
  // L'authentification et la validation des paramètres sont garanties
  // côté application (avant l'appel RPC).
  return client.rpc(fnName as never, args as never) as unknown as Promise<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
}
