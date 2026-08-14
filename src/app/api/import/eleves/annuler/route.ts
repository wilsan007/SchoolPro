import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { mergeFilters, siteFilterForModel } from "@/lib/site-scope";
import { revalidateTag, revalidatePath } from "next/cache";

const Schema = z.object({ importBatchId: z.string().min(1) });

/**
 * POST /api/import/eleves/annuler — défaire un import entier.
 *
 * Chaque fiche créée par un import porte l'identifiant de son lot. Annuler
 * revient à archiver ces fiches en une opération, au lieu de les retrouver et
 * les traiter une à une — le tri manuel de 78 fiches qu'a coûté le dernier
 * incident.
 *
 * Deux garde-fous :
 *   • seules les fiches **créées** par le lot sont concernées ; les fiches
 *     simplement mises à jour par l'import ne sont pas touchées, leur
 *     existence est antérieure ;
 *   • une fiche ayant acquis des données depuis (note, absence, facture) est
 *     laissée en place et signalée : l'annulation ne doit rien orpheliner.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Lot d'import invalide" }, { status: 400 });
    }
    const { importBatchId } = parsed.data;
    const tenantId = session.user.tenantId;

    const fiches = await prisma.eleve.findMany({
      where: mergeFilters(
        { tenantId, importBatchId, deletedAt: null },
        siteFilterForModel("eleve", session.user)
      ),
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        _count: { select: { notes: true, absences: true, factures: true, bulletins: true } },
      },
    });

    if (fiches.length === 0) {
      return NextResponse.json(
        { error: "Aucune fiche à annuler pour cet import (déjà annulé, ou hors de votre périmètre)." },
        { status: 404 }
      );
    }

    const avecDonnees = fiches.filter(
      (f) => f._count.notes + f._count.absences + f._count.factures + f._count.bulletins > 0
    );
    const aArchiver = fiches.filter((f) => !avecDonnees.some((a) => a.id === f.id));

    const now = new Date();
    for (let i = 0; i < aArchiver.length; i += 50) {
      const lot = aArchiver.slice(i, i + 50);
      await prisma.eleve.updateMany({
        // `tenantId` répété volontairement : les identifiants proviennent déjà
        // d'une lecture bornée, mais une écriture ne doit jamais dépendre
        // d'une seule couche de protection.
        where: { tenantId, id: { in: lot.map((f) => f.id) } },
        // `identiteKey` repasse à NULL : l'identité est libérée, la personne
        // pourra être réinscrite sans buter sur la contrainte d'unicité.
        data: { deletedAt: now, statut: "ABANDONNE", userId: null, identiteKey: null },
      });
    }

    await prisma.auditLog.createMany({
      data: aArchiver.map((f) => ({
        tenantId,
        userId: session.user.id,
        action: "eleve.delete",
        verdict: "ALLOWED" as const,
        resource: "eleve",
        resourceId: f.id,
        reason: `Annulation de l'import ${importBatchId}`,
        metadata: { nom: f.nom, prenom: f.prenom, matricule: f.matricule, importBatchId },
      })),
    });

    revalidateTag("eleves-stats");
    // Les effectifs par classe affichés dans Paramètres → Pédagogie.
    revalidatePath("/parametres");
    revalidatePath("/eleves");
    revalidateTag("dashboard-data");

    return NextResponse.json({
      annulees: aArchiver.length,
      conservees: avecDonnees.length,
      detailConservees: avecDonnees.map((f) => `${f.prenom} ${f.nom} (${f.matricule})`),
    });
  } catch (error) {
    console.error("[API/import/eleves/annuler]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
