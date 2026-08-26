import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auditFire } from "@/lib/audit";
import { verifierTokenReset, reinitialiserMotDePasse } from "@/lib/password-reset";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const BodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  // ─── Rate limiting : 10 requêtes / 15 min / IP ──────────────────────────
  const ip = getClientIP(request);
  const rl = rateLimit({ max: 10, windowSec: 900, key: `reset-pwd:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "invalid_data" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  const verification = await verifierTokenReset(token);
  if (!verification.valid) {
    auditFire({
      action: "auth:reset-password",
      verdict: "DENIED",
      resource: "user",
      reason: verification.error ?? "Token invalide",
      metadata: { token },
    });
    return NextResponse.json(
      { success: false, error: "invalid_token" },
      { status: 400 }
    );
  }

  const result = await reinitialiserMotDePasse(token, password);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: "reset_failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
