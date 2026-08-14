import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { roleHasPermission, type Permission } from "@/lib/rbac";
import type { Role } from "@prisma/client";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login", "/register", "/api/auth", "/", "/_next", "/select-tenant"];

const SELF_AUTH_API = ["/api/auth", "/api/cron", "/api/webhooks"];

/**
 * Mapping route → permission requise.
 * Le middleware applique cette vérification en plus du guardPage côté page.
 * Double défense : si le guardPage ne redirige pas (bug dev mode), le
 * middleware bloque l'accès avant que la page ne rende.
 */
const ROUTE_PERMISSIONS: { pattern: RegExp; permission: Permission | Permission[]; roles?: Role[] }[] = [
  // Direction / pilotage — réservé à la direction et au chef d'établissement
  { pattern: /^\/direction$/, permission: "analytics:read", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "COUNSELOR"] },
  { pattern: /^\/analytics$/, permission: "analytics:read" },
  { pattern: /^\/rapports$/, permission: "rapports:read" },

  // Gestion financière — réservé à la direction et au comptable
  { pattern: /^\/facturation$/, permission: "finance:read" },
  { pattern: /^\/inventaire$/, permission: "inventaire:read" },

  // Ressources humaines — réservé à la direction
  { pattern: /^\/rh$/, permission: "rh:read" },

  // Paramètres — réservé à la direction (expose users, classes, matières…)
  { pattern: /^\/parametres$/, permission: "eleves:write" },

  // Pédagogie — enseignants et au-dessus
  { pattern: /^\/eleves/, permission: "eleves:read" },
  { pattern: /^\/notes(?!\/bulletins)/, permission: "notes:read" },
  { pattern: /^\/notes\/bulletins/, permission: "bulletins:read" },
  { pattern: /^\/evaluations/, permission: "evaluations:read" },
  { pattern: /^\/curriculum/, permission: "evaluations:read" },
  { pattern: /^\/recommandations/, permission: "eleves:read" },
  { pattern: /^\/admissions/, permission: "admissions:read" },
  { pattern: /^\/absences/, permission: "absences:read" },

  // Vie scolaire — PP, CPE, direction
  { pattern: /^\/vie-scolaire/, permission: "vie-scolaire:read" },

  // Communication
  { pattern: /^\/communication/, permission: "communication:read" },

  // Espace enseignant
  { pattern: /^\/mon-espace$/, permission: "eleves:read" },
  { pattern: /^\/ma-classe$/, permission: "eleves:read" },

  // Espace parent — réservé au rôle PARENT
  { pattern: /^\/parent$/, permission: "notes:read", roles: ["PARENT"] },

  // Espace élève — réservé au rôle STUDENT
  { pattern: /^\/eleve$/, permission: "notes:read", roles: ["STUDENT"] },

  // Entraînement — élèves et enseignants
  { pattern: /^\/entrainement/, permission: "entrainement:read" },
];

function findRoutePermission(pathname: string): { permission: Permission | Permission[]; roles?: Role[] } | null {
  for (const route of ROUTE_PERMISSIONS) {
    if (route.pattern.test(pathname)) {
      return { permission: route.permission, roles: route.roles };
    }
  }
  return null;
}

export default auth(async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (SELF_AUTH_API.some((r) => pathname.startsWith(r))) {
      return NextResponse.next();
    }
    const session = (req as unknown as { auth: { user?: { id: string } } }).auth;
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const session = (req as unknown as { auth: { user?: { id: string; role?: Role; tenantId?: string } } }).auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Vérification RBAC au niveau du middleware
  const routePerm = findRoutePermission(pathname);
  if (routePerm) {
    const role = session.user.role as Role;
    console.log(`[middleware] pathname=${pathname} role=${role} perm=${JSON.stringify(routePerm.permission)}`);

    // Si des rôles spécifiques sont requis, vérifier d'abord
    if (routePerm.roles && !routePerm.roles.includes(role)) {
      const dashboardUrl = new URL("/dashboard", req.url);
      return NextResponse.redirect(dashboardUrl);
    }

    // Vérifier la permission RBAC
    const needed = Array.isArray(routePerm.permission) ? routePerm.permission : [routePerm.permission];
    const allowed = needed.some((p) => roleHasPermission(role, p));
    if (!allowed) {
      const dashboardUrl = new URL("/dashboard", req.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf).*$).*)",
  ],
};
