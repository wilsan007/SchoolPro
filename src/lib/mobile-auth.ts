import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { deriveClaims } from "@/lib/tenant-claims";
import type { SessionSiteClaims } from "@/lib/site-filter";

export interface MobileUser {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
}

/**
 * Périmètre complet d'un client mobile : identité issue du jeton, périmètre
 * (tenant, sites, rôle) relu depuis la base.
 */
export type MobileScope = MobileUser & SessionSiteClaims;

function mobileSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Le repli en dur signifiait qu'une plateforme déployée sans AUTH_SECRET
    // acceptait des jetons forgés par quiconque connaît la valeur par défaut.
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET est requis pour vérifier les jetons mobiles");
    }
    return new TextEncoder().encode("ecolpro-dev-secret");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyMobileToken(req: NextRequest): Promise<MobileUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, mobileSecret());
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

/**
 * Vérifie le jeton PUIS relit le périmètre depuis la base.
 *
 * Les jetons mobiles ne portent aucune revendication de site : utiliser
 * `verifyMobileToken` seul rend une route aveugle au découpage par site, et
 * donc ouverte à la lecture des données de n'importe quel site du tenant.
 * Relire depuis la base garantit également qu'un rattachement révoqué prend
 * effet immédiatement, sans attendre l'expiration du jeton.
 */
export async function verifyMobileScope(req: NextRequest): Promise<MobileScope | null> {
  const user = await verifyMobileToken(req);
  if (!user) return null;

  const claims = await deriveClaims(user.id, user.tenantId);
  if (!claims || !claims.tenantId) return null;

  return {
    ...user,
    tenantId: claims.tenantId,
    role: claims.role,
    siteId: claims.siteId,
    siteIds: claims.siteIds,
    tenantHasSites: claims.tenantHasSites,
  };
}

export function mobileUnauthorized() {
  return NextResponse.json({ error: "Token invalide ou expiré" }, { status: 401 });
}
