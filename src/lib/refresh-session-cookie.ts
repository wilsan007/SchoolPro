import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { deriveClaims, CLAIMS_VERSION } from "@/lib/tenant-claims";

/**
 * Re-encode le JWT de session depuis la base de données et retourne
 * la chaîne `Set-Cookie` complète à poser manuellement sur la réponse.
 *
 * **Pourquoi cette fonction existe :**
 * `unstable_update()` de next-auth v5 beta ne persiste **pas** le cookie
 * de session dans un Route Handler (uniquement dans les Server Actions).
 * `response.cookies.set()` non plus ne fonctionne pas reliably dans un
 * Route Handler avec Next.js 15 — le header `Set-Cookie` n'est pas
 * transmis au client. La seule méthode fiable est de construire la
 * chaîne `Set-Cookie` manuellement et de la passer via `headers` à
 * `NextResponse.json()`.
 *
 * @param userId  ID de l'utilisateur connecté
 * @param tenantId Tenant actif (preferred) pour deriveClaims
 * @returns `{ claims, setCookie }` où `setCookie` est la valeur brute
 *          du header `Set-Cookie`, ou `null` si l'utilisateur est
 *          introuvable.
 */
export async function refreshSessionCookie(
  userId: string,
  tenantId: string,
): Promise<{ claims: NonNullable<Awaited<ReturnType<typeof deriveClaims>>>; setCookie: string } | null> {
  const claims = await deriveClaims(userId, tenantId);
  if (!claims) return null;

  const isSecure =
    process.env.NODE_ENV === "production" || !!process.env.VERCEL;
  const cookieName = isSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const maxAge = 30 * 24 * 60 * 60;

  const newToken = {
    id: userId,
    role: claims.role,
    tenantId: claims.tenantId,
    country: claims.country,
    siteId: claims.siteId,
    siteIds: claims.siteIds,
    tenantHasSites: claims.tenantHasSites,
    availableTenants: claims.availableTenants,
    availableRoles: claims.availableRoles,
    claimsVersion: CLAIMS_VERSION,
    mustChangePassword: false,
    impersonating: false,
    impersonatedTenantId: null,
    impersonatedTenantName: null,
    impersonatedUserEmail: null,
    originalRole: null,
    originalTenantId: null,
  };

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("[refreshSessionCookie] AUTH_SECRET is missing!");
    return null;
  }

  let encodedJwt: string;
  try {
    encodedJwt = await encode({
      token: newToken,
      secret,
      salt: cookieName,
      maxAge,
    });
  } catch (err) {
    console.error("[refreshSessionCookie] encode() failed:", err);
    return null;
  }

  // Construire la chaîne Set-Cookie manuellement — c'est la seule
  // méthode 100% fiable dans un Route Handler Next.js 15.
  const setCookie =
    `${cookieName}=${encodedJwt}; ` +
    `Path=/; ` +
    `Max-Age=${maxAge}; ` +
    `SameSite=Lax; ` +
    `HttpOnly` +
    (isSecure ? "; Secure" : "");

  return { claims, setCookie };
}
