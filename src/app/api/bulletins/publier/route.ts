import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { enregistrerHistoriqueBulletin } from "@/lib/bulletin-historique";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

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

    if (isTeacherRole(session.user.role as Role)) {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      const scope = await getTeacherScope(tenantId, session.user.id as string, session.user.role as Role, anneeCourante);
      if (scope.isRestricted && !scope.classeIds.includes(classeId)) {
        return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
      }
    }

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
        statut: "PUBLIE",
        publishedAt: new Date(),
        verrouilleAt: new Date(),
        verrouilleParId: session.user.id,
      },
    });

    // Tracer la publication dans l'historique pour chaque bulletin publié
    if (result.count > 0) {
      const bulletinsPublies = await prisma.bulletin.findMany({
        where: {
          tenantId,
          ...siteFilterForModel("bulletin", session.user),
          periodeId,
          eleveId: { in: eleveIds },
          isPublie: true,
        },
        select: { id: true },
      });
      for (const b of bulletinsPublies) {
        await enregistrerHistoriqueBulletin(
          b.id,
          tenantId,
          { id: session.user.id, name: session.user.name, role: session.user.role },
          "PUBLIER",
          "statut",
          JSON.stringify("BROUILLON"),
          JSON.stringify("PUBLIE")
        ).catch(() => {/* non-fatal */});
      }
    }

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
