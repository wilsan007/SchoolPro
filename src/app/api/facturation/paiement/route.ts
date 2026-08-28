import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { getDemoNow } from "@/lib/demo-now";
import { revalidatePath, revalidateTag } from "next/cache";

const PaiementSchema = z.object({
  factureId: z.string().min(1),
  montant: z.number().min(0.01),
  methode: z.string().min(1),
  reference: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  const body = await req.json();
  const parsed = PaiementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    );
  }

  const { factureId, montant, methode, reference } = parsed.data;
  const tenantId = session.user.tenantId;

  const facture = await prisma.facture.findFirst({
    where: mergeFilters(
      { id: factureId, tenantId },
      siteFilterForModel("facture", session.user)
    ),
    include: { paiements: { where: siteFilterForModel("paiement", session.user) } },
  });

  if (!facture) {
    return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
  }

  if (facture.statut === "ANNULEE") {
    return NextResponse.json({ error: "Impossible d'encaisser sur une facture annulée" }, { status: 400 });
  }

  const totalDejaPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalDejaPaye;

  if (restant <= 0) {
    return NextResponse.json({ error: "Cette facture est déjà soldée" }, { status: 400 });
  }

  if (montant > restant) {
    return NextResponse.json(
      { error: `Le montant ne peut pas dépasser le solde restant (${restant} ${facture.devise})` },
      { status: 400 }
    );
  }

  const totalPaye = totalDejaPaye + montant;
  let newStatut: typeof facture.statut = facture.statut;

  if (totalPaye >= facture.montant) {
    newStatut = "PAYEE";
  } else if (facture.echeance && (await getDemoNow()) > facture.echeance && totalPaye < facture.montant) {
    newStatut = "EN_RETARD";
  }

  const now = new Date();
  const paiement = await prisma.$transaction(async (tx) => {
    const created = await tx.paiement.create({
      data: {
        factureId,
        montant,
        devise: facture.devise,
        methode,
        reference: reference || null,
        date: now,
        dateSaisie: now,
        enregistreParId: session.user.id,
      },
    });

    await tx.facture.update({
      where: { id: factureId },
      data: { statut: newStatut },
    });

    return created;
  });

  revalidatePath("/facturation");
  revalidatePath("/admissions");
  revalidateTag("dashboard-data");

  return NextResponse.json({ paiement, newStatut });
}
