import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

const PatchSchema = z.object({
  statut: z.enum(["OUVERT", "EN_TRAITEMENT", "RESOLU", "CLASSE"]).optional(),
  notes: z.string().max(1000).optional(),
  gravite: z.number().int().min(1).max(3).optional(),
});

const SanctionSchema = z.object({
  type: z.enum(["AVERTISSEMENT", "BLAME", "EXCLUSION_COURS", "EXCLUSION_TEMP", "CONVOCATION_PARENTS", "TRAVAUX_INTERET_GENERAL", "AUTRE"]),
  description: z.string().max(500).optional(),
  dateDebut: z.string(),
  dateFin: z.string().optional(),
  parentNotifie: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const existing = await prisma.incident.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Incident introuvable" }, { status: 404 });

    const updated = await prisma.incident.update({
      where: { id },
      data: {
        ...(parsed.data.statut && { statut: parsed.data.statut }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.gravite !== undefined && { gravite: parsed.data.gravite }),
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/vie-scolaire/incidents/:id PATCH]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // POST to /:id = add a sanction
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;
    const body = await req.json();
    const parsed = SanctionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const existing = await prisma.incident.findFirst({ where: { id, tenantId } });
    if (!existing) return NextResponse.json({ error: "Incident introuvable" }, { status: 404 });

    const { type, description, dateDebut, dateFin, parentNotifie } = parsed.data;

    const sanction = await prisma.sanction.create({
      data: {
        incidentId: id,
        type,
        description: description ?? null,
        dateDebut: new Date(dateDebut),
        dateFin: dateFin ? new Date(dateFin) : null,
        parentNotifie: parentNotifie ?? false,
      },
    });

    // Mettre le statut en traitement
    await prisma.incident.update({
      where: { id },
      data: { statut: "EN_TRAITEMENT" },
    });

    return NextResponse.json(sanction, { status: 201 });
  } catch (error) {
    console.error("[API/vie-scolaire/incidents/:id POST]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
