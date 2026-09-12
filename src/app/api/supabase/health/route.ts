import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";
import { rpc } from "@/lib/supabase-rpc";
import type { CheckRlsVisibilityRow } from "@/types/supabase-rls-types";

/**
 * GET /api/supabase/health
 * Health check du client Supabase + RLS.
 *
 * Vérifie :
 *   1. Le client Supabase est configuré (URL + key)
 *   2. L'authentification produit une session avec tenantId
 *   3. La fonction RPC check_rls_visibility pose le contexte et
 *      compte les élèves visibles — validant que la RLS est active
 */
export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      {
        status: "error",
        error: "Client Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)",
      },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json(
      { status: "error", error: "Session non authentifiée" },
      { status: 401 }
    );
  }

  const { data, error } = await rpc<CheckRlsVisibilityRow>(
    supabase,
    "check_rls_visibility",
    {
      p_tenant_id: session.user.tenantId,
      p_site_id: session.user.siteId ?? "",
      p_site_ids: (session.user.siteIds ?? []).join(","),
      p_super_admin: session.user.role === "SUPER_ADMIN",
    }
  );

  if (error) {
    return NextResponse.json(
      { status: "error", error: error.message, tenantId: session.user.tenantId },
      { status: 500 }
    );
  }

  const result = (data ?? [])[0];
  return NextResponse.json({
    status: "ok",
    tenantId: session.user.tenantId,
    rls: {
      context_set: result?.context_set ?? false,
      tenant_id: result?.tenant_id ?? null,
      eleve_count: result?.eleve_count ?? 0,
    },
  });
}
