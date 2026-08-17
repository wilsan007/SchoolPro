import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidateTag, revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { eleveIds, nouvelleClasseId } = body as {
    eleveIds: string[];
    nouvelleClasseId: string;
  };

  if (!eleveIds?.length || !nouvelleClasseId) {
    return NextResponse.json({ error: "eleveIds et nouvelleClasseId requis" }, { status: 400 });
  }


  const classeFilter = siteFilterForModel("classe", session.user);
  const eleveFilter = siteFilterForModel("eleve", session.user);
  const targetClasse = await prisma.classe.findFirst({
    where: { id: nouvelleClasseId, tenantId: session.user.tenantId, ...classeFilter },
  });

  if (!targetClasse) {
    return NextResponse.json({ error: "Classe destination introuvable" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Mettre à jour les élèves
    const updated = await tx.eleve.updateMany({
      where: {
        id: { in: eleveIds },
        tenantId: session.user.tenantId!,
        ...eleveFilter,
      },
      data: { classeId: nouvelleClasseId },
    });

    // Clôturer l'historique ancien et créer le nouveau (date d'effet)
    await tx.historiqueClasse.updateMany({
      where: { eleveId: { in: eleveIds }, dateSortie: null },
      data: { dateSortie: new Date(), motif: "Transfert" },
    });
    await tx.historiqueClasse.createMany({
      data: eleveIds.map((eleveId) => ({
        tenantId: session.user.tenantId!,
        eleveId,
        classeId: nouvelleClasseId,
        dateEntree: new Date(),
        motif: "Transfert",
      })),
    });

    return updated;
  });

  // --- Notifications IN_APP aux parents des élèves transférés ---
  try {
    // Récupérer les infos des élèves (ancien nom de classe via historique, nouveau nom)
    const elevesTransf = await prisma.eleve.findMany({
      where: {
        id: { in: eleveIds },
        tenantId: session.user.tenantId!,
        ...eleveFilter,
      },
      select: {
        id: true,
        nom: true,
        prenom: true,
        classe: { select: { nom: true } },
      },
    });

    // Récupérer l'ancien nom de classe depuis l'historique clôturé
    const historiques = await prisma.historiqueClasse.findMany({
      where: {
        eleveId: { in: eleveIds },
        tenantId: session.user.tenantId!,
        motif: "Transfert",
        dateSortie: { not: null },
      },
      include: { classe: { select: { nom: true } } },
      orderBy: { dateSortie: "desc" },
    });

    const ancienneClasseParEleve = new Map<string, string>();
    for (const h of historiques) {
      if (!ancienneClasseParEleve.has(h.eleveId)) {
        ancienneClasseParEleve.set(h.eleveId, h.classe?.nom ?? "—");
      }
    }

    const nouvelleClasseNom = targetClasse.nom;

    for (const eleve of elevesTransf) {
      const ancienneClasse = ancienneClasseParEleve.get(eleve.id) ?? "—";
      const eleveNom = `${eleve.prenom} ${eleve.nom}`;
      try {
        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            siteId: session.user.siteId ?? null,
            titre: "Changement de classe",
            contenu: `Nous vous informons que ${eleveNom} a été transféré(e) de la classe ${ancienneClasse} vers la classe ${nouvelleClasseNom}.`,
            canal: "IN_APP",
            statut: "ENVOYEE",
            cible: "PARENTS",
            envoyeParId: session.user.id,
            nbDestinataires: 1,
            nbDelivres: 1,
            envoyeeAt: new Date(),
          },
        });
      } catch (notifError) {
        console.error("[changer-classe] Notification error for eleve", eleve.id, notifError);
      }
    }
  } catch (notifError) {
    console.error("[changer-classe] Notification error:", notifError);
  }

  revalidateTag("eleves-stats");
  // Les effectifs par classe affichés dans Paramètres → Pédagogie.
  revalidatePath("/parametres");
  revalidatePath("/eleves");
  revalidateTag("dashboard-data");
  revalidateTag("classes-list");

  return NextResponse.json({ count: result.count });
}
