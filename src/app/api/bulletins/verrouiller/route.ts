import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { enregistrerHistoriqueBulletin } from "@/lib/bulletin-historique";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

/**
 * POST /api/bulletins/verrouiller
 * Verrouille ou déverrouille les bulletins d'une classe pour une période.
 *
 * Corps : { classeId, periodeId, action: "verrouiller" | "deverrouiller" }
 *
 * Règle d'accès :
 *  - Verrouiller : permission `bulletins:write` (prof principal, direction, admin)
 *  - Déverrouiller : réservé au TENANT_ADMIN (un bulletin verrouillé ne peut
 *    être déverrouillé que par l'administrateur de l'établissement)
 */
const Schema = z.object({
  classeId: z.string().min(1),
  periodeId: z.string().min(1),
  action: z.enum(["verrouiller", "deverrouiller"]),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { classeId, periodeId, action } = parsed.data;
    const tenantId = session.user.tenantId;

    // Périmètre enseignant : le verrouillage concerne la classe du prof.
    if (action === "verrouiller" && isTeacherRole(session.user.role as Role)) {
      const anneeCourante = await getAnneeCouranteLibelle(tenantId);
      const scope = await getTeacherScope(tenantId, session.user.id as string, session.user.role as Role, anneeCourante);
      if (scope.isRestricted && !scope.classeIds.includes(classeId)) {
        return NextResponse.json({ error: "Classe hors de votre périmètre" }, { status: 403 });
      }
    }

    // Déverrouiller = modifier un bulletin verrouillé → réservé à l'admin
    if (action === "deverrouiller") {
      const denied = checkPermission(session.user.role, "bulletins:write");
      if (denied) return denied;
      if (!["TENANT_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
        return NextResponse.json(
          { error: "Seul un administrateur peut déverrouiller un bulletin." },
          { status: 403 }
        );
      }
    } else {
      // Verrouiller : permission standard
      const denied = checkPermission(session.user.role, "bulletins:write");
      if (denied) return denied;
    }

    // Récupérer les bulletins concernés
    const eleves = await prisma.eleve.findMany({
      where: { classeId, tenantId, statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
      select: { id: true },
    });
    const eleveIds = eleves.map((e) => e.id);

    const bulletins = await prisma.bulletin.findMany({
      where: { tenantId, periodeId, eleveId: { in: eleveIds }, ...siteFilterForModel("bulletin", session.user) },
      select: { id: true, statut: true },
    });

    if (bulletins.length === 0) {
      return NextResponse.json({ error: "Aucun bulletin à verrouiller/déverrouiller" }, { status: 404 });
    }

    const now = new Date();
    let result;

    if (action === "verrouiller") {
      // Verrouiller uniquement les bulletins en BROUILLON
      result = await prisma.bulletin.updateMany({
        where: {
          tenantId,
          periodeId,
          eleveId: { in: eleveIds },
          statut: "BROUILLON",
          ...siteFilterForModel("bulletin", session.user),
        },
        data: {
          statut: "VERROUILLE",
          verrouilleAt: now,
          verrouilleParId: session.user.id,
        },
      });
    } else {
      // Déverrouiller : repasser de VERROUILLE à BROUILLON
      // (un bulletin PUBLIE ne peut pas être déverrouillé — il est déjà publié)
      result = await prisma.bulletin.updateMany({
        where: {
          tenantId,
          periodeId,
          eleveId: { in: eleveIds },
          statut: "VERROUILLE",
          ...siteFilterForModel("bulletin", session.user),
        },
        data: {
          statut: "BROUILLON",
          verrouilleAt: null,
          verrouilleParId: null,
        },
      });
    }

    // Tracer dans l'historique
    const bulletinsModifies = bulletins.filter((b) =>
      action === "verrouiller" ? b.statut === "BROUILLON" : b.statut === "VERROUILLE"
    );
    for (const b of bulletinsModifies) {
      await enregistrerHistoriqueBulletin(
        b.id,
        tenantId,
        { id: session.user.id, name: session.user.name, role: session.user.role },
        action === "verrouiller" ? "VERROUILLER" : "DEVERROUILLER",
        "statut",
        JSON.stringify(action === "verrouiller" ? "BROUILLON" : "VERROUILLE"),
        JSON.stringify(action === "verrouiller" ? "VERROUILLE" : "BROUILLON")
      ).catch(() => {/* non-fatal */});
    }

    return NextResponse.json({
      success: true,
      count: result.count,
      message:
        action === "verrouiller"
          ? `${result.count} bulletin(s) verrouillé(s)`
          : `${result.count} bulletin(s) déverrouillé(s)`,
    });
  } catch (error) {
    console.error("[API/bulletins/verrouiller]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
