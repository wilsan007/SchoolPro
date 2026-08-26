import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * GET /api/facturation/tarif?classeId=...&type=MENSUALITE|INSCRIPTION|CANTINE|TRANSPORT
 *
 * Récupère le tarif applicable pour une classe donnée, en fonction du niveau
 * de la classe et de l'année scolaire courante. Retourne le montant et la
 * devise depuis le modèle TarifNiveau.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const type = searchParams.get("type") ?? "MENSUALITE";

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  // Récupérer la classe avec son niveau
  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("classe", session.user),
    },
    select: { id: true, nom: true, niveau: true, siteId: true },
  });

  if (!classe) {
    return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
  }

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  // Chercher le tarif pour ce niveau et cette année
  const tarif = await prisma.tarifNiveau.findFirst({
    where: {
      tenantId: session.user.tenantId,
      niveau: classe.niveau,
      annee: anneeCourante ?? new Date().getFullYear().toString(),
      actif: true,
      // Site filter: tarif peut être global (siteId null) ou spécifique au site
      OR: [
        { siteId: null },
        { siteId: classe.siteId ?? undefined },
      ],
    },
    orderBy: { siteId: "desc" }, // Préférer le tarif spécifique au site
  });

  if (!tarif) {
    return NextResponse.json({
      found: false,
      message: `Aucun tarif trouvé pour le niveau ${classe.niveau} (${anneeCourante ?? "année courante"})`,
    });
  }

  // Mapper le type demandé au champ correspondant
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
