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

  // Les endpoints /api/test/* n'existent que pour le développement : ils
  // envoient des messages (WhatsApp/Telegram/SMS) vers des numéros arbitraires
  // et créent des données. Bloqués en production, sans exception, quel que soit
  // l'appelant — un seul point de contrôle qu'aucun nouvel endpoint de test ne
  // peut contourner.
  if (process.env.NODE_ENV === "production" && pathname.startsWith("/api/test")) {
    return new NextResponse(null, { status: 404 });
  }

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
  // On passe secureCookie et cookieName explicitement car getToken ne les
  // déduit pas automatiquement depuis le NextRequest.
  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie,
    cookieName: secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ─── Rôle sensible sans double authentification configurée ──────────────
  // L'accès est restreint à la page de configuration tant que le second
  // facteur n'est pas en place. Ce n'est PAS la barrière de sécurité — la
  // vérification du code, elle, a lieu dans `authorize`, avant l'émission du
  // jeton, et ne peut donc pas être contournée en appelant l'API. Ici, on ne
  // fait qu'accompagner l'utilisateur vers la configuration.
  //
  // Vaut toujours false tant que TWO_FACTOR_GRACE_DAYS n'est pas défini :
  // personne ne se retrouve enfermé dehors par un simple déploiement.
  if (
    token.twoFactorSetupRequired === true &&
    !pathname.startsWith("/profil/securite")
  ) {
    return NextResponse.redirect(new URL("/profil/securite?2fa=requis", req.url));
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
