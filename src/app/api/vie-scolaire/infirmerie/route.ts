import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const PassageSchema = z.object({
  eleveId: z.string().min(1),
  date: z.string().datetime().optional(),
  motif: z.string().min(1),
  soin: z.string().optional().nullable(),
  suite: z.string().min(1),
  retourCours: z.boolean().default(true),
  dureeMin: z.number().int().min(0).optional().nullable(),
  infirmierId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };

  const siteFilter = siteFilterForModel("passageInfirmerie", claims);

  const passages = await prisma.passageInfirmerie.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(eleveId ? { eleveId } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    },
    include: {
      eleve: {
        select: {
          nom: true,
          prenom: true,
          classe: { select: { nom: true } },
        },
      },
      infirmier: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ passages });
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
    const data = PassageSchema.parse(json);

    const siteId =
      data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    // Vérifier que l'élève appartient au tenant.
    const eleve = await prisma.eleve.findFirst({
      where: { id: data.eleveId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
      select: { id: true, nom: true, prenom: true },
    });
    if (!eleve) {
      return NextResponse.json(
        { error: "Élève introuvable" },
        { status: 404 }
      );
    }

    const passage = await prisma.passageInfirmerie.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        eleveId: data.eleveId,
        date: data.date ? new Date(data.date) : new Date(),
        motif: data.motif,
        soin: data.soin ?? null,
        suite: data.suite,
        retourCours: data.retourCours,
        dureeMin: data.dureeMin ?? null,
        infirmierId: data.infirmierId ?? session.user.id,
        notes: data.notes ?? null,
      },
      include: {
        eleve: {
          select: { nom: true, prenom: true, classe: { select: { nom: true } } },
        },
      },
    });

    // Si l'élève ne retourne pas en cours, notifier les parents.
    // Les notifications ne doivent pas bloquer l'action principale.
    if (!data.retourCours) {
      try {
        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre: "Passage à l'infirmerie",
            contenu: `Votre enfant ${eleve.prenom} ${eleve.nom} a été conduit à l'infirmerie. Motif : ${data.motif}. Suite donnée : ${data.suite}.`,
            canal: "IN_APP",
            cible: "PARENTS",
            envoyeParId: session.user.id,
            nbDestinataires: 1,
            nbDelivres: 1,
            statut: "ENVOYEE",
            envoyeeAt: new Date(),
          },
        });
      } catch (notifErr) {
        console.error("[Infirmerie POST] Notification parents échouée:", notifErr);
      }
    }

    return NextResponse.json(passage, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Infirmerie POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
