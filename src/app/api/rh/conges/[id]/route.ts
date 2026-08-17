import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, mergeFilters } from "@/lib/site-filter";

const ActionSchema = z.object({
  action: z.enum(["APPROUVE", "REFUSE", "ANNULE"]),
  commentaire: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "rh:write");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const { action, commentaire } = ActionSchema.parse(body);

  const conge = await prisma.congePersonnel.findFirst({
    where: mergeFilters(
      { id, tenantId: session.user.tenantId },
      siteFilterForModel("congePersonnel", session.user)
    ),
  });
  if (!conge) {
    return NextResponse.json({ error: "Congé introuvable" }, { status: 404 });
  }

  const updated = await prisma.congePersonnel.update({
    where: { id },
    data: {
      statut: action,
      approuveParId: session.user.id,
      approuveAt: new Date(),
      commentaire: commentaire || conge.commentaire,
    },
  });

  if (action === "APPROUVE" && conge.type === "ANNUEL") {
    // Le congé résolu ci-dessus est déjà borné au tenant/site de l'appelant :
    // revérifier l'appartenance de la fiche RH avant l'écriture.
    const ficheExistante = await prisma.ficheRH.findFirst({
      where: mergeFilters(
        { enseignantId: conge.enseignantId, tenantId: session.user.tenantId },
        siteFilterForModel("ficheRH", session.user)
      ),
      select: { enseignantId: true },
    });
    if (ficheExistante) {
      await prisma.ficheRH.update({
        where: { enseignantId: conge.enseignantId },
        data: { congesPris: { increment: conge.nbJours } },
      });
    }
  }

  // --- Notification IN_APP à l'enseignant (APPROUVE / REFUSE) ---
  // Non-bloquante : un échec de notification ne doit pas faire échouer la
  // décision sur le congé.
  if (action === "APPROUVE" || action === "REFUSE") {
    try {
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- conge vérifié avec tenantId + siteFilter ci-dessus
      const enseignant = await prisma.enseignant.findUnique({
        where: { id: conge.enseignantId },
        select: { userId: true },
      });

      if (enseignant?.userId) {
        const dateDebutStr = conge.dateDebut.toLocaleDateString("fr-FR");
        const dateFinStr = conge.dateFin.toLocaleDateString("fr-FR");
        const titre = action === "APPROUVE" ? "Congé approuvé" : "Congé refusé";
        const contenu =
          action === "APPROUVE"
            ? `Votre demande de congé (${conge.type}) du ${dateDebutStr} au ${dateFinStr} a été approuvée.`
            : `Votre demande de congé (${conge.type}) du ${dateDebutStr} au ${dateFinStr} a été refusée.` +
              (conge.motif ? `\nMotif : ${conge.motif}` : "");

        await prisma.notification.create({
          data: {
            tenantId: session.user.tenantId,
            titre,
            contenu,
            canal: "IN_APP",
            cible: "ENSEIGNANTS",
            envoyeParId: session.user.id,
            nbDestinataires: 1,
            nbDelivres: 1,
            statut: "ENVOYEE",
            envoyeeAt: new Date(),
          },
        });
      }
    } catch (notifError) {
      console.error("[API/rh/conges] Notification enseignant échouée:", notifError);
    }
  }

  return NextResponse.json({ conge: updated });
}
