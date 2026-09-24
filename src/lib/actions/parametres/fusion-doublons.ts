"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { siteFilterForModel } from "@/lib/site-scope";
import { applyRlsContext } from "@/lib/prisma-rls";
import { checkPermission } from "@/lib/rbac";

export async function findDuplicateEleves() {
  const session = await auth();
  if (!session?.user?.tenantId) return [];

  // Trouver les paires d'élèves avec le même nom + prénom + date de naissance
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...siteFilterForModel("eleve", session.user),
    },
    select: {
      id: true, nom: true, prenom: true, dateNaissance: true,
      matricule: true, statut: true, classeId: true,
      classe: { select: { nom: true } },
      _count: { select: { notes: true, absences: true, bulletins: true } },
    },
    orderBy: { nom: "asc" },
  });

  // Grouper par nom + prénom + dateNaissance
  const groups: Record<string, typeof eleves> = {};
  for (const e of eleves) {
    const key = `${e.nom}|${e.prenom}|${e.dateNaissance.toISOString().split("T")[0]}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }

  // Retourner seulement les groupes avec > 1 élève
  return Object.entries(groups)
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, eleves: group }));
}

export async function mergeEleves(
  keepId: string,
  mergeId: string,
  reason?: string
) {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Non autorisé");

  // Autorisation : source unique de vérité dans `@/lib/permissions`.
  // La liste de rôles qui vivait ici est remplacée par une permission nommée —
  // mêmes détenteurs, mais testable et auditable.
  const denied = await checkPermission(session.user.role, "parametres:admin");
  if (denied) throw new Error("Permission refusée : réservé aux administrateurs");

  const keep = await prisma.eleve.findFirst({
    where: { id: keepId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
    select: { id: true, nom: true, prenom: true, matricule: true },
  });
  if (!keep) throw new Error("Élève à conserver introuvable");

  const merge = await prisma.eleve.findFirst({
    where: { id: mergeId, tenantId: session.user.tenantId, ...siteFilterForModel("eleve", session.user) },
    select: { id: true, nom: true, prenom: true, matricule: true },
  });
  if (!merge) throw new Error("Élève à fusionner introuvable");

  await prisma.$transaction(async (tx) => {
    await applyRlsContext(tx);
    // Migrer toutes les relations de l'élève fusionné vers l'élève conservé
    // Notes
    await tx.note.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Absences
    await tx.absence.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Bulletins
    await tx.bulletin.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // ParcoursScolaire
    await tx.parcoursScolaire.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // HistoriqueClasse
    await tx.historiqueClasse.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Parents (EleveParent) — éviter les doublons
    const mergeParents = await tx.eleveParent.findMany({ where: { eleveId: mergeId } });
    for (const ep of mergeParents) {
      const existing = await tx.eleveParent.findFirst({
        where: { eleveId: keepId, parentId: ep.parentId },
      });
      if (!existing) {
        await tx.eleveParent.create({
          data: { eleveId: keepId, parentId: ep.parentId, lien: ep.lien, isGardien: ep.isGardien },
        });
      }
    }
    await tx.eleveParent.deleteMany({ where: { eleveId: mergeId } });
    // Factures
    await tx.facture.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Documents
    await tx.document.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Incidents
    await tx.incident.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Dispenses
    await tx.dispenseMatiere.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });
    // Exclusions
    await tx.exclusionEleve.updateMany({ where: { eleveId: mergeId }, data: { eleveId: keepId } });

    // Soft delete de l'élève fusionné
    await tx.eleve.update({
      where: { id: mergeId },
      data: {
        deletedAt: new Date(),
        statut: "ABANDONNE",
        userId: null,
        identiteKey: null,
        classeId: null,
      },
    });

    // Audit
    await tx.auditLog.create({
      data: {
        tenantId: session.user.tenantId!,
        userId: session.user.id!,
        action: "eleve.merge",
        verdict: "ALLOWED",
        resource: "eleve",
        resourceId: keepId,
        reason: reason ?? `Fusion du doublon ${merge.matricule} vers ${keep.matricule}`,
        metadata: {
          keep: { id: keepId, matricule: keep.matricule, nom: keep.nom, prenom: keep.prenom },
          merge: { id: mergeId, matricule: merge.matricule, nom: merge.nom, prenom: merge.prenom },
        },
      },
    }).catch((e) => console.warn("[non-fatal]", e)); // Non-bloquant
  });

  revalidatePath("/eleves");
  revalidatePath("/parametres");
  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");
  return { success: true };
}
