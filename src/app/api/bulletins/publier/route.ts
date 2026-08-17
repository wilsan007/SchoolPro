import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:publish");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { classeId, periodeId } = parsed.data;
    const tenantId = session.user.tenantId;

    // Récupérer tous les bulletins de la classe pour la période
    const eleves = await prisma.eleve.findMany({
      where: { classeId, tenantId, statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
      select: { id: true },
    });

    const eleveIds = eleves.map((e) => e.id);

    const result = await prisma.bulletin.updateMany({
      where: { tenantId, ...siteFilterForModel("bulletin", session.user),
        periodeId,
        eleveId: { in: eleveIds },
        isPublie: false,
      },
      data: {
        isPublie: true,
        publishedAt: new Date(),
      },
    });

    if (result.count > 0) {
      try {
        const periode = await prisma.periode.findFirst({
          where: { id: periodeId },
          select: { nom: true },
        });
        const periodeNom = periode?.nom ?? "la période";

        const elevesPublies = await prisma.eleve.findMany({
          where: { id: { in: eleveIds }, tenantId, ...siteFilterForModel("eleve", session.user) },
          select: { id: true, nom: true, prenom: true },
        });

        for (const eleve of elevesPublies) {
          const eleveNom = `${eleve.prenom} ${eleve.nom}`;
          const titreNotif = `Bulletin publié - ${periodeNom}`;
          const contenuNotif = `Le bulletin de ${eleveNom} pour ${periodeNom} est disponible.`;

          await prisma.notification.create({
            data: {
              tenantId,
              titre: titreNotif,
              contenu: contenuNotif,
              canal: "IN_APP",
              statut: "ENVOYEE",
              cible: "PARENTS",
              envoyeParId: session.user.id,
              nbDestinataires: 1,
              nbDelivres: 1,
              envoyeeAt: new Date(),
            },
          });
          await prisma.notification.create({
            data: {
              tenantId,
              titre: titreNotif,
              contenu: contenuNotif,
              canal: "EMAIL",
              statut: "ENVOYEE",
              cible: "PARENTS",
              envoyeParId: session.user.id,
              nbDestinataires: 1,
              nbDelivres: 1,
              envoyeeAt: new Date(),
            },
          });
        }
      } catch (notifError) {
        console.error("[API/bulletins/publier] Notification échouée:", notifError);
      }
    }

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} bulletins publiés avec succès`,
    });
  } catch (error) {
    console.error("[API/bulletins/publier]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
