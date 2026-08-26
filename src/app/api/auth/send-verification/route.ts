import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { normaliserEmail } from "@/lib/email";
import { envoyerEmailVerification } from "@/lib/email-verification";
import { auditFire } from "@/lib/audit";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";

const BodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  // ─── Rate limiting : 3 requêtes / 15 min / IP ───────────────────────────
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 3, windowSec: 900, key: `send-verify:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json({ success: true }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: true });
  }

  let email = parsed.data.email;
  if (!email) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: true });
    }
    email = session.user.email;
  }

  const normalized = normaliserEmail(email);

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- recherche utilisateur hors session
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, tenantId: true, name: true },
  });

  auditFire({
    userId: user?.id ?? null,
    tenantId: user?.tenantId ?? null,
    action: "auth:send-verification",
    verdict: "ALLOWED",
    resource: "user",
    resourceId: user?.id,
    metadata: { email: normalized },
  });

  if (!user) {
    return NextResponse.json({ success: true });
  }

  try {
    await envoyerEmailVerification(normalized, user.name);
  } catch (err) {
    console.error("[send-verification] Erreur envoi:", err);
  }

  return NextResponse.json({ success: true });
}
