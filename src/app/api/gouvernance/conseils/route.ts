import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const TYPES = ["ADMINISTRATION", "DISCIPLINE", "PEDAGOGIQUE", "AUTRE"] as const;
const FREQUENCES = ["MENSUEL", "TRIMESTRIEL", "ANNUEL", "PONCTUEL"] as const;

const CreateSchema = z.object({
  nom: z.string().min(2).max(200),
  type: z.enum(TYPES),
  description: z.string().max(2000).optional(),
  frequence: z.enum(FREQUENCES).default("TRIMESTRIEL"),
});

/**
 * Liste les conseils de gouvernance du tenant avec leurs membres et réunions.
 *
 * Les conseils sont des instances tenant-wide (CA, conseil de discipline,
 * conseil pédagogique…) : pas de filtre de site, seulement le tenantId.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:read");
    if (denied) return denied;

    const conseils = await prisma.conseil.findMany({
      where: { tenantId: session.user.tenantId },
      include: {
        membres: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { role: "asc" },
        },
        reunions: {
          orderBy: { date: "desc" },
          take: 5,
        },
        _count: {
          select: { resolutions: true, reunions: true, membres: true },
        },
      },
      orderBy: { nom: "asc" },
    });

    return NextResponse.json({ conseils });
  } catch (error) {
    console.error("[API/gouvernance/conseils GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Crée un nouveau conseil de gouvernance.
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

    const conseil = await prisma.conseil.create({
      data: {
        tenantId: session.user.tenantId,
        nom: parsed.data.nom,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
        frequence: parsed.data.frequence,
      },
      include: {
        membres: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json(conseil, { status: 201 });
  } catch (error) {
    console.error("[API/gouvernance/conseils POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
