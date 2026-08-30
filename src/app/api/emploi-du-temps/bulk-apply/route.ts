import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { overlaps } from "@/lib/emploi-du-temps/suggest";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const CreneauSchema = z.object({
  // matiereId : matière existante. Rendu optionnel pour supporter l'import
  // qui peut référencer une matière à créer via `matiereACreerKey`. Les
  // appelants existants (sans matiereACreerKey) doivent toujours fournir un
  // matiereId non vide — vérifié par le refine ci-dessous.
  matiereId: z.string().optional(),
  // Clé référençant une entrée de `matieresACreer` (import d'EDT). Quand elle
  // est présente, la matière est créée dans la transaction et son ID résolu.
  matiereACreerKey: z.string().optional(),
  enseignantId: z.string().min(1).nullable(),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  salle: z.string().max(80).nullable(),
}).refine((c) => (c.matiereId && c.matiereId.length > 0) || c.matiereACreerKey, {
  message: "matiereId ou matiereACreerKey requis",
  path: ["matiereId"],
});

const MatiereACreerSchema = z.object({
  key: z.string().min(1),
  nom: z.string().min(1).max(120),
  code: z.string().min(1).max(20),
  niveau: z.string().nullable(),
});

const Schema = z.object({
  classeId: z.string().min(1),
  creneaux: z.array(CreneauSchema).min(1).max(60),
  periodeId: z.string().optional().or(z.literal("")),
  // Optionnel : matières à créer atomiquement avant les créneaux (import).
  // Additif : les appelants existants ne l'envoient pas → comportement inchangé.
  matieresACreer: z.array(MatiereACreerSchema).optional(),
});

