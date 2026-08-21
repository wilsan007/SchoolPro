import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { z } from "zod";

const TYPES = ["ADMINISTRATION", "DISCIPLINE", "PEDAGOGIQUE", "AUTRE"] as const;
const FREQUENCES = ["MENSUEL", "TRIMESTRIEL", "ANNUEL", "PONCTUEL"] as const;

const PatchSchema = z.object({
  nom: z.string().min(2).max(200).optional(),
  type: z.enum(TYPES).optional(),
  description: z.string().max(2000).nullable().optional(),
  frequence: z.enum(FREQUENCES).optional(),
});

/**
 * Détail d'un conseil : membres, réunions, résolutions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:read");
    if (denied) return denied;

    const { id } = await params;
    const conseil = await prisma.conseil.findFirst({
      where: { id, tenantId: session.user.tenantId },
      include: {
        membres: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { role: "asc" },
        },
        reunions: {
          orderBy: { date: "desc" },
        },
        resolutions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!conseil) return erreurJson("CONSEIL_INTROUVABLE");
    return NextResponse.json(conseil);
  } catch (error) {
    console.error("[API/gouvernance/conseils/:id GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Modifie un conseil (nom, type, description, fréquence).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:write");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const existing = await prisma.conseil.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) return erreurJson("CONSEIL_INTROUVABLE");

    const updated = await prisma.conseil.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/gouvernance/conseils/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

/**
 * Supprime un conseil (cascade : membres, réunions, résolutions).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "gouvernance:write");
    if (denied) return denied;

    const { id } = await params;
    const existing = await prisma.conseil.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });
    if (!existing) return erreurJson("CONSEIL_INTROUVABLE");

    await prisma.conseil.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API/gouvernance/conseils/:id DELETE]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
