import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";

const TacheSchema = z.object({
  assigneeAId: z.string().min(1),
  titre: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.string().default("autre"),
  priorite: z.enum(["BASSE", "NORMALE", "HAUTE", "URGENTE"]).default("NORMALE"),
  statut: z.enum(["A_FAIRE", "EN_COURS", "FAIT", "ANNULE"]).default("A_FAIRE"),
  classeId: z.string().optional().nullable(),
  matiereId: z.string().optional().nullable(),
  echeance: z.string().datetime().optional().nullable(),
  siteId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const assigneeAId = searchParams.get("assigneeAId");
  const statut = searchParams.get("statut");
  const echeance = searchParams.get("echeance");
  const requestedSiteId = searchParams.get("siteId");

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };

  const siteFilter = siteFilterForModel("tache", claims);

  // Par défaut, un utilisateur voit ses propres tâches (assignées ou créées)
  // sauf s'il filtre explicitement par assigneeAId.
  const filterAssignee = assigneeAId ?? undefined;

  const taches = await prisma.tache.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(filterAssignee ? { assigneeAId: filterAssignee } : {}),
      ...(statut ? { statut: statut as any } : {}),
      ...(echeance
        ? {
            echeance: {
              lte: new Date(echeance),
            },
          }
        : {}),
    },
    include: {
      assigneeA: { select: { name: true, email: true } },
      creePar: { select: { name: true } },
      classe: { select: { nom: true } },
      matiere: { select: { nom: true } },
    },
    orderBy: [
      { statut: "asc" },
      { echeance: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ taches });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const data = TacheSchema.parse(json);

    const siteId =
      data.siteId ?? (session.user as { siteId?: string | null }).siteId ?? null;

    // Vérifier que l'assignataire existe dans le tenant.
    const assignee = await prisma.user.findFirst({
      where: { id: data.assigneeAId, tenantId: session.user.tenantId, ...siteFilterForModel("user", session.user) },
      select: { id: true, name: true },
    });
    if (!assignee) {
      return NextResponse.json(
        { error: "Utilisateur assigné introuvable" },
        { status: 404 }
      );
    }

    const tache = await prisma.tache.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: siteId || null,
        assigneeAId: data.assigneeAId,
        creeParId: session.user.id,
        titre: data.titre,
        description: data.description ?? null,
        type: data.type,
        priorite: data.priorite,
        statut: data.statut,
        classeId: data.classeId ?? null,
        matiereId: data.matiereId ?? null,
        echeance: data.echeance ? new Date(data.echeance) : null,
      },
      include: {
        assigneeA: { select: { name: true, email: true } },
        creePar: { select: { name: true } },
      },
    });

    // Notifier l'assignataire de la nouvelle tâche.
    // Les notifications ne doivent pas bloquer l'action principale.
    try {
      const echeanceStr = tache.echeance
        ? new Date(tache.echeance).toLocaleDateString("fr-FR")
        : "sans échéance";
      await prisma.notification.create({
        data: {
          tenantId: session.user.tenantId,
          titre: "Nouvelle tâche assignée",
          contenu: `Une nouvelle tâche vous a été assignée : « ${data.titre} ». Échéance : ${echeanceStr}.`,
          canal: "IN_APP",
          cible: "TOUS",
          envoyeParId: session.user.id,
          nbDestinataires: 1,
          nbDelivres: 1,
          statut: "ENVOYEE",
          envoyeeAt: new Date(),
        },
      });
    } catch (notifErr) {
      console.error("[Taches POST] Notification échouée:", notifErr);
    }

    return NextResponse.json(tache, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[Taches POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
