import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { canAccessRoute } from "@/lib/permissions";

/**
 * Routes joignables sans session, comparées par **préfixe**.
 * `"/"` en est volontairement absent : `"/".startsWith` étant vrai pour tout
 * chemin, sa présence ici rendait publique la totalité de l'application. La
 * racine est traitée à part, en égalité stricte.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/select-tenant",
  "/offline",
  "/api/auth",
  "/_next",
];

/** Chemins publics en correspondance exacte. */
const PUBLIC_EXACT = new Set(["/", "/offline"]);

/** Familles d'API qui portent leur propre authentification (signature, cron). */
const SELF_AUTH_API = ["/api/auth", "/api/cron", "/api/webhooks"];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  // Segment complet exigé : `/loginfoo` ne doit pas hériter de `/login`.
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Les routes API gardent leur propre autorisation (`authorize` /
  // `checkPermission`), qui sait en plus filtrer les données par périmètre.
  // Le middleware ne peut pas la remplacer : il ne voit pas la ressource.
  if (pathname.startsWith("/api/")) {
    if (SELF_AUTH_API.some((r) => pathname.startsWith(r))) return NextResponse.next();
    return NextResponse.next();
  }

  // JWT décodé directement depuis le cookie. `auth()` de NextAuth ne remonte
  // pas `role` dans le runtime Edge du middleware.
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (token.role as string) ?? "";

  if (!canAccessRoute(role, pathname)) {
    return NextResponse.redirect(new URL("/acces-bloque", req.url));
  }

  // Le chemin est réinjecté en en-tête de requête : un Server Component n'a
  // aucun autre moyen de savoir quelle route il sert, et `guardPage` en a
  // besoin pour retrouver la règle sans que chaque page la redéclare.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf).*$).*)",
  ],
};
