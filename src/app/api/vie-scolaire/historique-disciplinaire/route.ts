import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const eleveId = searchParams.get("eleveId");
    if (!eleveId) return erreurJson("DONNEES_INVALIDES");
    const tenantId = session.user.tenantId;

    const eleve = await prisma.eleve.findFirst({
      where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", session.user) },
      select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
    });
    if (!eleve) return erreurJson("ELEVE_INTROUVABLE");

    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};

    const [incidents, exclusions] = await Promise.all([
      prisma.incident.findMany({
        where: { tenantId, eleveId, ...siteFilterForModel("incident", session.user), ...anneeEleve },
        include: {
          rapportePar: { select: { name: true } },
          resoluPar: { select: { name: true } },
          sanctions: true,
        },
        orderBy: { date: "desc" },
      }),
      prisma.exclusionEleve.findMany({
        where: { tenantId, eleveId, ...siteFilterForModel("exclusionEleve", session.user), ...anneeEleve },
        include: { decideePar: { select: { name: true } } },
        orderBy: { dateDebut: "desc" },
      }),
    ]);

    const timeline: Array<Record<string, unknown>> = [];

    for (const inc of incidents) {
      timeline.push({
        type: "incident",
        id: inc.id,
        date: inc.date,
        nature: inc.type,
        description: inc.description,
        gravite: inc.gravite,
        statut: inc.statut,
        rapportePar: inc.rapportePar?.name ?? null,
        resoluPar: inc.resoluPar?.name ?? null,
        actionPrise: inc.actionPrise ?? null,
      });
      for (const s of inc.sanctions) {
        timeline.push({
          type: "sanction",
          id: s.id,
          date: s.dateDebut,
          sanctionType: s.type,
          description: s.description ?? null,
          dateDebut: s.dateDebut,
          dateFin: s.dateFin ?? null,
          parentNotifie: s.parentNotifie,
        });
      }
    }

    for (const ex of exclusions) {
      timeline.push({
        type: "exclusion",
        id: ex.id,
        date: ex.dateDebut,
        nature: ex.motif,
        description: ex.details ?? null,
        dateDebut: ex.dateDebut,
        dateFin: ex.dateFin ?? null,
        decideePar: ex.decideePar?.name ?? null,
      });
    }

    timeline.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    const totalIncidents = incidents.length;
    const incidentsOuverts = incidents.filter((i) => i.statut === "OUVERT" || i.statut === "EN_TRAITEMENT").length;
    const incidentsResolus = incidents.filter((i) => i.statut === "RESOLU" || i.statut === "CLASSE").length;
    const totalSanctions = incidents.reduce((acc, i) => acc + i.sanctions.length, 0);
    const now = await getDemoNow();
    const exclusionsEnCours = exclusions.filter((e) => !e.dateFin || new Date(e.dateFin) > now).length;
    const graviteMoyenne = totalIncidents > 0
      ? Math.round((incidents.reduce((acc, i) => acc + i.gravite, 0) / totalIncidents) * 100) / 100
      : 0;

    return NextResponse.json({
      eleve,
      timeline,
      stats: {
        totalIncidents,
        incidentsOuverts,
        incidentsResolus,
        totalSanctions,
        exclusionsEnCours,
        graviteMoyenne,
      },
    });
  } catch (error) {
    console.error("[API/vie-scolaire/historique-disciplinaire GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
