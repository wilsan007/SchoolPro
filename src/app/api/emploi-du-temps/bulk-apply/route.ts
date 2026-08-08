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
  matiereId: z.string().min(1),
  enseignantId: z.string().min(1).nullable(),
  jour: z.enum(["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]),
  heureDebut: z.string().regex(/^\d{2}:\d{2}$/),
  heureFin: z.string().regex(/^\d{2}:\d{2}$/),
  salle: z.string().max(80).nullable(),
});

const Schema = z.object({
  classeId: z.string().min(1),
  creneaux: z.array(CreneauSchema).min(1).max(60),
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
    const { classeId, creneaux } = parsed.data;
    const tenantId = session.user.tenantId;

    const classe = await prisma.classe.findFirst({ where: { id: classeId, tenantId }, select: { id: true, nom: true } });
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

    const annee = await getAnneeCouranteLibelle(tenantId);
    if (!annee) return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.emploiTemps.deleteMany({ where: { tenantId, ...siteFilter, classeId, annee } });

      // Revalidation contre les engagements des AUTRES classes (enseignants,
      // salles) — l'unique source de vérité au moment de l'écriture, pas au
      // moment où le plan a été généré.
      const autres = await tx.emploiTemps.findMany({
        where: { tenantId, ...siteFilter, annee, classeId: { not: classeId } },
        select: { jour: true, heureDebut: true, heureFin: true, enseignantId: true, salle: true },
      });

      for (const c of creneaux) {
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
        data: creneaux.map((c) => ({
          tenantId,
          classeId,
          matiereId: c.matiereId,
          enseignantId: c.enseignantId,
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          salle: c.salle,
          annee,
        })),
      });

      return { deleted: deleted.count, created: creneaux.length };
    });

    revalidatePath("/emploi-du-temps");
    return NextResponse.json({ success: true, classeNom: classe.nom, ...result });
  } catch (error) {
    console.error("[API/emploi-du-temps/bulk-apply]", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
