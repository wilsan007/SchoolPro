import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { NiveauAlerteParent } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "vie-scolaire:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    // Détection de décrochage : seuil de retards déclenchant une alerte
    // (5 par défaut — laissé à l'appréciation du CPE via le paramètre).
    const seuil = Math.max(1, parseInt(searchParams.get("seuil") ?? "5", 10) || 5);
    const alerter = searchParams.get("alerter") === "true";
    const tenantId = session.user.tenantId;
    const anneeCourante = await getAnneeCouranteLibelle(tenantId);
    const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};
    const maintenant = await getDemoNow();

    const dateFilter: Record<string, unknown> = { lte: maintenant };
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);

    const where: Record<string, unknown> = {
      tenantId,
      isRetard: true,
      ...siteFilterForModel("absence", session.user),
      ...(classeId ? { eleve: { classeId } } : {}),
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      ...anneeEleve,
    };

    const retards = await prisma.absence.findMany({
      where,
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      },
      orderBy: { date: "desc" },
    });

    const parEleveMap = new Map<string, { eleveId: string; nom: string; prenom: string; classe: string | null; retards: number; dernierRetard: Date }>();
    const parJourMap = new Map<number, number>();

    for (const r of retards) {
      const key = r.eleveId;
      const existing = parEleveMap.get(key);
      if (existing) {
        existing.retards += 1;
        if (new Date(r.date) > new Date(existing.dernierRetard)) {
          existing.dernierRetard = r.date;
        }
      } else {
        parEleveMap.set(key, {
          eleveId: r.eleveId,
          nom: r.eleve.nom,
          prenom: r.eleve.prenom,
          classe: r.eleve.classe?.nom ?? null,
          retards: 1,
          dernierRetard: r.date,
        });
      }
      const jour = new Date(r.date).getDay();
      parJourMap.set(jour, (parJourMap.get(jour) ?? 0) + 1);
    }

    const parEleve = [...parEleveMap.values()].sort((a, b) => b.retards - a.retards);
    const parJour = Array.from(parJourMap.entries())
      .map(([jour, retards]) => ({ jour, retards }))
      .sort((a, b) => a.jour - b.jour);

    // Élèves au-dessus du seuil : signal de décrochage scolaire précoce.
    const aRisque = parEleve.filter((e) => e.retards >= seuil);

    // L'enseignant/CPE décide (alerter=true) : on alerte les parents des
    // élèves concernés via AlerteParent — écriture idempotente par mois,
    // re-consulter les stats ne renvoie pas l'alerte en double.
    let alertesCreees = 0;
    if (alerter && aRisque.length > 0) {
      const elevesAvecParents = await prisma.eleve.findMany({
        where: {
          id: { in: aRisque.map((e) => e.eleveId) },
          tenantId,
          ...siteFilterForModel("eleve", session.user),
        },
        select: {
          id: true,
          siteId: true,
          parents: { include: { parent: { select: { id: true } } } },
        },
      });
      const parEleveSite = new Map(elevesAvecParents.map((e) => [e.id, e.siteId ?? null]));
      const mois = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}`;

      const alertes = elevesAvecParents.flatMap((eleve) =>
        eleve.parents.map((ep) => {
          const retards = parEleveMap.get(eleve.id)?.retards ?? 0;
          const info = parEleveMap.get(eleve.id);
          return {
            tenantId,
            siteId: parEleveSite.get(eleve.id) ?? null,
            eleveId: eleve.id,
            parentId: ep.parent.id,
            niveau: retards >= seuil * 2 ? NiveauAlerteParent.URGENT : NiveauAlerteParent.ATTENTION,
            cle: "retards.exces",
            params: {
              retards,
              seuil,
              prenom: info?.prenom ?? "",
              nom: info?.nom ?? "",
              classeNom: info?.classe ?? null,
              dernierRetard: info ? new Date(info.dernierRetard).toISOString() : null,
            },
            empreinte: `retards-${eleve.id}-${mois}`,
          };
        })
      );

      if (alertes.length > 0) {
        const res = await prisma.alerteParent.createMany({ data: alertes, skipDuplicates: true });
        alertesCreees = res.count;
      }
    }

    return NextResponse.json({
      totalRetards: retards.length,
      seuil,
      aRisque: aRisque.map((e) => ({ eleveId: e.eleveId, nom: e.nom, prenom: e.prenom, retards: e.retards })),
      alertesCreees,
      parEleve,
      parJour,
    });
  } catch (error) {
    console.error("[API/vie-scolaire/retards-stats GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
