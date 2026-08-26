import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "finance:read");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const claims = session.user as SessionSiteClaims;
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const siteId = searchParams.get("siteId") ?? undefined;

    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo) : undefined;

    const siteFilterPaiement = siteFilterForModel("paiement", claims);
    const siteFilterDepense = siteFilterForModel("depense", claims);
    const siteFilterRelance = siteFilterForModel("relance", claims);
    const siteFilterFacture = siteFilterForModel("facture", claims);

    const anneeId = await anneeActiveId(tenantId);

    const [paiements, depenses, facturesEnAttente, facturesEnRetard, relancesEnvoyees] =
      await Promise.all([
        prisma.paiement.findMany({
          where: {
            ...siteFilterPaiement,
            facture: { tenantId, ...(siteId ? { siteId } : {}), ...(anneeId ? { anneeId } : {}) },
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
          include: {
            facture: {
              select: {
                numero: true,
                libelle: true,
                eleve: { select: { nom: true, prenom: true, matricule: true } },
              },
            },
          },
          orderBy: { date: "desc" },
        }),
        prisma.depense.findMany({
          where: {
            tenantId,
            ...siteFilterDepense,
            ...(siteId ? { siteId } : {}),
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
          orderBy: { date: "desc" },
        }),
        prisma.facture.aggregate({
          _sum: { montant: true },
          _count: true,
          where: {
            tenantId,
            statut: "EN_ATTENTE",
            ...(anneeId ? { anneeId } : {}),
            ...siteFilterFacture,
            ...(siteId ? { siteId } : {}),
          },
        }),
        prisma.facture.aggregate({
          _sum: { montant: true },
          _count: true,
          where: {
            tenantId,
            statut: "EN_RETARD",
            ...(anneeId ? { anneeId } : {}),
            ...siteFilterFacture,
            ...(siteId ? { siteId } : {}),
          },
        }),
        prisma.relance.count({
          where: { tenantId, ...siteFilterRelance, ...(anneeId ? { facture: { anneeId } } : {}) },
        }),
      ]);

    const totalRecettes = paiements.reduce((s, p) => s + p.montant, 0);
    const totalDepenses = depenses.reduce((s, d) => s + d.montant, 0);

    const recettesParCategorie = new Map<string, number>();
    for (const p of paiements) {
      const cat = p.facture?.libelle ?? "Autre";
      recettesParCategorie.set(cat, (recettesParCategorie.get(cat) ?? 0) + p.montant);
    }
    const depensesParCategorie = new Map<string, number>();
    for (const d of depenses) {
      const cat = d.categorie;
      depensesParCategorie.set(cat, (depensesParCategorie.get(cat) ?? 0) + d.montant);
    }

    const evolutionMensuelle = computeEvolutionMensuelle(paiements, depenses);

    return NextResponse.json({
      journalRecettes: paiements,
      journalDepenses: depenses,
      compteResultat: {
        totalRecettes,
        totalDepenses,
        resultatNet: totalRecettes - totalDepenses,
      },
      bilanParCategorie: {
        recettes: Array.from(recettesParCategorie.entries()).map(([categorie, montant]) => ({
          categorie,
          montant,
        })),
        depenses: Array.from(depensesParCategorie.entries()).map(([categorie, montant]) => ({
          categorie,
          montant,
        })),
      },
      evolutionMensuelle,
      facturesEnAttente: {
        count: facturesEnAttente._count,
        montantTotal: facturesEnAttente._sum?.montant ?? 0,
      },
      facturesEnRetard: {
        count: facturesEnRetard._count,
        montantTotal: facturesEnRetard._sum?.montant ?? 0,
      },
      relancesEnvoyees: relancesEnvoyees,
    });
  } catch (error) {
    console.error("[API/finances/comptabilite]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

function computeEvolutionMensuelle(
  paiements: Array<{ date: Date; montant: number }>,
  depenses: Array<{ date: Date; montant: number }>
): Array<{ mois: string; recettes: number; depenses: number }> {
  const map = new Map<string, { recettes: number; depenses: number }>();
  for (const p of paiements) {
    const mois = p.date.toISOString().substring(0, 7);
    const entry = map.get(mois) ?? { recettes: 0, depenses: 0 };
    entry.recettes += p.montant;
    map.set(mois, entry);
  }
  for (const d of depenses) {
    const mois = d.date.toISOString().substring(0, 7);
    const entry = map.get(mois) ?? { recettes: 0, depenses: 0 };
    entry.depenses += d.montant;
    map.set(mois, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mois, v]) => ({ mois, ...v }));
}
