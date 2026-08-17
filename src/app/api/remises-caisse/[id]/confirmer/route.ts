import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";

// ============================================================
// Schéma de validation — confirmation par le receveur
// ============================================================
const ConfirmerRemiseSchema = z.object({
  /// Montant confirmé par le receveur (doit être identique à montantDeclare)
  montantRecu: z.number().min(0, "Le montant reçu doit être positif"),
  /// Action : confirmer ou rejeter
  action: z.enum(["confirmer", "rejeter"]),
  /// Commentaire du receveur (motif de rejet, observations)
  commentaireReceveur: z.string().optional().nullable(),
});

// ============================================================
// POST /api/remises-caisse/[id]/confirmer
//
// Le receveur (comptable ou directeur) confirme avoir reçu le montant
// de la part du caissier. Pour que la remise soit considérée comme
// VALIDÉE (statut CONFIRME), il faut que :
//   1. Les montants soient identiques (montantRecu === montantDeclare)
//   2. Les dates soient enregistrées automatiquement (date de saisie)
//   3. Les noms (caissier et receveur) soient enregistrés
//
// Si le montant reçu diffère du montant déclaré, la remise est REJETEE.
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "finance:write");
  if (denied) return denied;

  // Seuls le comptable, le directeur et le super-admin peuvent confirmer.
  // Le caissier qui a déclaré la remise ne peut pas la confirmer lui-même.
  const receveurRoles = new Set(["ACCOUNTANT", "TENANT_ADMIN", "SUPER_ADMIN"]);
  if (!receveurRoles.has(session.user.role)) {
    return NextResponse.json(
      {
        error:
          "Seul le comptable ou le directeur peut confirmer la réception d'une remise de caisse",
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const json = await request.json();
    const data = ConfirmerRemiseSchema.parse(json);

    const siteFilter = siteFilterForModel("remiseCaisse", session.user);

    const remise = await prisma.remiseCaisse.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter },
    });

    if (!remise) {
      return NextResponse.json(
        { error: "Remise de caisse introuvable" },
        { status: 404 }
      );
    }

    // Le caissier ne peut pas confirmer sa propre remise.
    if (remise.caissierId === session.user.id) {
      return NextResponse.json(
        {
          error:
            "Vous ne pouvez pas confirmer votre propre remise de caisse",
        },
        { status: 403 }
      );
    }

    if (remise.statut !== "EN_ATTENTE") {
      return NextResponse.json(
        {
          error: `Cette remise a déjà été traitée (statut: ${remise.statut})`,
        },
        { status: 400 }
      );
    }

    const now = new Date();

    // Si action = rejeter, on rejette quelle que soit la concordance.
    if (data.action === "rejeter") {
      const updated = await prisma.remiseCaisse.update({
        where: { id },
        data: {
          statut: "REJETE",
          receveurId: session.user.id,
          montantRecu: data.montantRecu,
          dateReception: now,
          dateSaisieReception: now,
          commentaireReceveur: data.commentaireReceveur ?? null,
        },
        include: {
          caissier: { select: { id: true, name: true } },
          receveur: { select: { id: true, name: true } },
          site: { select: { id: true, nom: true } },
        },
      });

      return NextResponse.json(updated);
    }

    // action = confirmer : vérifier la concordance des montants.
    // Tolérance de 0.01 pour les arrondis flottants.
    const ecart = Math.abs(data.montantRecu - remise.montantDeclare);
    if (ecart > 0.01) {
      // Écart détecté : on rejette automatiquement avec le motif.
      const updated = await prisma.remiseCaisse.update({
        where: { id },
        data: {
          statut: "REJETE",
          receveurId: session.user.id,
          montantRecu: data.montantRecu,
          dateReception: now,
          dateSaisieReception: now,
          commentaireReceveur: `Écart détecté : montant déclaré ${remise.montantDeclare} ${remise.devise}, montant reçu ${data.montantRecu} ${remise.devise}. ${data.commentaireReceveur ?? ""}`.trim(),
        },
        include: {
          caissier: { select: { id: true, name: true } },
          receveur: { select: { id: true, name: true } },
          site: { select: { id: true, nom: true } },
        },
      });

      return NextResponse.json({
        ...updated,
        _warning: `Écart détecté entre le montant déclaré (${remise.montantDeclare} ${remise.devise}) et le montant reçu (${data.montantRecu} ${remise.devise}). La remise a été rejetée automatiquement.`,
      });
    }

    // Montants identiques : confirmer la remise.
    // Les dates (dateReception et dateSaisieReception) sont enregistrées
    // automatiquement (jour de la saisie). Les noms (caissier et receveur)
    // sont enregistrés via les relations.
    const updated = await prisma.remiseCaisse.update({
      where: { id },
      data: {
        statut: "CONFIRME",
        receveurId: session.user.id,
        montantRecu: data.montantRecu,
        dateReception: now,
        dateSaisieReception: now,
        commentaireReceveur: data.commentaireReceveur ?? null,
      },
      include: {
        caissier: { select: { id: true, name: true } },
        receveur: { select: { id: true, name: true } },
        site: { select: { id: true, nom: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error("[RemisesCaisse Confirmer POST] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
