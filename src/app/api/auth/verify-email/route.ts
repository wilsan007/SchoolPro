import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { confirmerEmail } from "@/lib/email-verification";
import { auditFire } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const BodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // ─── Rate limiting : 10 requêtes / 15 min / IP ──────────────────────────
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 10, windowSec: 900, key: `verify-email:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "token_invalide" },
      { status: 400 }
    );
  }

  const result = await confirmerEmail(parsed.data.token);

  if (!result.success) {
    auditFire({
      action: "auth:verify-email",
      verdict: "DENIED",
      resource: "user",
      reason: result.error,
    });
    return NextResponse.json(
      { success: false, error: result.error ?? "token_invalide" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
