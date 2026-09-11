import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { auditFire } from "@/lib/audit";
import { z } from "zod";
import { revalidateTag, revalidatePath } from "next/cache";
import { applyRlsContext } from "@/lib/prisma-rls";

const ChangerClasseSchema = z.object({
  eleveIds: z.array(z.string().min(1)).min(1).max(500),
  nouvelleClasseId: z.string().min(1),
});

/**
 * POST /api/eleves/changer-classe
 *
 * API-C2 (audit v2) : auparavant, aucun contrôle de rôle ni validation Zod.
 * Pour PARENT/STUDENT, `siteFilterForModel("eleve")` renvoyait `{}` : tous
 * les élèves du tenant étaient modifiables. Les `tx.*` dans la transaction
 * n'avaient pas de `tenantId`, permettant une écriture inter-tenant.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  // API-C2 : permission requise. `eleves:write` est détenue par TENANT_ADMIN,
  // PRINCIPAL, SECRETARY et ACCOUNTANT. Faire confirmer par la direction si
  // un comptable doit pouvoir changer un élève de classe.
  const denied = checkPermission(session.user.role, "eleves:write");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ChangerClasseSchema.safeParse(body);
  if (!parsed.success) return erreurJson("DONNEES_INVALIDES");

  const { eleveIds, nouvelleClasseId } = parsed.data;
  const tenantId = session.user.tenantId!;

  const classeFilter = siteFilterForModel("classe", session.user);
  const eleveFilter = siteFilterForModel("eleve", session.user);
  const targetClasse = await prisma.classe.findFirst({
    where: { id: nouvelleClasseId, tenantId, ...classeFilter },
  });

  if (!targetClasse) {
    return erreurJson("ELEVE_INTROUVABLE", undefined, {
      detail: "Classe destination introuvable",
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    // API-C2 : relire les élèves réellement modifiables. On n'utilise
    // QUE les identifiants retournés par cette requête pour les opérations
    // suivantes, afin d'éviter toute écriture inter-tenant.
    const elevesOk = await tx.eleve.findMany({
      where: {
        id: { in: eleveIds },
        tenantId,
        ...eleveFilter,
      },
      select: { id: true, classeId: true },
    });
    const okIds = elevesOk.map((e) => e.id);

    if (okIds.length === 0) {
      return { count: 0 };
    }

    // Mettre à jour les élèves
    const updated = await tx.eleve.updateMany({
      where: {
        id: { in: okIds },
        tenantId,
        ...eleveFilter,
      },
      data: { classeId: nouvelleClasseId },
    });

    // Clôturer l'historique ancien et créer le nouveau (date d'effet).
    // API-C2 / ISO-H3 : ajouter tenantId aux where des tx.* pour empêcher
    // l'écriture inter-tenant.
    await tx.historiqueClasse.updateMany({
      where: {
        eleveId: { in: okIds },
        tenantId,
        dateSortie: null,
      },
      data: { dateSortie: new Date(), motif: "Transfert" },
    });
    await tx.historiqueClasse.createMany({
      data: okIds.map((eleveId) => ({
        tenantId,
        eleveId,
        classeId: nouvelleClasseId,
        dateEntree: new Date(),
        motif: "Transfert",
      })),
    });

    return { count: updated.count, okIds };
  });

  // --- Audit ---
  auditFire({
    userId: session.user.id,
    tenantId,
    action: "eleves:changer-classe",
    verdict: "ALLOWED",
    resource: "eleve",
    reason: `${result.count} élève(s) transféré(s) vers la classe ${targetClasse.nom}`,
    metadata: {
      eleveIds: result.okIds ?? [],
      nouvelleClasseId,
      nouvelleClasseNom: targetClasse.nom,
    },
  });

  // --- Notifications IN_APP aux parents des élèves transférés ---
  try {
    const elevesTransf = await prisma.eleve.findMany({
      where: {
        id: { in: result.okIds ?? eleveIds },
        tenantId,
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
        eleveId: { in: result.okIds ?? eleveIds },
        tenantId,
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
            tenantId,
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
