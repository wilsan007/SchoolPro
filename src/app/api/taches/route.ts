import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { checkPermission } from "@/lib/rbac";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { synchroniserTachesAuto } from "@/lib/tache-engine";
import { bucketPour, BUCKET_ORDER, type BucketTache } from "@/lib/tache-buckets";
import { getDemoNow } from "@/lib/demo-now";
import type { Role } from "@prisma/client";

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
  sourceType: z.string().optional().nullable(),
  sourceId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const assigneeAId = searchParams.get("assigneeAId");
  const statut = searchParams.get("statut");
  const echeance = searchParams.get("echeance");
  const requestedSiteId = searchParams.get("siteId");
  const bucket = searchParams.get("bucket");
  const sync = searchParams.get("sync");
  const mine = searchParams.get("mine"); // "1" = mes tâches uniquement

  const sessionSiteId =
    (session.user as { siteId?: string | null }).siteId ?? null;
  let activeSiteId: string | null = sessionSiteId;
  if (requestedSiteId === "all") activeSiteId = null;
  else if (requestedSiteId) activeSiteId = requestedSiteId;

  const claims = { ...session.user, siteId: activeSiteId };

  // Auto-sync : régénère les tâches depuis l'état du système avant lecture.
  // Lancé explicitement via ?sync=1 ou par défaut (lazy sync silencieux).
  if (sync === "1") {
    try {
      await synchroniserTachesAuto(session.user.tenantId, claims);
    } catch (e) {
      console.error("[Taches GET] Auto-sync échoué:", e);
    }
  }

  const siteFilter = siteFilterForModel("tache", claims);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};

  // Par défaut (mine=1 ou pas d'assigneeAId), un utilisateur voit ses propres tâches.
  // Les admins/direction peuvent voir toutes les tâches avec mine=0.
  const voirMesTaches = mine !== "0" && !assigneeAId;
  const filterAssignee = assigneeAId ?? (voirMesTaches ? session.user.id : undefined);

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
      ...anneeClasse,
    },
    include: {
      assigneeA: { select: { id: true, name: true, email: true } },
      creePar: { select: { id: true, name: true } },
      classe: { select: { id: true, nom: true } },
      matiere: { select: { id: true, nom: true } },
    },
    orderBy: [
      { statut: "asc" },
      { echeance: "asc" },
      { priorite: "desc" },
      { createdAt: "desc" },
    ],
    take: 300,
  });

  // Filtrage par bucket temporel si demandé.
  let tachesFiltrees = taches;
  if (bucket && BUCKET_ORDER.includes(bucket as BucketTache)) {
    const maintenant = await getDemoNow();
    tachesFiltrees = taches.filter(
      (t) => bucketPour(t.echeance, t.statut, maintenant) === bucket
    );
  }

  // Sérialiser avec sourceType/sourceId.
  const serialized = tachesFiltrees.map((t) => ({
    ...t,
    echeance: t.echeance?.toISOString() ?? null,
    dateFaite: t.dateFaite?.toISOString() ?? null,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
  }));

  return NextResponse.json({ taches: serialized });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "taches:write");
  if (denied) return denied;

  try {
    const json = await request.json();
    const data = TacheSchema.parse(json);

    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    if (data.classeId && isTeacherRole(session.user.role as Role)) {
      const scope = await getTeacherScope(
        session.user.tenantId,
        session.user.id as string,
        session.user.role as Role,
        anneeCourante
      );
      if (scope.isRestricted && !scope.classeIds.includes(data.classeId)) {
        return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
      }
    }
    if (data.matiereId && isTeacherRole(session.user.role as Role)) {
      const scope = await getTeacherScope(
        session.user.tenantId,
        session.user.id as string,
        session.user.role as Role,
        anneeCourante
      );
      if (scope.isRestricted && !scope.matiereIds.includes(data.matiereId)) {
        return NextResponse.json({ error: "Matière hors de votre périmètre" }, { status: 403 });
      }
    }

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
        sourceType: data.sourceType ?? null,
        sourceId: data.sourceId ?? null,
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
      // eslint-disable-next-line ecolpro/require-site-filter -- notification interne, bornée par tenantId
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
