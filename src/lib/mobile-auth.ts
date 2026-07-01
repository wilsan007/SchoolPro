import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface MobileUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

export async function verifyMobileToken(req: NextRequest): Promise<MobileUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(
      process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "ecolpro-dev-secret"
    );
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
      tenantId: (payload.tenantId as string) ?? null,
    };
  } catch {
    return null;
  }
}

export function mobileUnauthorized() {
  return NextResponse.json({ error: "Token invalide ou expiré" }, { status: 401 });
}
