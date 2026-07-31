import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authConfig, type AvailableTenant } from "@/auth.config";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Surcharge le callback `jwt` de `auth.config.ts` pour y ajouter un accès
     * base de données. Le callback de base ne peut pas utiliser Prisma car il
     * est aussi exécuté par le middleware (edge runtime).
     *
     * Le `trigger === "update"` est déclenché par `unstable_update()` après un
     * changement d'établissement : on relit alors le tenant actif depuis la base
     * (source de vérité) pour rafraîchir le JWT.
     */
    async jwt({ token, user, trigger, session }) {
      const baseJwt = authConfig.callbacks?.jwt;
      if (baseJwt) {
        const result = await baseJwt({ token, user, trigger, session } as never);
        if (result) token = result;
      }

      if (trigger === "update" && token.id) {
        const userTenants = await prisma.userTenant.findMany({
          where: { userId: token.id as string, isActive: true },
          select: {
            tenantId: true,
            role: true,
            isDefault: true,
            tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
          },
        });

        const activeUt = userTenants.find((ut) => ut.isDefault) ?? userTenants[0];
        if (activeUt) {
          token.tenantId = activeUt.tenantId;
          token.role = activeUt.role;
          token.availableTenants = userTenants.map((ut) => ({
            tenantId: ut.tenantId,
            tenantName: ut.tenant.name,
            tenantSlug: ut.tenant.slug,
            tenantLogo: ut.tenant.logoUrl,
            role: ut.role,
            isDefault: ut.isDefault,
          }));
        }

        // Rafraîchir aussi le siteId depuis la base
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { siteId: true },
        });
        token.siteId = freshUser?.siteId ?? null;
      }

      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            tenantId: true,
            siteId: true,
            avatarUrl: true,
            isActive: true,
            userTenants: {
              where: { isActive: true },
              select: {
                tenantId: true,
                role: true,
                isDefault: true,
                tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
              },
            },
          },
        });

        if (!user || !user.password || !user.isActive) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

        // Mettre à jour lastLoginAt
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Multi-tenant: déterminer le tenant actif
        const tenants = user.userTenants;
        let activeTenantId = user.tenantId;
        let activeRole = user.role;

        if (tenants.length > 0) {
          // Chercher le tenant par défaut, sinon le premier
          const defaultUt = tenants.find((ut) => ut.isDefault) ?? tenants[0];
          activeTenantId = defaultUt.tenantId;
          activeRole = defaultUt.role;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: activeRole,
          tenantId: activeTenantId,
          siteId: user.siteId,
          availableTenants: tenants.map((ut) => ({
            tenantId: ut.tenantId,
            tenantName: ut.tenant.name,
            tenantSlug: ut.tenant.slug,
            tenantLogo: ut.tenant.logoUrl,
            role: ut.role,
            isDefault: ut.isDefault,
          })),
        };
      },
    }),
  ],
});

// Types augmentés NextAuth
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role: Role;
      tenantId: string | null;
      availableTenants?: AvailableTenant[];
    };
  }
}
