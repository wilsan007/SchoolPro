import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import { siteFilterForModel } from "@/lib/site-scope";
import { synchroniserTachesAuto, getTachesUtilisateur } from "@/lib/tache-engine";
import { bucketPour, BUCKET_ORDER, type BucketTache } from "@/lib/tache-buckets";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { z } from "zod";

/**
 * Tâches du personnel — version mobile.
 *
 * GET   /api/mobile/taches          → tâches de l'utilisateur connecté (auto-sync)
 * PATCH /api/mobile/taches          → mettre à jour le statut d'une tâche
 *
 * Respecte l'isolation par site et l'authentification par jeton mobile.
 */

const STATUTS_VALIDES = ["A_FAIRE", "EN_COURS", "FAIT", "ANNULE"] as const;

const PatchSchema = z.object({
  id: z.string().min(1),
  statut: z.enum(STATUTS_VALIDES),
});

/**
 * GET — Renvoie les tâches assignées à l'utilisateur authentifié.
 *
 * Effectue une synchronisation automatique (lazy sync) avant la lecture
 * afin de régénérer les tâches issues de l'état du système.
 *
 * Paramètres de requête optionnels :
 *  - statut : filtrer par statut (A_FAIRE, EN_COURS, FAIT, ANNULE)
 *  - bucket : filtrer par bucket temporel (EN_RETARD, AUJOURDHUI, SEMAINE,
 *             SEMAINE_PROCHAINE, PLUS_TARD, SANS_ECHEANCE)
 */
export async function GET(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: "Aucun établissement associé" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const statut = searchParams.get("statut") ?? undefined;
  const bucket = searchParams.get("bucket");

  // Auto-sync : régénère les tâches depuis l'état du système avant lecture.
  // Lazy sync silencieux — les erreurs ne bloquent pas la lecture.
  try {
    await synchroniserTachesAuto(user.tenantId, user);
  } catch (e) {
    console.error("[Mobile Taches GET] Auto-sync échoué:", e);
  }

  // Récupère les tâches de l'utilisateur (avec filtrage site et statut).
  const { taches } = await getTachesUtilisateur(
    user.tenantId,
    user.id,
    user,
    { statut }
  );

  // Filtrage par bucket temporel si demandé.
  let tachesFiltrees = taches;
  if (bucket && BUCKET_ORDER.includes(bucket as BucketTache)) {
    const maintenant = await getDemoNow();
    tachesFiltrees = taches.filter(
      (t) => bucketPour(t.echeance, t.statut, maintenant) === bucket
    );
  }

  // Sérialiser avec les champs attendus par l'app mobile.
  const serialized = tachesFiltrees.map((t) => ({
    id: t.id,
    titre: t.titre,
    description: t.description,
    type: t.type,
    priorite: t.priorite,
    statut: t.statut,
    echeance: t.echeance,
    dateFaite: t.dateFaite,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
    classe: t.classe ? { nom: t.classe.nom } : null,
    matiere: t.matiere ? { nom: t.matiere.nom } : null,
  }));

  return NextResponse.json({ taches: serialized });
}

/**
 * PATCH — Met à jour le statut d'une tâche.
 *
 * Corps de la requête : { id: string, statut: "A_FAIRE" | "EN_COURS" | "FAIT" | "ANNULE" }
 *
 * Vérifie que la tâche appartient bien au tenant de l'utilisateur et
 * respecte le filtrage par site.
 */
export async function PATCH(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: "Aucun établissement associé" },
      { status: 403 }
    );
  }

  try {
    const json = await req.json();
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { id, statut } = parsed.data;
    const siteFilter = siteFilterForModel("tache", user);
    const anneeCourante = await getAnneeCouranteLibelle(user.tenantId);

    // Vérifier que la tâche appartient au tenant de l'utilisateur.
    const existing = await prisma.tache.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...siteFilter,
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Tâche introuvable" },
        { status: 404 }
      );
    }

    // Détecter le passage à FAIT pour enregistrer la date d'accomplissement.
    const becameFait = statut === "FAIT" && existing.statut !== "FAIT";

    const tache = await prisma.tache.update({
      where: { id },
      data: {
        statut,
        ...(becameFait && { dateFaite: new Date() }),
      },
      include: {
        classe: { select: { nom: true } },
        matiere: { select: { nom: true } },
      },
    });

    return NextResponse.json({
      id: tache.id,
      titre: tache.titre,
      description: tache.description,
      type: tache.type,
      priorite: tache.priorite,
      statut: tache.statut,
      echeance: tache.echeance?.toISOString() ?? null,
      dateFaite: tache.dateFaite?.toISOString() ?? null,
      sourceType: tache.sourceType,
      sourceId: tache.sourceId,
      classe: tache.classe ? { nom: tache.classe.nom } : null,
      matiere: tache.matiere ? { nom: tache.matiere.nom } : null,
    });
  } catch (err) {
    console.error("[Mobile Taches PATCH] Erreur:", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
