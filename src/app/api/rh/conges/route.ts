import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

const CongeSchema = z.object({
  enseignantId: z.string().min(1),
  type: z.enum(["ANNUEL", "MALADIE", "SPECIAL", "MATERNITE", "PATERNITE", "SANS_SOLDE", "AUTRE"]).default("ANNUEL"),
  dateDebut: z.string().min(1),
  dateFin: z.string().min(1),
  nbJours: z.number().min(0.5),
  motif: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const enseignantId = searchParams.get("enseignantId");
  const statut = searchParams.get("statut");

  const userFilter = siteFilterForRelation(session.user, "user");
  const siteFilter = Object.keys(userFilter).length > 0
    ? { enseignant: (userFilter as any).user }
    : {};

  const conges = await prisma.congePersonnel.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(enseignantId ? { enseignantId } : {}),
      ...(statut ? { statut: statut as never } : {}),
    },
    include: {
      enseignant: {
        select: { id: true, specialite: true, user: { select: { name: true } } },
      },
      demandePar: { select: { name: true } },
      approuvePar: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ conges });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const body = await req.json();
  const data = CongeSchema.parse(body);

  const userFilterPost = siteFilterForRelation(session.user, "user");

  const enseignant = await prisma.enseignant.findFirst({
    where: { id: data.enseignantId, tenantId: session.user.tenantId, ...userFilterPost },
  });
  if (!enseignant) {
    return NextResponse.json({ error: "Enseignant introuvable" }, { status: 404 });
  }

  const conge = await prisma.congePersonnel.create({
    data: {
      tenantId: session.user.tenantId,
      enseignantId: data.enseignantId,
      type: data.type,
      dateDebut: new Date(data.dateDebut),
      dateFin: new Date(data.dateFin),
      nbJours: data.nbJours,
      motif: data.motif || null,
      demandeParId: session.user.id,
    },
  });

  return NextResponse.json({ conge });
}
