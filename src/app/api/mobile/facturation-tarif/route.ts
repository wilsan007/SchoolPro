import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Tarif applicable pour une classe — version mobile de /api/facturation/tarif.
 *
 * GET /api/mobile/facturation-tarif?classeId=...&type=MENSUALITE|INSCRIPTION|...
 *
 * Pas de vérification de permission finance:read : un parent peut consulter
 * le tarif de la classe de son enfant. Le scope eleve garantit qu'il ne peut
 * voir que les classes de ses enfants.
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const type = searchParams.get("type") ?? "MENSUALITE";

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);

  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: user.tenantId,
      ...siteFilterForModel("classe", user),
      ...(anneeCourante ? { annee: anneeCourante } : {}),
    },
    select: { id: true, nom: true, niveau: true, siteId: true },
  });

  if (!classe) {
    return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
  }

  const tarif = await prisma.tarifNiveau.findFirst({
    where: {
      tenantId: user.tenantId,
      niveau: classe.niveau,
      annee: anneeCourante ?? new Date().getFullYear().toString(),
      actif: true,
      OR: [{ siteId: null }, { siteId: classe.siteId ?? undefined }],
    },
    orderBy: { siteId: "desc" },
  });

  if (!tarif) {
    return NextResponse.json({
      found: false,
      message: `Aucun tarif trouvé pour le niveau ${classe.niveau}`,
    });
  }

  let montant = 0;
  let libelleAuto = "";
  switch (type) {
    case "MENSUALITE":
      montant = tarif.mensualite;
      libelleAuto = `Scolarité ${anneeCourante ?? ""}`;
      break;
    case "INSCRIPTION":
      montant = tarif.fraisInscription;
      libelleAuto = `Frais d'inscription ${anneeCourante ?? ""}`;
      break;
    case "RENOUVELLEMENT":
      montant = tarif.fraisRenouvellement;
      libelleAuto = `Frais de renouvellement ${anneeCourante ?? ""}`;
      break;
    case "CANTINE":
      montant = tarif.fraisCantine ?? 0;
      libelleAuto = `Cantine ${anneeCourante ?? ""}`;
      break;
    case "TRANSPORT":
      montant = tarif.fraisTransport ?? 0;
      libelleAuto = `Transport ${anneeCourante ?? ""}`;
      break;
    default:
      montant = tarif.mensualite;
      libelleAuto = `Scolarité ${anneeCourante ?? ""}`;
  }

  return NextResponse.json({
    found: true,
    montant,
    devise: tarif.devise,
    libelleAuto,
    niveau: classe.niveau,
    nbMois: tarif.nbMois,
  });
}
