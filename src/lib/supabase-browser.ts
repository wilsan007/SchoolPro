import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase-generated";

/**
 * Client Supabase typé côté navigateur (client).
 *
 * Utilise la `anon key` (publique) — la RLS côté Postgres filtre les lignes
 * selon le contexte posé par les fonctions RPC SECURITY DEFINER.
 *
 * Ne JAMAIS utiliser la service role key côté client.
 *
 * Variables d'environnement requises (publiques, préfixe NEXT_PUBLIC_) :
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Si ces variables ne sont pas configurées, `getSupabaseBrowser()` renvoie
 * `null` : les composants client retournent alors un état vide plutôt que
 * de planter.
 */

let cached: SupabaseClient<Database> | null | undefined;

export function getSupabaseBrowser(): SupabaseClient<Database> | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
