import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
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
  const denied = await checkPermission(session.user.role, "finance:read");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  // Type de frais normalisé : toute valeur inconnue retombe sur MENSUALITE,
  // comme avant (contrat d'API inchangé).
  const typeFrais = normaliserTypeFrais(searchParams.get("type"));

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

  // Récupérer la classe avec son niveau
  const classe = await prisma.classe.findFirst({
    where: {
      id: classeId,
      tenantId: session.user.tenantId,
      ...siteFilterForModel("classe", session.user),
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
  // Comparer les chaînes telles quelles — l'ancien `niveau: classe.niveau` —
  // ne produisait jamais de correspondance : la route répondait donc
  // systématiquement « found: false », sans que rien ne signale l'erreur.
  // `choisirTarif` ramène les deux écritures à une clé canonique, puis
  // applique la règle : tarif du site de l'élève, sinon tarif global.
  const tarifs = await prisma.tarifNiveau.findMany({
    where: {
      tenantId: session.user.tenantId,
      annee: anneeCourante ?? new Date().getFullYear().toString(),
      actif: true,
      // Tarif global (siteId null) ou tarif propre au site de la classe.
      OR: [{ siteId: null }, { siteId: classe.siteId ?? undefined }],
    },
  });

  const choix = choisirTarif(tarifs, classe.siteId, classe.niveau);

  if (!choix) {
    // Aucun tarif utilisable : on REFUSE de facturer au lieu de deviner un
    // montant (règle 6 — le cloisonnement par défaut est fermé). Le message
    // distingue le niveau inexploitable de la grille simplement incomplète :
    // sans cette distinction, un libellé mal saisi ressemble à un tarif oublié.
    const cycle = cycleDuNiveau(classe.niveau);
    return NextResponse.json({
      found: false,
      message: cycle
        ? `Aucun tarif trouvé pour le niveau ${classe.niveau} (${anneeCourante ?? "année courante"})`
        : `Niveau « ${classe.niveau} » non reconnu : aucun tarif appliqué (aucun montant deviné)`,
    });
  }

  const { tarif } = choix;

  // 0 = frais non proposé par la grille (cantine ou transport absents).
  // Le contrat d'API renvoie un nombre, jamais null : on conserve donc 0,
  // comme avant, et l'appelant sait que `found: true` ne vaut pas
  // « l'option existe ».
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
    // Champs de diagnostic : quel cycle a été déduit, quelle ligne de la
    // grille a répondu, et si elle portait le libellé exact de la classe.
    cycleNiveau: cycleDuNiveau(classe.niveau),
    niveauTarif: tarif.niveau,
    sourceTarif: choix.source,
    nbMois: tarif.nbMois,
  });
}
