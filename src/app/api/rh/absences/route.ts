import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";

const AbsencePersonnelSchema = z.object({
  enseignantId: z.string().min(1),
  date: z.string().min(1),
  heureDebut: z.string().optional().nullable(),
  heureFin: z.string().optional().nullable(),
  type: z.enum(["ABSENCE", "RETARD", "MISSION", "FORMATION", "MALADIE", "AUTRE"]).default("ABSENCE"),
  motif: z.string().optional(),
  commentaire: z.string().optional(),
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

  const userFilter = siteFilterForRelation(session.user, "user");
  const siteFilter = Object.keys(userFilter).length > 0
    ? { enseignant: (userFilter as any).user }
    : {};

  const absences = await prisma.absencePersonnel.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(enseignantId ? { enseignantId } : {}),
    },
    include: {
      enseignant: {
        select: { id: true, specialite: true, user: { select: { name: true } } },
      },
      saisiePar: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return NextResponse.json({ absences });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const body = await req.json();
  const data = AbsencePersonnelSchema.parse(body);

  const userFilterPost = siteFilterForRelation(session.user, "user");

  const enseignant = await prisma.enseignant.findFirst({
    where: { id: data.enseignantId, tenantId: session.user.tenantId, ...userFilterPost },
  });
  if (!enseignant) {
    return NextResponse.json({ error: "Enseignant introuvable" }, { status: 404 });
  }

  const absence = await prisma.absencePersonnel.create({
    data: {
      tenantId: session.user.tenantId,
      enseignantId: data.enseignantId,
      date: new Date(data.date),
      heureDebut: data.heureDebut || null,
      heureFin: data.heureFin || null,
      type: data.type,
      motif: data.motif || null,
      commentaire: data.commentaire || null,
      saisieParId: session.user.id,
    },
  });

  return NextResponse.json({ absence });
}
