import { getSupabaseServer } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";
import type { RlsContext } from "@/lib/rls-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatabaseWithRls } from "@/types/supabase-rls-types";

/**
 * SchoolPro — Client Supabase avec contexte RLS posé automatiquement
 * ================================================================
 *
 * PostgREST exécute chaque requête dans sa propre transaction. Le contexte
 * RLS (app.tenant_id) posé via un RPC séparé ne survit pas à la fin de
 * cette transaction. Ces fonctions utilisent des fonctions RPC SECURITY
 * DEFINER qui posent le contexte ET retournent les données dans la même
 * transaction.
 *
 * L'authentification reste vérifiée côté Next.js (via `auth()`) avant
 * l'appel RPC. Le tenantId est extrait de la session authentifiée et passé
 * en paramètre à la fonction RPC, qui le pose via `set_app_context()`
 * avant de sélectionner les données.
 */

type TypedSupabaseClient = NonNullable<ReturnType<typeof getSupabaseServer>>;

export interface RlsQueryResult<T> {
  data: T[] | null;
  error: Error | null;
}

/**
 * Déduit le contexte RLS depuis la session authentifiée.
 * Retourne null si l'utilisateur n'est pas authentifié ou sans tenant.
 */
export async function getRlsContextFromSession(): Promise<RlsContext | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.tenantId) return null;

  return {
    tenantId: user.tenantId,
    siteId: user.siteId ?? null,
    siteIds: user.siteIds ?? [],
    superAdmin: user.role === "SUPER_ADMIN",
    origin: "session:supabase-rls",
  };
}

/**
 * Exécute une requête RPC Supabase avec le contexte RLS posé automatiquement.
 *
 * @param fn - Fonction qui reçoit le client Supabase typé et le contexte RLS,
 *             et retourne une requête RPC (un PostgrestBuilder)
 * @returns Les données ou une erreur
 */
export async function supabaseRlsQuery<T>(
  fn: (
    client: TypedSupabaseClient,
    ctx: RlsContext
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<RlsQueryResult<T>> {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      data: null,
      error: new Error(
        "Stockage Supabase non configuré. Ajoutez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env"
      ),
    };
  }

  const ctx = await getRlsContextFromSession();
  if (!ctx) {
    return {
      data: null,
      error: new Error("Session non authentifiée ou sans tenantId"),
    };
  }

  const { data, error } = await fn(supabase, ctx);
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  return { data, error: null };
}

/**
 * Paramètres RLS standards à passer aux fonctions RPC.
 * Construit à partir du contexte de session.
 * Garantit que tenantId est une string (non null) — l'appelant a déjà
 * vérifié que l'utilisateur est authentifié avec un tenant.
 */
export function rlsParams(ctx: RlsContext): {
  p_tenant_id: string;
  p_site_id: string;
  p_site_ids: string;
} {
  return {
    p_tenant_id: ctx.tenantId ?? "",
    p_site_id: ctx.siteId ?? "",
    p_site_ids: (ctx.siteIds ?? []).join(","),
  };
}
