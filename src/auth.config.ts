import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

export interface AvailableTenant {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogo: string | null;
  role: Role;
  isDefault: boolean;
}

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.siteId = (user as { siteId?: string | null }).siteId ?? null;
        token.siteIds = (user as { siteIds?: string[] }).siteIds ?? [];
        token.tenantHasSites = (user as { tenantHasSites?: boolean }).tenantHasSites ?? true;
        token.claimsVersion = (user as { claimsVersion?: number }).claimsVersion;
        // Stocker la liste des tenants accessibles pour le switcher
        const availableTenants = (user as { availableTenants?: AvailableTenant[] }).availableTenants;
        if (availableTenants) {
          token.availableTenants = availableTenants;
        }
        // Stocker la liste des rôles possédés dans le tenant actif
        const availableRoles = (user as { availableRoles?: Role[] }).availableRoles;
        if (availableRoles) {
          token.availableRoles = availableRoles;
        }
        // mustChangePassword : forçage du changement au 1er login
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: Role }).role = token.role as Role;
        (session.user as { tenantId?: string | null }).tenantId = token.tenantId as string | null;
        (session.user as { siteId?: string | null }).siteId = token.siteId as string | null;
        (session.user as { siteIds?: string[] }).siteIds = (token.siteIds as string[] | undefined) ?? [];
        // Par défaut `true` : en l'absence d'information, on suppose que
        // l'isolation par site s'applique (fail-closed).
        (session.user as { tenantHasSites?: boolean }).tenantHasSites =
          (token.tenantHasSites as boolean | undefined) ?? true;
        (session.user as { availableTenants?: AvailableTenant[] }).availableTenants = token.availableTenants as AvailableTenant[] | undefined;
        // Rôles possédés dans le tenant actif (pour le RoleSwitcher)
        (session.user as { availableRoles?: Role[] }).availableRoles =
          (token.availableRoles as Role[] | undefined) ?? [];
        // mustChangePassword : forçage du changement au 1er login
        (session.user as { mustChangePassword?: boolean }).mustChangePassword =
          (token.mustChangePassword as boolean | undefined) ?? false;
        // Impersonation : expose les champs au session pour la bannière
        (session.user as { impersonating?: boolean }).impersonating = (token.impersonating as boolean | undefined) ?? false;
        (session.user as { impersonatedTenantId?: string | null }).impersonatedTenantId = (token.impersonatedTenantId as string | null | undefined) ?? null;
        (session.user as { impersonatedTenantName?: string | null }).impersonatedTenantName = (token.impersonatedTenantName as string | null | undefined) ?? null;
        (session.user as { impersonatedUserEmail?: string | null }).impersonatedUserEmail = (token.impersonatedUserEmail as string | null | undefined) ?? null;
        (session.user as { originalRole?: Role | null }).originalRole = (token.originalRole as Role | null | undefined) ?? null;
        (session.user as { originalTenantId?: string | null }).originalTenantId = (token.originalTenantId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  providers: [],
};
