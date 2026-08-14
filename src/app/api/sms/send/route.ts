import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSMS } from "@/lib/sms/africasTalking";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const SendSchema = z.object({
  destinataires: z.enum(["tous_parents", "classe", "eleve"]),
  classeId: z.string().optional(),
  eleveId: z.string().optional(),
  message: z.string().min(1).max(320),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "communication:send");
  if (denied) return denied;

  const tenantId = session.user.tenantId;

  const siteFilter = siteFilterForModel("eleve", session.user);
  try {
    const json = await request.json();
    const data = SendSchema.parse(json);

    // Récupérer les numéros des parents selon le ciblage
    let phones: string[] = [];

    if (data.destinataires === "tous_parents") {
      const parents = await prisma.parent.findMany({
        where: { tenantId, ...siteFilterForModel("parent", session.user) },
        select: { phone: true },
      });
      phones = parents.map((p) => p.phone).filter(Boolean);
    } else if (data.destinataires === "classe" && data.classeId) {
      const eleves = await prisma.eleve.findMany({
        where: { tenantId, ...siteFilter, classeId: data.classeId },
        include: {
          parents: {
            where: siteFilterForModel("eleveParent", session.user),
            include: { parent: { select: { phone: true } } },
          },
        },
      });
      phones = eleves
        .flatMap((e) => e.parents.map((ep) => ep.parent.phone))
        .filter(Boolean);
    } else if (data.destinataires === "eleve" && data.eleveId) {
      const eleve = await prisma.eleve.findFirst({
        where: { id: data.eleveId, tenantId, ...siteFilter },
        include: {
          parents: {
            where: siteFilterForModel("eleveParent", session.user),
            include: { parent: { select: { phone: true } } },
          },
        },
      });
      phones = eleve?.parents.map((ep) => ep.parent.phone).filter(Boolean) ?? [];
    }

    if (phones.length === 0) {
      return NextResponse.json({ error: "Aucun destinataire trouvé" }, { status: 400 });
    }

    // Envoi par batch de 100 (limite Africa's Talking)
    const results = [];
    for (let i = 0; i < phones.length; i += 100) {
      const batch = phones.slice(i, i + 100);
      const result = await sendSMS(batch, data.message);
      results.push(result);
    }

    const success = results.every((r) => r.success);

    // Enregistrer la notification
    await prisma.notification.create({
      data: {
        tenantId,
        envoyeParId: session.user.id,
        titre: `SMS — ${data.destinataires}`,
        contenu: data.message,
        canal: "SMS",
        cible: data.destinataires === "tous_parents" ? "PARENTS" : "ELEVES",
        classeId: data.classeId,
        statut: success ? "ENVOYEE" : "ECHEC",
        nbDestinataires: phones.length,
        nbDelivres: success ? phones.length : 0,
        nbLus: 0,
        envoyeeAt: new Date(),
      },
    });

    return NextResponse.json({
      success,
      nbDestinataires: phones.length,
      results,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[SMS Send] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
