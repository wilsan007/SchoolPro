import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { tenantId } = await req.json();
    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json({ error: "tenantId requis" }, { status: 400 });
    }

    // Vérifier que l'utilisateur a bien accès à ce tenant
    const userTenant = await prisma.userTenant.findFirst({
      where: {
        userId: session.user.id,
        tenantId,
        isActive: true,
      },
      select: {
        role: true,
        isDefault: true,
        tenant: {
          select: { id: true, name: true, slug: true, logoUrl: true },
        },
      },
    });

    if (!userTenant) {
      return NextResponse.json(
        { error: "Accès refusé à ce tenant" },
        { status: 403 }
      );
    }

    // Mettre à jour le tenant par défaut de l'utilisateur
    await prisma.$transaction([
      // Retirer le flag isDefault sur tous les autres tenants
      prisma.userTenant.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      }),
      // Marquer le nouveau tenant comme défaut
      prisma.userTenant.update({
        where: {
          userId_tenantId: { userId: session.user.id, tenantId },
        },
        data: { isDefault: true },
      }),
      // Mettre à jour le tenantId dénormalisé sur User
      prisma.user.update({
        where: { id: session.user.id },
        data: { tenantId, role: userTenant.role },
      }),
    ]);

    // Régénérer le JWT : déclenche le callback `jwt` avec trigger === "update",
    // qui relit le tenant actif depuis la base. Sans cela, le cookie de session
    // conserverait l'ancien tenantId et le changement n'aurait aucun effet.
    await unstable_update({
      user: {
        tenantId: userTenant.tenant.id,
        role: userTenant.role,
      },
    } as never);

    // Recharger la liste complète des tenants pour la réponse
    const allTenants = await prisma.userTenant.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        tenantId: true,
        role: true,
        isDefault: true,
        tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
    });

    return NextResponse.json({
      success: true,
      activeTenant: {
        tenantId: userTenant.tenant.id,
        tenantName: userTenant.tenant.name,
        tenantSlug: userTenant.tenant.slug,
        tenantLogo: userTenant.tenant.logoUrl,
        role: userTenant.role,
      },
      availableTenants: allTenants.map((ut) => ({
        tenantId: ut.tenantId,
        tenantName: ut.tenant.name,
        tenantSlug: ut.tenant.slug,
        tenantLogo: ut.tenant.logoUrl,
        role: ut.role,
        isDefault: ut.isDefault,
      })),
    });
  } catch (error) {
    console.error("Erreur switch tenant:", error);
    return NextResponse.json(
      { error: "Erreur lors du changement de tenant" },
      { status: 500 }
    );
  }
}
