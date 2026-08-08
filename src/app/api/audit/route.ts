import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/rbac";

/**
 * GET /api/audit — Consultation du journal d'audit.
 * Permission: audit:read (SUPER_ADMIN, TENANT_ADMIN).
 * SUPER_ADMIN voit tous les logs ; TENANT_ADMIN est borné à son tenant.
 */
export async function GET(req: NextRequest) {
  const gate = await authorize({ permission: "audit:read" });
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "50")));
  const verdict = searchParams.get("verdict");
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: Record<string, unknown> = {};

  // Tenant scoping: SUPER_ADMIN sees all, others are scoped to their tenant
  if (gate.role !== "SUPER_ADMIN") {
    where.tenantId = gate.tenantId;
  }

  if (verdict) where.verdict = verdict;
  if (action) where.action = { contains: action };
  if (userId) where.userId = userId;
  if (startDate || endDate) {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    where.createdAt = dateFilter;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
