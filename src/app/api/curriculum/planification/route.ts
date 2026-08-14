import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidatePath } from "next/cache";

/**
 * Planification annuelle : répartition des chapitres sur les semaines.
 *
 * L'enregistrement est **groupé** : l'écran envoie la répartition entière d'une
 * matière d'un coup. Envoyer une requête par chapitre multiplierait les
 * allers-retours sur un pooler distant (mesuré à ~200 ms l'unité) et rendrait
 * la répartition automatique — qui touche tous les chapitres à la fois —
 * pénible à utiliser.
 */

const PutSchema = z.object({
  anneeId: z.string().min(1),
  classeId: z.string().nullable().optional(),
  lignes: z
    .array(
      z.object({
        chapitreId: z.string().min(1),
        semaineDebut: z.number().int().min(1).max(60),
        semaineFin: z.number().int().min(1).max(60),
        heuresPrevues: z.number().int().min(0).max(200).nullable().optional(),
      })
    )
    .max(100),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "evaluations:write");
  if (denied) return denied;

  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.issues });
  }
  const { anneeId, classeId, lignes } = parsed.data;
  const tenantId = session.user.tenantId;

  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { id: true },
  });
  if (!annee) {
    return erreurJson("ANNEE_INTROUVABLE");
  }

  // Une fin avant le début produirait une frise incohérente et fausserait la
  // détection des trous : on refuse plutôt que de corriger en silence.
  const invalide = lignes.find((l) => l.semaineFin < l.semaineDebut);
  if (invalide) {
    return erreurJson("SEMAINES_INVERSEES");
  }

  // Les chapitres doivent relever du périmètre de l'appelant : `chapitreId`
  // vient du client et ne se vérifie pas tout seul.
  const chapitres = await prisma.chapitre.findMany({
    where: {
      id: { in: lignes.map((l) => l.chapitreId) },
      tenantId,
      ...siteFilterForModel("chapitre", session.user),
    },
    select: { id: true, siteId: true },
  });
  if (chapitres.length !== new Set(lignes.map((l) => l.chapitreId)).size) {
    return erreurJson("CHAPITRES_HORS_PERIMETRE");
  }
  const siteParChapitre = new Map(chapitres.map((c) => [c.id, c.siteId]));

  // Plan initial déjà figé ? On le conserve : c'est lui qui mesure l'écart, et
  // le réécrire à chaque ajustement ferait disparaître tout retard.
  const existants = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      classeId: classeId ?? null,
      chapitreId: { in: lignes.map((l) => l.chapitreId) },
      ...siteFilterForModel("planificationChapitre", session.user),
    },
    select: {
      chapitreId: true,
      semaineDebutInitiale: true,
      semaineFinInitiale: true,
      statut: true,
      demarreLe: true,
      traiteLe: true,
    },
  });
  const anterieur = new Map(existants.map((e) => [e.chapitreId, e]));

  // Remplacement intégral du périmètre concerné : la liste reçue fait foi, ce
  // qui permet de retirer un chapitre de la planification depuis l'écran.
  await prisma.$transaction([
    prisma.planificationChapitre.deleteMany({
      where: {
        tenantId,
        anneeId,
        classeId: classeId ?? null,
        chapitreId: { in: lignes.map((l) => l.chapitreId) },
      },
    }),
    ...(lignes.length > 0
      ? [
          prisma.planificationChapitre.createMany({
            data: lignes.map((l) => {
              const avant = anterieur.get(l.chapitreId);
              return {
                tenantId,
                siteId: siteParChapitre.get(l.chapitreId) ?? null,
                anneeId,
                classeId: classeId ?? null,
                chapitreId: l.chapitreId,
                semaineDebut: l.semaineDebut,
                semaineFin: l.semaineFin,
                heuresPrevues: l.heuresPrevues ?? null,
                // Figé au premier enregistrement, repris tel quel ensuite.
                semaineDebutInitiale: avant?.semaineDebutInitiale ?? l.semaineDebut,
                semaineFinInitiale: avant?.semaineFinInitiale ?? l.semaineFin,
                // L'avancement réel survit à un réajustement des dates.
                statut: avant?.statut ?? "PREVU",
                demarreLe: avant?.demarreLe ?? null,
                traiteLe: avant?.traiteLe ?? null,
              };
            }),
          }),
        ]
      : []),
  ]);

  revalidatePath("/curriculum");
  return NextResponse.json({ success: true, count: lignes.length });
}