/**
 * Remplace intégralement l'emploi du temps d'une classe : supprime tous ses
 * créneaux existants (année en cours) et recrée la liste fournie, dans une
 * transaction. Revalide les conflits enseignant/salle au moment de l'écriture
 * (le plan a pu être généré plusieurs minutes avant la confirmation) : si un
 * conflit est détecté, toute la transaction est annulée (aucune modification
 * partielle) et l'utilisateur doit régénérer un plan.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const denied = checkPermission(session.user.role, "emploi-du-temps:write");
    if (denied) return denied;
    const siteFilter = siteFilterForModel("classe", session.user);

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.issues }, { status: 400 });
    }
    const { classeId, creneaux, periodeId, matieresACreer } = parsed.data;
    const tenantId = session.user.tenantId;
    const periodeIdValue = periodeId || null;

    const annee = await getAnneeCouranteLibelle(tenantId);
    if (!annee) return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });

    const classe = await prisma.classe.findFirst({
      where: {
        id: classeId,
        tenantId,
        ...siteFilter,
        ...(annee ? { annee } : {}),
      },
      select: { id: true, nom: true },
    });
    if (!classe) return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });

    // Auto-conflit interne au plan fourni (classe, enseignant, salle).
    for (let i = 0; i < creneaux.length; i++) {
      for (let j = i + 1; j < creneaux.length; j++) {
        const a = creneaux[i];
        const b = creneaux[j];
        if (a.jour !== b.jour || !overlaps(a.heureDebut, a.heureFin, b.heureDebut, b.heureFin)) continue;
        if (a.enseignantId && a.enseignantId === b.enseignantId) {
          return NextResponse.json({ error: "Le plan fourni assigne le même enseignant à deux créneaux qui se chevauchent." }, { status: 400 });
        }
        if (a.salle && a.salle === b.salle) {
          return NextResponse.json({ error: "Le plan fourni assigne la même salle à deux créneaux qui se chevauchent." }, { status: 400 });
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Auto-création des matières issues de l'import (additif). Les matières
      // sont créées ici, dans la même transaction que les créneaux, pour
      // garantir l'atomicité : si un conflit annule la transaction, aucune
      // matière n'est créée non plus. On évite les doublons de code au sein du
      // tenant (upsert par code).
      const matiereKeyToId = new Map<string, string>();
      if (matieresACreer && matieresACreer.length > 0) {
        for (const m of matieresACreer) {
          const existing = await tx.matiere.findFirst({
            where: { tenantId, code: m.code, ...(m.niveau ? { niveau: m.niveau } : {}) },
            select: { id: true },
          });
          if (existing) {
            matiereKeyToId.set(m.key, existing.id);
            continue;
          }
          const created = await tx.matiere.create({
            data: {
              tenantId,
              nom: m.nom,
              code: m.code,
              niveau: m.niveau,
              coefficient: 1,
            },
          });
          matiereKeyToId.set(m.key, created.id);
        }
      }

      // Résout l'ID de matière de chaque créneau : matiereId direct, ou via
      // la clé d'une matière fraîchement créée.
      const creneauxAvecMatiere = creneaux.map((c) => {
        const matiereId = c.matiereId && c.matiereId.length > 0
          ? c.matiereId
          : (c.matiereACreerKey ? matiereKeyToId.get(c.matiereACreerKey) : undefined);
        if (!matiereId) throw new Error("Créneau sans matière résolvable");
        return { ...c, matiereId };
      });

      // Supprime les créneaux existants pour cette classe/année/période.
      // Si periodeId est null, supprime les créneaux annuels uniquement.
      // Si periodeId est renseigné, supprime les créneaux de cette période
      // (mais pas les annuels — ils restent valables pour les autres périodes).
      const deleted = await tx.emploiTemps.deleteMany({
        where: { tenantId, ...siteFilter, classeId, annee, periodeId: periodeIdValue },
      });

      // Revalidation contre les engagements des AUTRES classes (enseignants,
      // salles) — l'unique source de vérité au moment de l'écriture, pas au
      // moment où le plan a été généré. On vérifie les créneaux de la même
      // période ET les créneaux annuels (qui s'appliquent à toutes les périodes).
      const autres = await tx.emploiTemps.findMany({
        where: {
          tenantId, ...siteFilter, annee, classeId: { not: classeId },
          OR: [{ periodeId: periodeIdValue }, ...(periodeIdValue ? [{ periodeId: null }] : [])],
        },
        select: { jour: true, heureDebut: true, heureFin: true, enseignantId: true, salle: true },
      });

      for (const c of creneauxAvecMatiere) {
        const conflitEnseignant =
          c.enseignantId &&
          autres.some(
            (a) => a.enseignantId === c.enseignantId && a.jour === c.jour && overlaps(a.heureDebut, a.heureFin, c.heureDebut, c.heureFin)
          );
        if (conflitEnseignant) {
          throw new Error(`Conflit détecté : un enseignant du plan est déjà engagé ailleurs le ${c.jour} à ${c.heureDebut}. Régénère le plan.`);
        }
        const salleBrute = c.salle?.replace(/\s*\(Groupe [AB]\)$/, "") ?? null;
        const conflitSalle =
          salleBrute &&
          autres.some((a) => a.salle === salleBrute && a.jour === c.jour && overlaps(a.heureDebut, a.heureFin, c.heureDebut, c.heureFin));
        if (conflitSalle) {
          throw new Error(`Conflit détecté : une salle du plan est déjà occupée ailleurs le ${c.jour} à ${c.heureDebut}. Régénère le plan.`);
        }
      }

      await tx.emploiTemps.createMany({
        data: creneauxAvecMatiere.map((c) => ({
          tenantId,
          classeId,
          matiereId: c.matiereId,
          enseignantId: c.enseignantId,
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          salle: c.salle,
          annee,
          periodeId: periodeIdValue,
        })),
      });

      return { deleted: deleted.count, created: creneauxAvecMatiere.length };
    });

    revalidatePath("/emploi-du-temps");
    return NextResponse.json({ success: true, classeNom: classe.nom, ...result });
  } catch (error) {
    console.error("[API/emploi-du-temps/bulk-apply]", error);
    return NextResponse.json({ error: "Erreur lors de l'application" }, { status: 409 });
  }
}
