import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const FicheSchema = z.object({
  eleveId: z.string().min(1),
  allergies: z.array(z.string()).default([]),
  traitements: z.any().optional().nullable(),
  contreIndicationsSport: z.boolean().default(false),
  contactsUrgence: z.any().optional().nullable(),
  protocoleUrgence: z.string().optional().nullable(),
  vaccinations: z.any().optional().nullable(),
  remarques: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const eleveId = searchParams.get("eleveId");
  const requestedSiteId = searchParams.get("siteId");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };
  const siteFilter = siteFilterForModel("ficheSanitaire", claims);

  const fiches = await prisma.ficheSanitaire.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(eleveId ? { eleveId } : {}),
    },
    include: {
      eleve: { select: { nom: true, prenom: true, classe: { select: { nom: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ fiches });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "vie-scolaire:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = FicheSchema.parse(json);

    const siteId =
      data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    const eleve = await prisma.eleve.findFirst({
      where: { id: data.eleveId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
      select: { id: true },
    });
    if (!eleve) {
      return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
    }

    const fiche = await prisma.ficheSanitaire.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        eleveId: data.eleveId,
        allergies: data.allergies,
        traitements: data.traitements ?? undefined,
        contreIndicationsSport: data.contreIndicationsSport,
        contactsUrgence: data.contactsUrgence ?? undefined,
        protocoleUrgence: data.protocoleUrgence ?? null,
        vaccinations: data.vaccinations ?? undefined,
        remarques: data.remarques ?? null,
      },
    });

    // Si contre-indications sport, créer automatiquement une dispense EPS.
    if (data.contreIndicationsSport) {
      try {
        const matiereEPS = await prisma.matiere.findFirst({
          where: {
            tenantId: session.user.tenantId,
            ...siteFilterForModel("matiere", session.user),
            OR: [
              { nom: { contains: "EPS", mode: "insensitive" } },
              { nom: { contains: "Sport", mode: "insensitive" } },
              { nom: { contains: "Éducation physique", mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        if (matiereEPS) {
          await prisma.dispenseMatiere.create({
            data: {
              tenantId: session.user.tenantId,
              eleveId: data.eleveId,
              matiereId: matiereEPS.id,
              motif: "Contre-indication médicale (fiche sanitaire)",
            },
          });
        }
      } catch (dispErr) {
        // La dispense existe peut-être déjà — ne pas bloquer.
        console.error("[FicheSanitaire POST] Dispense EPS échouée:", dispErr);
      }
    }

    return NextResponse.json(fiche, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[FicheSanitaire POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
