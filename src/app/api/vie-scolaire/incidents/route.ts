import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";

const CreateSchema = z.object({
  eleveId: z.string().min(1),
  type: z.enum(["RETARD", "BAVARDAGE", "INSOLENCE", "BAGARRE", "TRICHE", "VANDALISM", "ABSENTEISME", "AUTRE"]),
  gravite: z.number().int().min(1).max(3),
  description: z.string().min(5).max(2000),
  lieu: z.string().max(100).optional(),
  date: z.string(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "vie-scolaire:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const eleveId = searchParams.get("eleveId");
    const statut = searchParams.get("statut");
    const tenantId = session.user.tenantId;

    const incidents = await prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", session.user),
        ...(eleveId ? { eleveId } : {}),
        ...(statut ? { statut: statut as never } : {}),
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(incidents);
  } catch (error) {
    console.error("[API/vie-scolaire/incidents GET]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }

    const { eleveId, type, gravite, description, lieu, date, notes } = parsed.data;
    const tenantId = session.user.tenantId;

    // Vérifier que l'élève appartient au tenant
    const eleve = await prisma.eleve.findFirst({
      where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", session.user) },
    });
    if (!eleve) return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });

    const incident = await prisma.incident.create({
      data: {
        tenantId,
        eleveId,
        rapporteParId: session.user.id,
        type,
        gravite,
        description,
        lieu: lieu ?? null,
        date: new Date(date),
        notes: notes ?? null,
        statut: "OUVERT",
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
    });

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error("[API/vie-scolaire/incidents POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
