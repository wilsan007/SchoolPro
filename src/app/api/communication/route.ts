import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { siteFilterForModel } from "@/lib/site-filter";
import { isRelationScopedRole } from "@/lib/site-scope";

const NotifSchema = z.object({
  titre: z.string().min(1).max(200),
  contenu: z.string().min(1),
  canal: z.enum(["EMAIL", "SMS", "PUSH", "IN_APP"]).default("IN_APP"),
  cible: z.enum(["TOUS", "PARENTS", "ENSEIGNANTS", "ELEVES", "CLASSE", "NIVEAU"]).default("TOUS"),
  classeId: z.string().optional(),
  niveau: z.string().optional(),
  planifieeAt: z.string().optional(),
  envoyer: z.boolean().default(false), // true = envoyer immédiatement
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "communication:read");
  if (denied) return denied;

  // La console de communication est un outil du personnel : un PARENT / STUDENT
  // qui a `communication:read` pour sa boîte de réception ne doit pas voir la
  // liste des notifications envoyées à tout l'établissement. Les familles
  // accèdent à leurs messages via `/api/messages/conversations`.
  if (isRelationScopedRole(session.user.role)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const siteFilter = siteFilterForModel("notification", session.user);
  const notifications = await prisma.notification.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter },
    include: { envoyePar: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const denied = checkPermission(session.user.role, "communication:send");
  if (denied) return denied;

  // Rate limit: 10 notifications per minute per user
  const ip = getClientIP(req);
  const rl = rateLimit({ max: 10, windowSec: 60, key: `notif:${session.user.id}:${ip}` });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de notifications envoyées. Réessayez dans un instant." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const body = await req.json();
  const data = NotifSchema.parse(body);

  // Calculer le nombre de destinataires selon la cible
  let nbDestinataires = 0;
  const tenantId = session.user.tenantId;
  // Chaque modèle emprunte son propre chemin vers le site : `User` et `Eleve`
  // portent la colonne, `Parent` et `Enseignant` non. Les compteurs PARENTS et
  // ENSEIGNANTS n'étaient pas filtrés du tout et révélaient les effectifs des
  // autres sites.
  const userFilter = siteFilterForModel("user", session.user);
  const eleveFilter = siteFilterForModel("eleve", session.user);
  const parentFilter = siteFilterForModel("parent", session.user);
  const enseignantFilter = siteFilterForModel("enseignant", session.user);

  switch (data.cible) {
    case "TOUS":
      nbDestinataires = await prisma.user.count({ where: { tenantId, ...userFilter, isActive: true } });
      break;
    case "PARENTS":
      nbDestinataires = await prisma.parent.count({ where: { tenantId, ...parentFilter } });
      break;
    case "ENSEIGNANTS":
      nbDestinataires = await prisma.enseignant.count({ where: { tenantId, ...enseignantFilter } });
      break;
    case "ELEVES":
      nbDestinataires = await prisma.eleve.count({ where: { tenantId, ...eleveFilter, statut: "ACTIF" } });
      break;
    case "CLASSE":
      if (data.classeId) {
        nbDestinataires = await prisma.eleve.count({
          where: { tenantId, ...eleveFilter, classeId: data.classeId, statut: "ACTIF" },
        });
      }
      break;
    case "NIVEAU":
      if (data.niveau) {
        nbDestinataires = await prisma.eleve.count({
          where: { tenantId, ...eleveFilter, statut: "ACTIF",
            classe: { niveau: data.niveau },
          },
        });
      }
      break;
  }

  // Statut initial : EN_ENVOI si envoi immédiat (le dispatcher le finalisera).
  const statut = data.envoyer ? "EN_ENVOI" : data.planifieeAt ? "PLANIFIEE" : "BROUILLON";

  const notification = await prisma.notification.create({
    data: {
      tenantId,
      titre: data.titre,
      contenu: data.contenu,
      canal: data.canal,
      cible: data.cible,
      classeId: data.classeId,
      niveau: data.niveau,
      envoyeParId: session.user.id,
      nbDestinataires,
      statut,
      planifieeAt: data.planifieeAt ? new Date(data.planifieeAt) : null,
    },
    include: { envoyePar: { select: { name: true, avatarUrl: true } } },
  });

  // Envoi réel immédiat (EMAIL / SMS / PUSH / IN_APP) via le dispatcher.
  if (data.envoyer) {
    try {
      const result = await dispatchNotification(notification.id, tenantId);
      return NextResponse.json({ notification, envoi: result }, { status: 201 });
    } catch (e) {
      console.error("[Communication] Échec dispatch:", e);
      // eslint-disable-next-line ecolpro/require-tenant-id -- notification.id vient d'être créé avec tenantId (ligne 105)
      await prisma.notification.update({
        where: { id: notification.id },
        data: { statut: "ECHEC" },
      });
      return NextResponse.json(
        { notification, error: "Notification créée mais l'envoi a échoué" },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ notification }, { status: 201 });
}
