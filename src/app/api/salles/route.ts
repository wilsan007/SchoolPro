import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";

const SalleSchema = z.object({
  nom: z.string().min(1).max(100),
  capacite: z.number().int().min(1).max(500).default(30),
  type: z.string().max(50).optional(),
  batiment: z.string().max(100).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:read");
    if (denied) return denied;
    const siteFilter = siteFilterForModel("salle", session.user);

    const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

    const salles = await prisma.salle.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilter },
      orderBy: { nom: "asc" },
    });
    return NextResponse.json(salles);
  } catch (error) {
    console.error("[API/salles GET]", error);
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
    const parsed = SalleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

    const salle = await prisma.salle.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        nom: parsed.data.nom,
        capacite: parsed.data.capacite,
        type: parsed.data.type ?? null,
        batiment: parsed.data.batiment ?? null,
      },
    });
    return NextResponse.json(salle, { status: 201 });
  } catch (error) {
    console.error("[API/salles POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
