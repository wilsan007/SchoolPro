import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  requireSiteIdForCreate,
  isRelationScopedRole,
} from "@/lib/site-scope";

const EntretienSchema = z.object({
  eleveId: z.string().min(1),
  date: z.string().datetime().optional(),
  motif: z.string().min(1).max(500),
  compteRendu: z.string().optional(),
  decisions: z.string().optional(),
  suivi: z.string().optional(),
  statut: z
    .enum(["PLANIFIE", "REALISE", "ANNULE", "REPORTÉ"])
    .default("PLANIFIE"),
  prochainRendezVous: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "vie-scolaire:read");
  if (denied) return denied;

  if (isRelationScopedRole(session.user.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eleveId = searchParams.get("eleveId");
  const requestedSiteId = searchParams.get("siteId");

  const sessionSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = {
    ...session.user,
    siteId: activeSiteId,
  };

  const siteFilter = siteFilterForModel("entretienConseiller", claims);
  const entretiens = await prisma.entretienConseiller.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(eleveId && { eleveId }),
    },
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true } },
        },
      },
      conseiller: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ entretiens });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  const siteError = requireSiteIdForCreate(session.user);
  if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

  const body = await req.json();
  const data = EntretienSchema.parse(body);

  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

  const entretien = await prisma.entretienConseiller.create({
    data: {
      tenantId: session.user.tenantId,
      siteId: siteId || null,
      eleveId: data.eleveId,
      conseillerId: session.user.id,
      date: data.date ? new Date(data.date) : new Date(),
      motif: data.motif,
      compteRendu: data.compteRendu,
      decisions: data.decisions,
      suivi: data.suivi,
      statut: data.statut,
      prochainRendezVous: data.prochainRendezVous
        ? new Date(data.prochainRendezVous)
        : null,
    },
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true } },
        },
      },
    },
  });

  return NextResponse.json({ entretien }, { status: 201 });
}
