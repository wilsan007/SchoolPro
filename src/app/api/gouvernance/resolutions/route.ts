import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const CreateSchema = z.object({
  conseilId: z.string().min(1),
  titre: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
});

/**
 * Liste les résolutions du tenant, optionnellement filtrées par conseil.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const conseilId = searchParams.get("conseilId");

    const resolutions = await prisma.résolution.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...(conseilId ? { conseilId } : {}),
      },
      include: {
        conseil: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ resolutions });
  } catch (error) {
    console.error("[API/gouvernance/resolutions GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Crée une résolution rattachée à un conseil.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const conseil = await prisma.conseil.findFirst({
      where: { id: parsed.data.conseilId, tenantId: session.user.tenantId },
    });
    if (!conseil) return erreurJson("CONSEIL_INTROUVABLE");

    const resolution = await prisma.résolution.create({
      data: {
        tenantId: session.user.tenantId,
        conseilId: parsed.data.conseilId,
        titre: parsed.data.titre,
        description: parsed.data.description ?? null,
        statut: "EN_ATTENTE",
      },
    });

    return NextResponse.json(resolution, { status: 201 });
  } catch (error) {
    console.error("[API/gouvernance/resolutions POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
