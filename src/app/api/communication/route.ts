import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";

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

  const notifications = await prisma.notification.findMany({
    where: { tenantId: session.user.tenantId },
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

  const body = await req.json();
  const data = NotifSchema.parse(body);

  // Calculer le nombre de destinataires selon la cible
  let nbDestinataires = 0;
  const tenantId = session.user.tenantId;

  switch (data.cible) {
    case "TOUS":
      nbDestinataires = await prisma.user.count({ where: { tenantId, isActive: true } });
      break;
    case "PARENTS":
      nbDestinataires = await prisma.parent.count({ where: { tenantId } });
      break;
    case "ENSEIGNANTS":
      nbDestinataires = await prisma.enseignant.count({ where: { tenantId } });
      break;
    case "ELEVES":
      nbDestinataires = await prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } });
      break;
    case "CLASSE":
      if (data.classeId) {
        nbDestinataires = await prisma.eleve.count({
          where: { tenantId, classeId: data.classeId, statut: "ACTIF" },
        });
      }
      break;
    case "NIVEAU":
      if (data.niveau) {
        nbDestinataires = await prisma.eleve.count({
          where: {
            tenantId, statut: "ACTIF",
            classe: { niveau: data.niveau },
          },
        });
      }
      break;
  }

  const statut = data.envoyer ? "ENVOYEE" : data.planifieeAt ? "PLANIFIEE" : "BROUILLON";

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
      envoyeeAt: data.envoyer ? new Date() : null,
      // En production : déclencher l'envoi réel ici via Africa's Talking / Twilio / SMTP
    },
    include: { envoyePar: { select: { name: true, avatarUrl: true } } },
  });

  return NextResponse.json({ notification }, { status: 201 });
}
