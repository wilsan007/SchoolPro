import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { getRlsContextFromSession, rlsParams } from "@/lib/supabase-rls";
import { getSupabaseServer } from "@/lib/supabase-server";
import { rpc } from "@/lib/supabase-rpc";
import type { FactureRlsRow } from "@/types/supabase-rls-types";

/**
 * GET /api/supabase/factures
 * Factures via le client Supabase typé avec RLS.
 *
 * Query params :
 *   - limit  (default 50, max 200)
 *   - offset (default 0)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Rate limit
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 60, windowSec: 60, key: "sb-factures:" + ip });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Auth + permission
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = await checkPermission(session.user.role, "facturation:read");
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 });
  }

  const ctx = await getRlsContextFromSession();
  if (!ctx) {
    return NextResponse.json({ error: "Session sans tenant" }, { status: 401 });
  }

  const { data, error } = await rpc<FactureRlsRow>(supabase, "factures_with_rls", {
    ...rlsParams(ctx),
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("[API/supabase/factures]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: (data ?? []).length });
}
