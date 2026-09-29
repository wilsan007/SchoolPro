import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import {
  choisirTarif,
  cycleDuNiveau,
  montantPourTypeFrais,
  normaliserTypeFrais,
  type TypeFrais,
} from "@/lib/domain/tarifs";

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
  // Type de frais normalisé : toute valeur inconnue retombe sur MENSUALITE,
  // comme avant (contrat d'API inchangé).
  const typeFrais = normaliserTypeFrais(searchParams.get("type"));

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

  // Le niveau est saisi librement des deux côtés, et PAS dans le même
  // référentiel : la classe porte une ANNÉE (« 6ème », « Terminale A ») quand
  // la grille tarifaire est libellée par CYCLE (« Collège », « Lycée »).
  // L'ancienne comparaison de chaînes ne correspondait jamais : l'application
  // mobile recevait donc toujours « found: false ». `choisirTarif` ramène les
  // deux écritures à une clé canonique puis applique la règle : tarif du site
  // de l'élève, sinon tarif global.
  const tarifs = await prisma.tarifNiveau.findMany({
    where: {
      tenantId: user.tenantId,
      annee: anneeCourante ?? new Date().getFullYear().toString(),
      actif: true,
      OR: [{ siteId: null }, { siteId: classe.siteId ?? undefined }],
    },
  });

  const choix = choisirTarif(tarifs, classe.siteId, classe.niveau);

  if (!choix) {
    // Aucun tarif utilisable : on refuse de facturer plutôt que de deviner.
    const cycle = cycleDuNiveau(classe.niveau);
    return NextResponse.json({
      found: false,
      message: cycle
        ? `Aucun tarif trouvé pour le niveau ${classe.niveau}`
        : `Niveau « ${classe.niveau} » non reconnu : aucun tarif appliqué`,
    });
  }

  const { tarif } = choix;

  // 0 = frais non proposé par la grille (contrat d'API conservé).
  const montant = montantPourTypeFrais(tarif, typeFrais) ?? 0;

  const libelles: Record<TypeFrais, string> = {
    MENSUALITE: `Scolarité ${anneeCourante ?? ""}`,
    INSCRIPTION: `Frais d'inscription ${anneeCourante ?? ""}`,
    RENOUVELLEMENT: `Frais de renouvellement ${anneeCourante ?? ""}`,
    CANTINE: `Cantine ${anneeCourante ?? ""}`,
    TRANSPORT: `Transport ${anneeCourante ?? ""}`,
  };

  return NextResponse.json({
    found: true,
    montant,
    devise: tarif.devise,
    libelleAuto: libelles[typeFrais],
    niveau: classe.niveau,
    cycleNiveau: cycleDuNiveau(classe.niveau),
    niveauTarif: tarif.niveau,
    sourceTarif: choix.source,
    nbMois: tarif.nbMois,
  });
}
