import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/emails/journal
 *
 * Liste paginée des emails transactionnels (EmailLog) du tenant.
 * Filtres : statut, destinataire, type, plage de dates.
 *
 * Réservé à la direction (TENANT_ADMIN, SUPER_ADMIN).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "TENANT_ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const statut = url.searchParams.get("statut") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const where: Record<string, unknown> = { tenantId };

  if (statut) where.statut = statut;
  if (to) where.to = { contains: to, mode: "insensitive" };
  if (type) where.type = type;
  if (startDate || endDate) {
    const dateRange: Record<string, unknown> = {};
    if (startDate) dateRange.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateRange.lte = end;
    }
    where.createdAt = dateRange;
  }

  const [logs, total] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- emailLog est transverse au tenant (pas de siteId)
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        to: true,
        subject: true,
        resendId: true,
        statut: true,
        erreur: true,
        type: true,
        resourceId: true,
        deliveredAt: true,
        bouncedAt: true,
        openedAt: true,
        complainedAt: true,
        createdAt: true,
        envoyePar: { select: { id: true, name: true } },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- emailLog est transverse au tenant
    prisma.emailLog.count({ where }),
  ]);

  // Stats globales (toutes les pages confondues)
  // eslint-disable-next-line ecolpro/require-site-filter -- emailLog est transverse au tenant
  const stats = await prisma.emailLog.groupBy({
    by: ["statut"],
    where: { tenantId },
    _count: { statut: true },
  });

  const statsMap: Record<string, number> = {};
  for (const s of stats) {
    statsMap[s.statut] = s._count.statut;
  }

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats: statsMap,
  });
}
