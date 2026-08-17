import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, requireSiteIdForCreate } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";

const CreateSchema = z.object({
  eleveId: z.string().min(1),
  type: z.enum(["RETARD", "BAVARDAGE", "INSOLENCE", "BAGARRE", "TRICHE", "VANDALISM", "ABSENTEISME", "AUTRE"]),
  gravite: z.number().int().min(1).max(3),
  description: z.string().min(5).max(2000),
  lieu: z.string().max(100).optional(),
  date: z.string(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const eleveId = searchParams.get("eleveId");
    const statut = searchParams.get("statut");
    const tenantId = session.user.tenantId;

    const incidents = await prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", session.user),
        ...(eleveId ? { eleveId } : {}),
        ...(statut ? { statut: statut as never } : {}),
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(incidents);
  } catch (error) {
    console.error("[API/vie-scolaire/incidents GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return erreurJson("DONNEES_INVALIDES", undefined, { siteError });

    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { eleveId, type, gravite, description, lieu, date, notes } = parsed.data;
    const tenantId = session.user.tenantId;

    // Vérifier que l'élève appartient au tenant
    const eleve = await prisma.eleve.findFirst({
      where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", session.user) },
    });
    if (!eleve) return erreurJson("ELEVE_INTROUVABLE");

    const incident = await prisma.incident.create({
      data: {
        tenantId,
        eleveId,
        rapporteParId: session.user.id,
        type,
        gravite,
        description,
        lieu: lieu ?? null,
        date: new Date(date),
        notes: notes ?? null,
        statut: "OUVERT",
      },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
    });

    // --- Notification IN_APP aux parents pour les incidents graves (gravite >= 2) ---
    // Non-bloquante : un échec de notification ne doit pas faire échouer la
    // création de l'incident.
    if (gravite >= 2) {
      try {
        // eslint-disable-next-line ecolpro/require-site-filter -- eleve vérifié avec tenantId + siteFilter ci-dessus
        const eleveAvecParents = await prisma.eleve.findUnique({
          where: { id: eleveId },
          select: {
            parents: {
              include: { parent: { select: { id: true } } },
            },
          },
        });

        const nbParents = eleveAvecParents?.parents.length ?? 0;
        if (nbParents > 0) {
          const eleveNom = `${incident.eleve.prenom} ${incident.eleve.nom}`;
          await prisma.notification.create({
            data: {
              tenantId,
              titre: `Incident signalé - ${eleveNom}`,
              contenu:
                `Bonjour,\n\nNous vous informons qu'un incident de type « ${type} » ` +
                `a été signalé concernant ${eleveNom} le ${new Date(date).toLocaleDateString("fr-FR")}.\n\n` +
                `Description : ${description}\n\nVeuillez contacter l'établissement pour plus d'informations.`,
              canal: "IN_APP",
              cible: "PARENTS",
              envoyeParId: session.user.id,
              nbDestinataires: nbParents,
              nbDelivres: nbParents,
              statut: "ENVOYEE",
              envoyeeAt: new Date(),
            },
          });
        }
      } catch (notifError) {
        console.error("[API/vie-scolaire/incidents] Notification parents échouée:", notifError);
      }
    }

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error("[API/vie-scolaire/incidents POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
