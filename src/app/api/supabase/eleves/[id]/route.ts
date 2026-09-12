import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/rbac";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { getRlsContextFromSession, rlsParams } from "@/lib/supabase-rls";
import { getSupabaseServer } from "@/lib/supabase-server";
import { rpc } from "@/lib/supabase-rpc";
import type { EleveRlsRow } from "@/types/supabase-rls-types";

/**
 * GET /api/supabase/eleves/[id]
 * Un élève par ID via le client Supabase typé avec RLS.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Rate limit
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 60, windowSec: 60, key: "sb-eleve-id:" + ip });
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
  const denied = checkPermission(session.user.role, "eleves:read");
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Stockage non configuré" }, { status: 503 });
  }

  const ctx = await getRlsContextFromSession();
  if (!ctx) {
    return NextResponse.json({ error: "Session sans tenant" }, { status: 401 });
  }

  const { data, error } = await rpc<EleveRlsRow>(supabase, "eleve_by_id_with_rls", {
    ...rlsParams(ctx),
    p_eleve_id: id,
  });

  if (error) {
    console.error("[API/supabase/eleves/id]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  return NextResponse.json({ data: data[0] });
}
