import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

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

    return NextResponse.json({
      totalRetards: retards.length,
      parEleve,
      parJour,
    });
  } catch (error) {
    console.error("[API/vie-scolaire/retards-stats GET]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
