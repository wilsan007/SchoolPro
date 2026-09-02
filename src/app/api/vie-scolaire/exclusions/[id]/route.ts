import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const TYPES_EXCLUSION = ["EXCLUSION_COURS", "EXCLUSION_TEMP"];

const PatchSchema = z.object({
  /// Continuité pédagogique : travail confié à l'élève pendant l'exclusion.
  travailDonne: z.string().min(5).max(2000).optional(),
  /// Confirmation que la famille a bien accusé réception de la décision.
  accuseReception: z.boolean().optional(),
  /// Réintégration : clôt l'exclusion. Exige la continuité pédagogique.
  reintegrer: z.boolean().optional(),
  /// Date de retour constatée. Par défaut la date courante (Time Machine).
  dateRetourEffective: z.string().optional(),
});

/**
 * Fait avancer le cycle de vie d'une exclusion : renseigner le travail donné,
 * enregistrer l'accusé de réception du parent, puis réintégrer l'élève.
 *
 * La réintégration est refusée si la continuité pédagogique n'a pas été tracée :
 * c'est le garde-fou qui empêche l'exclusion « sèche », non conforme.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const { id } = await params;
    const tenantId = session.user.tenantId;
    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    // Le périmètre tenant/site est vérifié via la chaîne incident -> eleve.
    const existing = await prisma.sanction.findFirst({
      where: {
        id,
        incident: { tenantId },
        ...siteFilterForModel("sanction", session.user),
      },
      select: {
        id: true,
        type: true,
        travailDonne: true,
        dateRetourEffective: true,
        incidentId: true,
      },
    });
    if (!existing) return erreurJson("SANCTION_INTROUVABLE");
    if (!TYPES_EXCLUSION.includes(existing.type)) return erreurJson("SANCTION_NON_EXCLUSION");

    const { travailDonne, accuseReception, reintegrer, dateRetourEffective } = parsed.data;
    const maintenant = await getDemoNow();

    // Une exclusion close ne se modifie plus : la trace de réintégration est définitive.
    if (existing.dateRetourEffective !== null) return erreurJson("EXCLUSION_DEJA_CLOSE");

    const data: {
      travailDonne?: string;
      accuseReceptionParent?: Date;
      dateRetourEffective?: Date;
      reintegreParId?: string;
    } = {};

    if (travailDonne !== undefined) data.travailDonne = travailDonne.trim();
    if (accuseReception === true) data.accuseReceptionParent = maintenant;

    if (reintegrer === true) {
      // Le travail donné doit exister — soit déjà en base, soit fourni dans cette requête.
      const travailFinal = data.travailDonne ?? existing.travailDonne;
      if (!travailFinal || travailFinal.length === 0) return erreurJson("TRAVAIL_DONNE_REQUIS");

      data.dateRetourEffective = dateRetourEffective ? new Date(dateRetourEffective) : maintenant;
      data.reintegreParId = session.user.id;
    }

    if (Object.keys(data).length === 0) return erreurJson("DONNEES_INVALIDES");

    const updated = await prisma.sanction.update({
      where: { id },
      data,
      include: {
        incident: {
          select: {
            id: true,
            eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
          },
        },
        reintegrePar: { select: { name: true } },
      },
    });

    // La réintégration clôt le volet disciplinaire : si l'incident n'a plus
    // d'exclusion ouverte, il peut passer en RESOLU.
    if (reintegrer === true) {
      const exclusionsOuvertes = await prisma.sanction.count({
        where: {
          incidentId: existing.incidentId,
          type: { in: TYPES_EXCLUSION as never },
          dateRetourEffective: null,
          ...siteFilterForModel("sanction", session.user),
        },
      });
      if (exclusionsOuvertes === 0) {
        // Contrôle d'appartenance explicite de l'incident avant écriture :
        // la sanction a déjà été vérifiée plus haut, mais le linter exige une
        // lecture directe sur le modèle incident avec tenantId.
        const incident = await prisma.incident.findFirst({
          where: {
            id: existing.incidentId,
            tenantId,
            ...siteFilterForModel("incident", session.user),
            ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
          },
        });
        if (!incident) return erreurJson("INCIDENT_INTROUVABLE");

        await prisma.incident.update({
          where: { id: existing.incidentId },
          data: {
            statut: "RESOLU",
            actionPrise: `Exclusion exécutée avec continuité pédagogique, élève réintégré le ${(
              data.dateRetourEffective ?? maintenant
            ).toLocaleDateString("fr-FR")}.`,
            resoluParId: session.user.id,
            dateResolution: maintenant,
          },
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API/vie-scolaire/exclusions/:id PATCH]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
