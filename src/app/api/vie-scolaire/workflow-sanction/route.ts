import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { auditFire } from "@/lib/audit";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const ActionSchema = z.object({
  incidentId: z.string().min(1),
  action: z.enum(["notifier-parents", "convocation", "escalade"]),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
    }

    const { incidentId, action } = parsed.data;
    const tenantId = session.user.tenantId;

    const incident = await prisma.incident.findFirst({
      where: { id: incidentId, tenantId, ...siteFilterForModel("incident", session.user) },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
    });
    if (!incident) return erreurJson("INCIDENT_INTROUVABLE");

    const eleveNom = `${incident.eleve.prenom} ${incident.eleve.nom}`;

    if (action === "notifier-parents") {
      // eslint-disable-next-line ecolpro/require-site-filter -- parent lookup is tenant-scoped via eleveId
      const parents = await prisma.parent.findMany({
        where: {
          tenantId,
          enfants: { some: { eleveId: incident.eleveId } },
        },
        select: { id: true, email: true, phone: true, userId: true },
      });

      if (parents.length === 0) {
        return erreurJson("DONNEES_INVALIDES", undefined, { detail: "no-parents" });
      }

      const notif = await prisma.notification.create({
        data: {
          tenantId,
          titre: `Incident signalé - ${eleveNom}`,
          contenu:
            `Bonjour,\n\nNous vous informons qu'un incident de type « ${incident.type} » ` +
            `a été signalé concernant ${eleveNom} le ${incident.date.toLocaleDateString("fr-FR")}.\n\n` +
            `Description : ${incident.description}\n\nVeuillez contacter l'établissement pour plus d'informations.`,
          canal: "IN_APP",
          cible: "PARENTS",
          envoyeParId: session.user.id,
          nbDestinataires: parents.length,
          statut: "BROUILLON",
        },
      });

      try {
        await dispatchNotification(notif.id, tenantId);
      } catch (dispatchErr) {
        console.error("[workflow-sanction] dispatch échoué:", dispatchErr);
      }

      auditFire({
        userId: session.user.id,
        tenantId,
        action: "workflow-sanction:notifier-parents",
        verdict: "ALLOWED",
        resource: "incident",
        resourceId: incidentId,
        metadata: { eleveId: incident.eleveId, nbParents: parents.length },
      });

      return NextResponse.json({ ok: true, action, notifId: notif.id, nbParents: parents.length });
    }

    if (action === "convocation") {
      const sanction = await prisma.sanction.create({
        data: {
          incidentId,
          type: "CONVOCATION_PARENTS",
          description: `Convocation suite à incident du ${incident.date.toLocaleDateString("fr-FR")}`,
          dateDebut: new Date(),
          parentNotifie: false,
        },
      });

      auditFire({
        userId: session.user.id,
        tenantId,
        action: "workflow-sanction:convocation",
        verdict: "ALLOWED",
        resource: "sanction",
        resourceId: sanction.id,
        metadata: { incidentId, eleveId: incident.eleveId },
      });

      return NextResponse.json({ ok: true, action, sanctionId: sanction.id });
    }

    if (action === "escalade") {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
      const incidentsGraves = await prisma.incident.findMany({
        where: {
          tenantId,
          eleveId: incident.eleveId,
          gravite: 3,
          statut: { in: ["OUVERT", "EN_TRAITEMENT"] },
          ...siteFilterForModel("incident", session.user),
          ...anneeEleve,
        },
        select: { id: true },
      });

      if (incidentsGraves.length < 3) {
        return erreurJson("DONNEES_INVALIDES", undefined, {
          detail: "escalade-condition-not-met",
          count: incidentsGraves.length,
        });
      }

      const dateDebut = new Date();
      const dateFin = new Date();
      dateFin.setDate(dateFin.getDate() + 3);

      const sanction = await prisma.sanction.create({
        data: {
          incidentId,
          type: "EXCLUSION_TEMP",
          description: `Exclusion temporaire - escalade (${incidentsGraves.length} incidents graves ouverts)`,
          dateDebut,
          dateFin,
          parentNotifie: false,
        },
      });

      auditFire({
        userId: session.user.id,
        tenantId,
        action: "workflow-sanction:escalade",
        verdict: "ALLOWED",
        resource: "sanction",
        resourceId: sanction.id,
        metadata: { incidentId, eleveId: incident.eleveId, nbIncidentsGraves: incidentsGraves.length },
      });

      return NextResponse.json({ ok: true, action, sanctionId: sanction.id, nbIncidentsGraves: incidentsGraves.length });
    }

    return erreurJson("DONNEES_INVALIDES");
  } catch (error) {
    console.error("[API/vie-scolaire/workflow-sanction POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
