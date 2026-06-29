import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
  decisions: z.array(
    z.object({
      eleveId: z.string().min(1),
      decision: z.enum(["PASSAGE", "REDOUBLEMENT", "FELICITATIONS", "ENCOURAGEMENTS", "AVERTISSEMENT"]).nullable(),
      appreciation: z.string().max(500).optional(),
    })
  ),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const { periodeId, decisions } = parsed.data;
    const tenantId = session.user.tenantId;

    await Promise.all(
      decisions.map(({ eleveId, decision, appreciation }) =>
        prisma.bulletin.upsert({
          where: { eleveId_periodeId: { eleveId, periodeId } },
          update: {
            decision: decision ?? null,
            ...(appreciation !== undefined && { appreciation }),
          },
          create: {
            tenantId,
            eleveId,
            periodeId,
            decision: decision ?? null,
            appreciation: appreciation ?? null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: `${decisions.length} décisions enregistrées`,
    });
  } catch (error) {
    console.error("[API/bulletins/conseil]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
