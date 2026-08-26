import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase côté serveur avec la service role key.
 *
 * Utilisé pour les uploads de fichiers (Storage) depuis les routes API,
 * où l'on a besoin de contourner les RLS (l'authentification est déjà
 * vérifiée via `auth()` côté route). Ne JAMAIS exposer la service role
 * key au client — ce module ne s'importe que dans du code serveur.
 *
 * Variables d'environnement requises :
 *   - NEXT_PUBLIC_SUPABASE_URL   (ex: https://xqtjqhkfcctwspotyzqv.supabase.co)
 *   - SUPABASE_SERVICE_ROLE_KEY  (clé service role, secrète)
 *
 * Si ces variables ne sont pas configurées, `getSupabaseServer()` renvoie
 * `null` : les routes d'upload retournent alors une erreur 503 explicite
 * plutôt que de planter silencieusement.
 */

let cached: SupabaseClient | null | undefined;

export function getSupabaseServer(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Bucket Supabase Storage dédié aux pièces d'inscription.
 * Doit être créé côté Supabase (Dashboard → Storage) avec une politique
 * publique en lecture (ou via une URL signée) et en écriture via la
 * service role key uniquement.
 */
export const INSCRIPTION_BUCKET = "inscriptions";

/**
 * Types MIME autorisés pour les pièces d'inscription.
 * La photo est une image ; les autres pièces sont des PDF ou images.
 */
export const MIME_AUTORISES_INSCRIPTION = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/**
 * Taille maximale par fichier : 8 Mo (les actes/bulletins PDF peuvent
 * être plus lourds qu'une photo).
 */
export const TAILLE_MAX_INSCRIPTION = 8 * 1024 * 1024;
