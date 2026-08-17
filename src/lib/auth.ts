import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authConfig, type AvailableTenant } from "@/auth.config";
import { deriveClaims, CLAIMS_VERSION } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";

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

      // — Impersonation : gestion du flag et des champs de session —
      // `unstable_update({ user: { impersonating, ... } })` est appelé par la
      // route /api/super-admin/impersonate. On stocke ici les champs dans le
      // token pour qu'ils soient exposés via le callback `session`.
      if (trigger === "update" && session) {
        const s = session as {
          impersonating?: boolean;
          impersonatedTenantId?: string | null;
          impersonatedTenantName?: string | null;
          impersonatedUserEmail?: string | null;
          originalRole?: string | null;
          originalTenantId?: string | null;
          clearImpersonation?: boolean;
        };
        if (s.clearImpersonation) {
          token.impersonating = false;
          token.impersonatedTenantId = null;
          token.impersonatedTenantName = null;
          token.impersonatedUserEmail = null;
          token.originalRole = null;
          token.originalTenantId = null;
        } else if (s.impersonating !== undefined) {
          token.impersonating = s.impersonating;
          token.impersonatedTenantId = s.impersonatedTenantId ?? null;
          token.impersonatedTenantName = s.impersonatedTenantName ?? null;
          token.impersonatedUserEmail = s.impersonatedUserEmail ?? null;
          token.originalRole = s.originalRole ?? null;
          token.originalTenantId = s.originalTenantId ?? null;
        }
      }

      // Ré-hydratation depuis la base — la base est la seule source de vérité
      // pour le périmètre d'accès. Déclenchée :
      //  - par `unstable_update()` après un changement de tenant ou de site ;
      //  - dès qu'un JWT porte une version de revendications périmée, afin que
      //    les jetons émis avant ce durcissement soient corrigés sans exiger
      //    une reconnexion (et ne conservent pas un périmètre trop large).
      const isStale = token.claimsVersion !== CLAIMS_VERSION;

      if (token.id && (trigger === "update" || isStale)) {
        // Tenant demandé par `unstable_update({ user: { tenantId } })`. Ce n'est
        // qu'une *préférence* : `deriveClaims` ne la retient que si
        // l'utilisateur possède une adhésion active à ce tenant. Une valeur
        // arbitraire ne peut donc pas faire franchir la frontière tenant.
        const requestedTenantId =
          (session as { tenantId?: string | null } | undefined)?.tenantId ??
          (session as { user?: { tenantId?: string | null } } | undefined)?.user?.tenantId ??
          (token.tenantId as string | null) ??
          null;

        // En impersonation, on force le tenant demandé sans passer par
        // deriveClaims (le SUPER_ADMIN n'a pas forcément d'adhésion au tenant
        // cible). On conserve le rôle SUPER_ADMIN mais on bascule le tenantId.
        if (token.impersonating && token.originalTenantId) {
          // Restaurer le tenant original si on quitte l'impersonation
          // (géré par clearImpersonation ci-dessus), sinon garder le tenant cible
          token.tenantId = requestedTenantId;
          token.country = null; // L'impersonation ne propage pas le pays (super-admin global)
          token.siteId = null;
          token.siteIds = [];
          token.tenantHasSites = true;
          token.claimsVersion = CLAIMS_VERSION;
          return token;
        }

        const claims = await deriveClaims(token.id as string, requestedTenantId);

        if (!claims) {
          // Compte désactivé ou supprimé : on vide le périmètre plutôt que de
          // laisser un jeton porter des droits obsolètes.
          token.tenantId = null;
          token.country = null;
          token.siteId = null;
          token.siteIds = [];
          token.tenantHasSites = true;
          token.availableTenants = [];
          token.availableRoles = [];
          token.claimsVersion = CLAIMS_VERSION;
          return token;
        }

        token.tenantId = claims.tenantId;
        token.country = claims.country;
        token.role = claims.role;
        token.siteId = claims.siteId;
        token.siteIds = claims.siteIds;
        token.tenantHasSites = claims.tenantHasSites;
        token.availableTenants = claims.availableTenants;
        token.availableRoles = claims.availableRoles;
        token.claimsVersion = claims.claimsVersion;
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

        // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- login: no session exists yet, user must be looked up across all sites/tenants
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            avatarUrl: true,
            isActive: true,
            mustChangePassword: true,
          },
        });

        if (!user || !user.password || !user.isActive) {
          auditFire({
            action: "auth:login",
            verdict: "DENIED",
            resource: "user",
            resourceId: user?.id,
            reason: !user ? "Utilisateur introuvable" : !user.password ? "Compte sans mot de passe" : "Compte désactivé",
            metadata: { email },
          });
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
          auditFire({
            userId: user.id,
            action: "auth:login",
            verdict: "DENIED",
            resource: "user",
            resourceId: user.id,
            reason: "Mot de passe incorrect",
            metadata: { email },
          });
          return null;
        }

        // Mettre à jour lastLoginAt — l'id provient du compte dont le mot de
        // passe vient d'être vérifié ci-dessus (ligne 118), pas d'une entrée
        // utilisateur : aucune vérification d'appartenance supplémentaire
        // n'est possible ni nécessaire à ce stade (avant même l'émission du JWT).
        // eslint-disable-next-line ecolpro/require-tenant-id
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Le périmètre (tenant, sites, rôle) est dérivé par la même fonction
        // qu'au changement de tenant/site : une seule logique, donc pas de
        // divergence possible entre la connexion et les bascules ultérieures.
        // L'ancienne version calculait `siteIds` à partir des seules lignes
        // `UserSite`, sans les affectations d'enseignants et sans borner au
        // tenant actif : un enseignant se connectait avec `siteIds` vide et
        // échappait donc au filtrage par site.
        const claims = await deriveClaims(user.id);
        if (!claims) {
          auditFire({
            userId: user.id,
            action: "auth:login",
            verdict: "DENIED",
            reason: "deriveClaims a retourné null lors de la connexion",
          });
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: claims.role,
          tenantId: claims.tenantId,
          country: claims.country,
          siteId: claims.siteId,
          siteIds: claims.siteIds,
          tenantHasSites: claims.tenantHasSites,
          availableTenants: claims.availableTenants,
          availableRoles: claims.availableRoles,
          claimsVersion: claims.claimsVersion,
          mustChangePassword: user.mustChangePassword,
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
      /** Code ISO pays du tenant actif (ex: "DJ", "SN"). Sert au filtrage
       *  des modèles partagés par pays (Question, Chapitre, Competence, Cours). */
      country?: string | null;
      /** Site sélectionné, garanti appartenir au tenant actif. */
      siteId?: string | null;
      /** Sites du tenant actif auxquels l'utilisateur est rattaché. */
      siteIds?: string[];
      /** Le tenant actif possède-t-il au moins un site ? */
      tenantHasSites?: boolean;
      availableTenants?: AvailableTenant[];
      /** Tous les rôles possédés dans le tenant actif (pour le RoleSwitcher). */
      availableRoles?: Role[];
      /** L'utilisateur doit changer son mot de passe au prochain login. */
      mustChangePassword?: boolean;
      /** Impersonation : vrai si le SUPER_ADMIN a pris le contrôle d'un tenant. */
      impersonating?: boolean;
      /** Tenant cible de l'impersonation. */
      impersonatedTenantId?: string | null;
      /** Nom du tenant cible (pour la bannière). */
      impersonatedTenantName?: string | null;
      /** Email de l'utilisateur cible (pour la bannière). */
      impersonatedUserEmail?: string | null;
      /** Rôle original avant impersonation. */
      originalRole?: Role | null;
      /** Tenant original avant impersonation. */
      originalTenantId?: string | null;
    };
  }
}
