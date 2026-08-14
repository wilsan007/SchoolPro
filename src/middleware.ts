import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login", "/register", "/api/auth", "/", "/_next", "/select-tenant"];

const SELF_AUTH_API = ["/api/auth", "/api/cron", "/api/webhooks"];

/**
 * Matrice RBAC inline — évite d'importer @/lib/rbac qui entraîne Prisma
 * (incompatible avec le runtime edge du middleware).
 * Source de vérité : src/lib/rbac.ts. Ne pas diverger.
 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["*"],
  TENANT_ADMIN: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "emploi-du-temps:*", "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:*", "finance:*", "inventaire:*", "alumni:*",
    "orientation:*", "cours:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "audit:read", "entrainement:*",
  ],
  PRINCIPAL: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "emploi-du-temps:*", "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:read", "finance:read", "inventaire:*", "alumni:*",
    "orientation:*", "cours:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "entrainement:*",
  ],
  SECRETARY: [
    "eleves:*", "parents:*", "classes:read", "matieres:read",
    "absences:*", "emploi-du-temps:*", "communication:read", "communication:send",
    "messages:*", "admissions:*", "examens:read", "inventaire:read",
    "documents:*", "alumni:read", "bulletins:read", "rapports:read",
  ],
  TEACHER: [
    "eleves:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:read", "absences:write",
    "bulletins:read", "emploi-du-temps:read", "messages:*",
    "cours:*", "analytics:read", "examens:read", "ai:teacher",
    "entrainement:*",
  ],
  CLASS_TEACHER: [
    "eleves:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:*",
    "bulletins:read", "bulletins:write", "bulletins:publish",
    "emploi-du-temps:read", "messages:*", "cours:*",
    "vie-scolaire:*", "orientation:read", "orientation:write",
    "analytics:read", "examens:read", "parents:read", "ai:teacher",
    "entrainement:*",
  ],
  COUNSELOR: [
    "eleves:read", "absences:read", "vie-scolaire:*", "orientation:*",
    "messages:*", "parents:read", "communication:read", "analytics:read",
  ],
  NURSE: [
    "eleves:read", "absences:read", "messages:read", "messages:write",
  ],
  ACCOUNTANT: [
    "finance:*", "rh:*", "eleves:read", "parents:read", "inventaire:*",
    "analytics:read", "messages:*", "rapports:read",
  ],
  PARENT: [
    "bulletins:read", "absences:read", "notes:read", "messages:*",
    "communication:read", "cours:read", "orientation:read",
    "emploi-du-temps:read", "ai:parent", "entrainement:read",
  ],
  STUDENT: [
    "bulletins:read", "absences:read", "notes:read",
    "messages:read", "messages:reply",
    "communication:read", "cours:*", "emploi-du-temps:read",
    "entrainement:read", "entrainement:write",
  ],
};

function roleHasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  if (perms.includes("*")) return true;
  if (perms.includes(permission)) return true;
  const moduleName = permission.split(":")[0];
  if (perms.includes(`${moduleName}:*`)) return true;
  return false;
}

/**
 * Mapping route → permission requise.
 * Le middleware applique cette vérification en plus du guardPage côté page.
 */
const ROUTE_PERMISSIONS: { pattern: RegExp; permission: string | string[]; roles?: string[] }[] = [
  // Direction / pilotage
  { pattern: /^\/direction$/, permission: "analytics:read", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "COUNSELOR"] },
  { pattern: /^\/analytics$/, permission: "analytics:read" },
  { pattern: /^\/rapports$/, permission: "rapports:read" },

  // Finance
  { pattern: /^\/facturation$/, permission: "finance:read" },
  { pattern: /^\/inventaire$/, permission: "inventaire:read" },

  // RH
  { pattern: /^\/rh$/, permission: "rh:read" },

  // Paramètres — réservé à la direction
  { pattern: /^\/parametres$/, permission: "eleves:write" },

  // Pédagogie
  { pattern: /^\/eleves/, permission: "eleves:read" },
  { pattern: /^\/notes(?!\/bulletins)/, permission: "notes:read" },
  { pattern: /^\/notes\/bulletins/, permission: "bulletins:read" },
  { pattern: /^\/evaluations/, permission: "evaluations:read" },
  { pattern: /^\/curriculum/, permission: "evaluations:read" },
  { pattern: /^\/recommandations/, permission: "eleves:read" },
  { pattern: /^\/admissions/, permission: "admissions:read" },
  { pattern: /^\/absences/, permission: "absences:read" },

  // Vie scolaire
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

  // Entraînement
  { pattern: /^\/entrainement/, permission: "entrainement:read" },
];

function findRoutePermission(pathname: string): { permission: string | string[]; roles?: string[] } | null {
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

  const session = (req as unknown as { auth: { user?: { id: string; role?: string; tenantId?: string } } }).auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Vérification RBAC au niveau du middleware
  const routePerm = findRoutePermission(pathname);
  if (routePerm) {
    const role = (session.user.role ?? "") as string;

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
