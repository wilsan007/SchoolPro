import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForRelation } from "@/lib/site-filter";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import {
  peutModifierBulletin,
  tracerModificationsBulletin,
  enregistrerHistoriqueBulletin,
} from "@/lib/bulletin-historique";
import { auditFire } from "@/lib/audit";

const BodySchema = z.object({
  appreciation: z.string().optional(),
  decision: z.string().optional(),
  moyenneGenerale: z.coerce.number().min(0).max(20).optional(),
  rang: z.coerce.number().int().min(1).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:write");
    if (denied) return denied;

    const { id } = await params;
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    const { appreciation, decision, moyenneGenerale, rang } = parsed.data;
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    const siteFilter = siteFilterForRelation(session.user, "eleve");

    const existing = await prisma.bulletin.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter, ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}) },
    });
    if (!existing) return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });

    // ── Verrouillage : un bulletin VERROUILLE ou PUBLIE ne peut être
    //    modifié que par un TENANT_ADMIN (ou SUPER_ADMIN).
    if (!peutModifierBulletin(session.user.role, existing.statut)) {
      return NextResponse.json(
        {
          error:
            "Ce bulletin est verrouillé (publié ou clôturé). Seul un administrateur peut le modifier.",
        },
        { status: 403 }
      );
    }

    const dataToUpdate: Record<string, unknown> = {};
    if (appreciation !== undefined) dataToUpdate.appreciation = appreciation;
    if (decision !== undefined) dataToUpdate.decision = decision;
    if (moyenneGenerale !== undefined) dataToUpdate.moyenneGenerale = moyenneGenerale;
    if (rang !== undefined) dataToUpdate.rang = rang;

    const updated = await prisma.bulletin.update({
      where: { id },
      data: dataToUpdate,
    });

    // ── Historisation : tracer chaque champ modifié, même par le directeur.
    await tracerModificationsBulletin(
      id,
      session.user.tenantId,
      { id: session.user.id, name: session.user.name, role: session.user.role },
      existing,
      updated
    ).catch(() => {/* non-fatal : ne pas bloquer la mise à jour */});

    return NextResponse.json({ success: true, bulletin: updated });
  } catch (error) {
    console.error("[API/bulletins/[id]] PUT Error", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "bulletins:delete");
    if (denied) return denied;

    const { id } = await params;
    const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);

    const siteFilter2 = siteFilterForRelation(session.user, "eleve");

    const existing = await prisma.bulletin.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilter2, ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}) },
    });
    if (!existing) return NextResponse.json({ error: "Bulletin introuvable" }, { status: 404 });

    // ── Verrouillage : un bulletin VERROUILLE ou PUBLIE ne peut être
    //    supprimé que par un TENANT_ADMIN (ou SUPER_ADMIN).
    if (!peutModifierBulletin(session.user.role, existing.statut)) {
      return NextResponse.json(
        {
          error:
            "Ce bulletin est verrouillé (publié ou clôturé). Seul un administrateur peut le supprimer.",
        },
        { status: 403 }
      );
    }

    // ── Historisation : enregistrer la suppression avant de l'exécuter.
    await enregistrerHistoriqueBulletin(
      id,
      session.user.tenantId,
      { id: session.user.id, name: session.user.name, role: session.user.role },
      "DELETE",
      "global",
      JSON.stringify({
        eleveId: existing.eleveId,
        periodeId: existing.periodeId,
        moyenneGenerale: existing.moyenneGenerale,
        statut: existing.statut,
      }),
      null
    ).catch(() => {/* non-fatal */});

    auditFire({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "bulletin:delete",
      verdict: "ALLOWED",
      resource: "bulletin",
      resourceId: id,
      metadata: { eleveId: existing.eleveId, periodeId: existing.periodeId },
    });

    await prisma.bulletin.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/bulletins/[id]] DELETE Error", error);
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}
