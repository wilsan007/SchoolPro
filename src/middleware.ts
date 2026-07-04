import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login", "/register", "/api/auth", "/", "/_next"];

// Routes API à authentification propre (secret cron / signature webhook) :
// elles n'ont pas de session utilisateur et ne doivent pas être bloquées ici.
const SELF_AUTH_API = ["/api/auth", "/api/cron", "/api/webhooks"];

export default auth(async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = (req as unknown as { auth: { user?: { id: string } } }).auth;

  // Laisser passer les routes publiques
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  if (isPublic) return NextResponse.next();

  // Routes API
  if (pathname.startsWith("/api/")) {
    // Endpoints à auth propre (cron, webhooks) : la vérification se fait dans le handler.
    if (SELF_AUTH_API.some((r) => pathname.startsWith(r))) {
      return NextResponse.next();
    }
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Rediriger vers login si non authentifié
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
