import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:read");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");

    if (!classeId) {
      return NextResponse.json({ error: "classeId est requis" }, { status: 400 });
    }

    // Récupérer les élèves de la classe
    const eleves = await prisma.eleve.findMany({
      where: { classeId, tenantId: session.user.tenantId, statut: "ACTIF" },
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        bulletins: {
          select: {
            moyenneGenerale: true,
            periode: { select: { nom: true, numero: true } }
          }
        }
      },
      orderBy: { nom: "asc" }
    });

    // Calcul de la moyenne annuelle (moyenne des moyennes des bulletins existants)
    const bilanAnnuel = eleves.map(eleve => {
      const bulletinsAverages = eleve.bulletins
        .filter(b => b.moyenneGenerale !== null)
        .map(b => b.moyenneGenerale as number);
        
      const moyenneAnnuelle = bulletinsAverages.length > 0
        ? bulletinsAverages.reduce((a, b) => a + b, 0) / bulletinsAverages.length
        : null;

      // Décision automatique basique (modifiable plus tard)
      let decisionProposee = "";
      if (moyenneAnnuelle !== null) {
        if (moyenneAnnuelle >= 10) decisionProposee = "PASSAGE";
        else decisionProposee = "REDOUBLEMENT";
      }

      return {
        ...eleve,
        moyenneAnnuelle: moyenneAnnuelle ? Number(moyenneAnnuelle.toFixed(2)) : null,
        decisionProposee
      };
    });

    // Calcul des rangs annuels
    bilanAnnuel.sort((a, b) => (b.moyenneAnnuelle || 0) - (a.moyenneAnnuelle || 0));
    bilanAnnuel.forEach((eleve, index) => {
      (eleve as any).rangAnnuel = eleve.moyenneAnnuelle !== null ? index + 1 : null;
    });

    // Re-trier alphabétiquement pour l'affichage
    bilanAnnuel.sort((a, b) => a.nom.localeCompare(b.nom));

    return NextResponse.json({ bilans: bilanAnnuel });
  } catch (error) {
    console.error("[API/bulletins/annuel]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
