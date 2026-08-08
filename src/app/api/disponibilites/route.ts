import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";

const DispoSchema = z.object({
  enseignantId: z.string().min(1),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const enseignantId = searchParams.get("enseignantId");
    const tenantId = session.user.tenantId;
  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

    const dispos = await prisma.disponibiliteEnseignant.findMany({
      where: { tenantId, ...siteFilterForModel("disponibiliteEnseignant", session.user),
        ...(enseignantId ? { enseignantId } : {}),
      },
      include: {
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    });
    return NextResponse.json(dispos);
  } catch (error) {
    console.error("[API/disponibilites GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const body = await req.json();
    const parsed = DispoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

    const dispo = await prisma.disponibiliteEnseignant.create({
      data: {
        tenantId: session.user.tenantId,
        enseignantId: parsed.data.enseignantId,
        jour: parsed.data.jour as never,
        heureDebut: parsed.data.heureDebut,
        heureFin: parsed.data.heureFin,
      },
    });
    return NextResponse.json(dispo, { status: 201 });
  } catch (error) {
    console.error("[API/disponibilites POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
