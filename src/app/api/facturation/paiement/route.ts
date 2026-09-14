import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { applyRlsContext } from "@/lib/prisma-rls";
import { siteFilterForModel, mergeFilters } from "@/lib/site-scope";
import { revalidatePath, revalidateTag } from "next/cache";
import { auditFire } from "@/lib/audit";

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

  // MET-H5 (audit v2) : le solde est vérifié à nouveau DANS la transaction
  // avec un verrou pessimiste pour empêcher le double encaissement.
  const now = new Date();
  const paiement = await prisma.$transaction(async (tx) => {
    // ISO-4 : poser le contexte RLS en première instruction de la transaction.
    await applyRlsContext(tx);
    // Verrouiller la facture pour empêcher les écritures concurrentes.
     
    const lockedFacture = await tx.$queryRaw<{ id: string; montant: number; statut: string; echeance: Date | null }[]>`
      SELECT id, montant, statut, "echeance" FROM factures WHERE id = ${factureId} FOR UPDATE
    `;
    if (!lockedFacture.length) {
      throw new Error("FACTURE_INTROUVABLE");
    }

    // Relire les paiements dans la transaction pour un solde exact.
     
    const paiementsActuels = await tx.paiement.findMany({
      where: { factureId },
      select: { montant: true },
    });
    const totalDejaPaye = paiementsActuels.reduce((sum, p) => sum + p.montant, 0);
    const restant = lockedFacture[0].montant - totalDejaPaye;

    if (restant <= 0) {
      throw new Error("FACTURE_SOLDEE");
    }
    if (montant > restant) {
      throw new Error("MONTANT_EXCESSIF");
    }

    const totalPaye = totalDejaPaye + montant;
    let newStatut: string = lockedFacture[0].statut;
    if (totalPaye >= lockedFacture[0].montant) {
      newStatut = "PAYEE";
    } else if (lockedFacture[0].echeance && now > lockedFacture[0].echeance && totalPaye < lockedFacture[0].montant) {
      newStatut = "EN_RETARD";
    }

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
      data: { statut: newStatut as typeof facture.statut },
    });

    return { created, newStatut };
  }).catch((err: unknown) => {
    if (err instanceof Error) {
      if (err.message === "FACTURE_SOLDEE") {
        return { error: "Cette facture est déjà soldée", status: 400 };
      }
      if (err.message === "MONTANT_EXCESSIF") {
        return { error: "Le montant dépasse le solde restant", status: 400 };
      }
    }
    throw err;
  });

  if ("error" in paiement) {
    return NextResponse.json({ error: paiement.error }, { status: (paiement as { status: number }).status });
  }

  auditFire({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "facturation:paiement",
    verdict: "ALLOWED",
    resource: "facture",
    resourceId: factureId,
  });

  revalidatePath("/facturation");
  revalidatePath("/admissions");
  revalidateTag("dashboard-data");

  return NextResponse.json({ paiement: paiement.created, newStatut: paiement.newStatut });
}
