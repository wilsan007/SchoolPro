import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { deriveClaims, resolveSiteAccess } from "@/lib/tenant-claims";
import { auditFire } from "@/lib/audit";

const BodySchema = z.object({
  // `null` = « tous les sites » (direction générale uniquement).
  siteId: z.string().min(1).nullable(),
});

/**
 * POST /api/switch-site — bascule le site actif de l'utilisateur.
 *
 * Toutes les vérifications sont bornées au **tenant actif de la session**.
 * C'est le point essentiel : `UserSite` ne porte pas de `tenantId`, si bien que
 * l'implémentation précédente acceptait n'importe quel `siteId` pour lequel
 * l'utilisateur possédait une ligne `UserSite`, y compris dans un AUTRE
 * établissement — et adoptait le rôle qui y était inscrit. Un compte simple
 * dans l'établissement A, administrateur dans l'établissement B, pouvait ainsi
 * devenir administrateur de A.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Aucun établissement actif" }, { status: 403 });
    }

    let parsed;
    try {
      parsed = BodySchema.safeParse(await req.json());
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }
    if (!parsed.success) {
      return NextResponse.json({ error: "siteId invalide" }, { status: 400 });
    }

    const { siteId } = parsed.data;
    const userId = session.user.id;

    if (siteId) {
      // Site précis : doit appartenir au tenant actif ET être autorisé.
      const access = await resolveSiteAccess(userId, tenantId, siteId);
      if (!access) {
        auditFire({
          userId,
          tenantId,
          action: "switch-site",
          verdict: "DENIED",
          resource: "site",
          resourceId: siteId,
          reason: "Accès refusé à ce site",
        });
        return NextResponse.json({ error: "Accès refusé à ce site" }, { status: 403 });
      }
    } else {
      // « Tous les sites » : réservé à la direction générale du tenant actif.
      // Le rôle est relu depuis l'adhésion au tenant, jamais depuis la colonne
      // `User.role` qu'une bascule antérieure a pu écraser.
      const membership = await prisma.userTenant.findFirst({
        where: { userId, tenantId, isActive: true },
        select: { role: true },
      });
      // eslint-disable-next-line ecolpro/require-site-filter, ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté pour le rôle
      const fallback = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tenantId: true },
      });
      if (!fallback) {
        return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
      }
      const tenantRole =
        membership?.role ?? (fallback.tenantId === tenantId ? fallback.role : null);

      if (tenantRole !== "TENANT_ADMIN" && tenantRole !== "SUPER_ADMIN") {
        auditFire({
          userId,
          tenantId,
          action: "switch-site",
          verdict: "DENIED",
          reason: "Tentative d'accès multi-sites sans privilèges admin",
          metadata: { role: tenantRole },
        });
        return NextResponse.json(
          { error: "Accès refusé : seuls les administrateurs peuvent voir tous les sites" },
          { status: 403 }
        );
      }
    }

    // Persister uniquement le site sélectionné. Le rôle effectif n'est PAS
    // écrit sur `User` : il est dérivé du couple (tenant actif, site actif) par
    // `deriveClaims`. L'ancienne version écrasait `User.role` à chaque bascule,
    // ce qui rendait une élévation de privilèges persistante et faussait le
    // rôle dans les autres établissements de l'utilisateur.
    // eslint-disable-next-line ecolpro/require-tenant-id -- self-lookup de l'utilisateur connecté, userId provient de la session
    await prisma.user.update({
      where: { id: userId },
      data: { siteId },
    });

    // Régénérer le JWT depuis la base (source de vérité).
    await unstable_update({ user: { siteId } } as never);

    const claims = await deriveClaims(userId, tenantId);
    if (!claims) {
      auditFire({
        userId,
        tenantId,
        action: "switch-site",
        verdict: "DENIED",
        reason: "deriveClaims a retourné null après bascule",
      });
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    // Liste des sites proposables, strictement bornée aux droits de l'utilisateur.
    const isTenantWide = claims.role === "TENANT_ADMIN" || claims.role === "SUPER_ADMIN";
    const sites = await prisma.site.findMany({
      where: {
        tenantId,
        actif: true,
        ...(isTenantWide ? {} : { id: { in: claims.siteIds } }),
      },
      select: { id: true, nom: true, code: true },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json({
      success: true,
      activeSiteId: claims.siteId,
      activeRole: claims.role,
      sites,
    });
  } catch (error) {
    console.error("Erreur switch site:", error);
    return NextResponse.json(
      { error: "Erreur lors du changement de site" },
      { status: 500 }
    );
  }
}
