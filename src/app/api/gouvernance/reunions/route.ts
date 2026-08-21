import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const STATUTS = ["PLANIFIEE", "EN_COURS", "TERMINEE", "ANNULEE"] as const;

const CreateSchema = z.object({
  conseilId: z.string().min(1),
  titre: z.string().min(2).max(200),
  date: z.string(),
  lieu: z.string().max(200).optional(),
  ordreDuJour: z.string().max(5000).optional(),
});

/**
 * Liste les réunions d'un conseil (ou toutes les réunions du tenant).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const conseilId = searchParams.get("conseilId");

    const reunions = await prisma.réunion.findMany({
      where: {
        conseil: { tenantId: session.user.tenantId },
        ...(conseilId ? { conseilId } : {}),
      },
      include: {
        conseil: { select: { id: true, nom: true, type: true } },
      },
      orderBy: { date: "desc" },
      take: 100,
    });

    return NextResponse.json({ reunions });
  } catch (error) {
    console.error("[API/gouvernance/reunions GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Crée une réunion pour un conseil.
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

    // Vérifier l'appartenance du conseil au tenant
    const conseil = await prisma.conseil.findFirst({
      where: { id: parsed.data.conseilId, tenantId: session.user.tenantId },
    });
    if (!conseil) return erreurJson("CONSEIL_INTROUVABLE");

    const reunion = await prisma.réunion.create({
      data: {
        conseilId: parsed.data.conseilId,
        titre: parsed.data.titre,
        date: new Date(parsed.data.date),
        lieu: parsed.data.lieu ?? null,
        ordreDuJour: parsed.data.ordreDuJour ?? null,
        statut: "PLANIFIEE",
      },
    });

    return NextResponse.json(reunion, { status: 201 });
  } catch (error) {
    console.error("[API/gouvernance/reunions POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
