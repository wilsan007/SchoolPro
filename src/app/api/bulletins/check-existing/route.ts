import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");

    if (!classeId || !periodeId) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Route sans contrôle de permission : elle est atteignable par un PARENT
    // ou un élève, pour qui le filtre de site est neutre (périmètre
    // relationnel, cf. site-scope.ts). Le compte ne renseignait donc pas
    // « mes enfants » mais l'état de génération de n'importe quelle classe.
    // `personalScopeFilter` borne ces rôles sans rien changer au personnel.
    const siteFilter = mergeFilters(
      siteFilterForModel("bulletin", session.user),
      personalScopeFilter(session.user, "eleve")
    );
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
    const anneeFilter = anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {};

    const count = await prisma.bulletin.count({
      where: {
        eleve: { classeId },
        periodeId,
        tenantId: session.user.tenantId,
        ...siteFilter,
        ...anneeFilter,
      },
    });

    if (count === 0) {
      return NextResponse.json({ exists: false, published: false, verrouille: false });
    }

    const publishedCount = await prisma.bulletin.count({
      where: {
        eleve: { classeId },
        periodeId,
        tenantId: session.user.tenantId,
        isPublie: true,
        ...siteFilter,
        ...anneeFilter,
      },
    });

    // Un bulletin est verrouillé si son statut est VERROUILLE ou PUBLIE
    const verrouilleCount = await prisma.bulletin.count({
      where: {
        eleve: { classeId },
        periodeId,
        tenantId: session.user.tenantId,
        statut: { in: ["VERROUILLE", "PUBLIE"] },
        ...siteFilter,
        ...anneeFilter,
      },
    });

    return NextResponse.json({
      exists: true,
      published: publishedCount > 0,
      verrouille: verrouilleCount > 0,
      count,
    });
  } catch (error) {
    console.error("[API/bulletins/check-existing]", error);
    return NextResponse.json({ exists: false, published: false });
  }
}
