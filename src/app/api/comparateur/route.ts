import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { isTenantWideRole } from "@/lib/site-scope";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/* eslint-disable ecolpro/require-site-filter -- comparateur inter-sites :
   cet agrégat compare volontairement tous les sites du tenant entre eux.
   L'accès est restreint à TENANT_ADMIN et SUPER_ADMIN pour le mode sites,
   et le mode annees accepte un siteId optionnel. Le filtrage par site serait
   contradictoire avec l'objet de la route. */
/**
 * API de comparaison inter-sites et inter-années.
 *
 * Supporte deux modes :
 * - `mode=sites`   : compare les sites du tenant sur une année donnée
 * - `mode=annees`  : compare les années scolaires sur un site donné (ou tous sites)
 *
 * Retourne des KPI agrégés : effectifs, moyennes, absences, factures,
 * prédictions LEARNOS, exercices, maîtrise, et évolution temporelle.
 *
 * ── OPTIMISATION CONNEXIONS ──────────────────────────────────────
 * Au lieu de lancer N×12 requêtes Prisma concurrentes (une série de 12
 * par site/année, le tout en parallèle via Promise.all), on regroupe
 * les requêtes agrégeables avec `groupBy` (une seule requête pour tous
 * les sites/années) et on traite les requêtes à filtre relationnel
 * séquentiellement (un site/année à la fois).  Le nombre maximum de
 * connexions simultanées passe de N×12 à ≤11, quelle que soit la valeur
 * de N.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const denied = checkPermission(session.user.role, "analytics:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const role = session.user.role;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "sites";
  const anneeId = url.searchParams.get("anneeId");
  const siteId = url.searchParams.get("siteId") || undefined;

  const activeAnneeId = await anneeActiveId(tenantId);
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Seuls TENANT_ADMIN et SUPER_ADMIN peuvent comparer les sites
  if (mode === "sites" && !isTenantWideRole(role)) {
    return NextResponse.json(
      { error: "Permission insuffisante pour la comparaison inter-sites" },
      { status: 403 }
    );
  }

  // ─── Récupérer les années scolaires du tenant ───────────────────
  const annees = await prisma.anneesScolaires.findMany({
    where: { tenantId },
    orderBy: { dateDebut: "asc" },
    select: { id: true, libelle: true, dateDebut: true, dateFin: true, isCurrent: true },
  });

  if (annees.length === 0) {
    return NextResponse.json({ error: "Aucune année scolaire trouvée" }, { status: 404 });
  }

  // ─── Récupérer les sites du tenant ──────────────────────────────
  const sites = await prisma.site.findMany({
    where: { tenantId, actif: true },
    select: { id: true, nom: true, code: true },
    orderBy: { nom: "asc" },
  });

  // ═══════════════════════════════════════════════════════════════
  // MODE: COMPARAISON INTER-SITES
  // ═══════════════════════════════════════════════════════════════
  if (mode === "sites") {
    const targetAnneeId = anneeId || annees[annees.length - 1].id;
    const siteIds = sites.map((s) => s.id);

    // ─── Batch 1 : requêtes agrégeables via groupBy / findMany (6 connexions) ───
    // Ces modèles ont une colonne `siteId` directe : on peut regrouper en une
    // seule requête au lieu de N requêtes par site.
    const [
      effectifGroups,
      facturesRetardGroups,
      facturesPayeesGroups,
      masteryGroups,
      recoGroups,
      predictionsAll,
    ] = await Promise.all([
      // Effectif actif
      prisma.eleve.groupBy({
        by: ["siteId"],
        where: { tenantId, siteId: { in: siteIds }, statut: "ACTIF", deletedAt: null },
        _count: { id: true },
      }),
      // Factures en retard
      prisma.facture.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          statut: "EN_RETARD",
          ...(activeAnneeId ? { anneeId: activeAnneeId } : {}),
        },
        _count: { id: true },
      }),
      // Factures payées
      prisma.facture.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          statut: "PAYEE",
          ...(activeAnneeId ? { anneeId: activeAnneeId } : {}),
        },
        _count: { id: true },
      }),
      // Maîtrise moyenne (learning profiles)
      prisma.studentLearningProfile.groupBy({
        by: ["siteId"],
        where: { tenantId, siteId: { in: siteIds } },
        _avg: { masteryScore: true, confidenceScore: true },
        _count: { id: true },
      }),
      // Recommandations actives
      prisma.recommandation.groupBy({
        by: ["siteId"],
        where: {
          tenantId,
          siteId: { in: siteIds },
          statut: { in: ["OBLIGATOIRE", "RECOMMANDEE", "PROPOSEE"] },
          ...(anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {}),
        },
        _count: { id: true },
      }),
      // Prédictions LEARNOS — une seule findMany, regroupée en mémoire
      prisma.predictionDifficulte.findMany({
        where: {
          tenantId,
          siteId: { in: siteIds },
          anneeId: targetAnneeId,
        },
        select: {
          siteId: true,
          probaReussite: true,
          predictionCorrecte: true,
          difficultePredite: true,
          ecart: true,
        },
      }),
    ]);

    // ─── Construire les lookup maps depuis les résultats groupés ───
    const effectifMap = new Map(
      effectifGroups.map((g) => [g.siteId, g._count.id] as const)
    );
    const facturesRetardMap = new Map(
      facturesRetardGroups.map((g) => [g.siteId, g._count.id] as const)
    );
    const facturesPayeesMap = new Map(
      facturesPayeesGroups.map((g) => [g.siteId, g._count.id] as const)
    );
    const masteryMap = new Map(masteryGroups.map((g) => [g.siteId, g] as const));
    const recoMap = new Map(
      recoGroups.map((g) => [g.siteId, g._count.id] as const)
    );
    const predictionsBySite = new Map<string, typeof predictionsAll>();
    for (const p of predictionsAll) {
      // siteId est filtré par `in: siteIds` (tous non-null) mais le type
      // Prisma reste `string | null` — on ignore les éventuels null.
      if (!p.siteId) continue;
      if (!predictionsBySite.has(p.siteId)) predictionsBySite.set(p.siteId, []);
      predictionsBySite.get(p.siteId)!.push(p);
    }

    // ─── Batch 2 : requêtes à filtre relationnel, séquentiel par site (5 connexions max) ───
    // Ces modèles n'ont pas de colonne `siteId` directe (le filtre passe par
    // une relation : eleve.siteId, feuille.siteId, exercice.feuille.siteId).
    // On traite donc un site à la fois pour éviter N×5 connexions simultanées.
    const relationKpis = new Map<
      string,
      {
        moyennesNotes: { _avg: { valeur: number | null }; _count: { id: number } };
        absencesInjust: number;
        exclusions: number;
        exercicesAssignes: number;
        exercicesReponses: number;
      }
    >();

    for (const site of sites) {
      const [
        moyennesNotes,
        absencesInjust,
        exclusions,
        exercicesAssignes,
        exercicesReponses,
      ] = await Promise.all([
        // Moyenne générale des notes publiées
        prisma.note.aggregate({
          where: {
            tenantId,
            isPubliee: true,
            eleve: { siteId: site.id },
            ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
          },
          _avg: { valeur: true },
          _count: { id: true },
        }),
        // Absences injustifiées
        prisma.absence.count({
          where: {
            tenantId,
            statut: "INJUSTIFIEE",
            eleve: {
              siteId: site.id,
              ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
            },
          },
        }),
        // Exclusions
        prisma.exclusionEleve.count({
          where: {
            tenantId,
            eleve: { siteId: site.id },
          },
        }),
        // Exercices assignés (via feuille)
        prisma.exerciceAssigne.count({
          where: {
            feuille: { tenantId, siteId: site.id },
          },
        }),
        // Exercices répondus (via exercice assigné → feuille)
        prisma.exerciceReponse.count({
          where: {
            exercice: {
              feuille: { tenantId, siteId: site.id },
            },
          },
        }),
      ]);

      relationKpis.set(site.id, {
        moyennesNotes,
        absencesInjust,
        exclusions,
        exercicesAssignes,
        exercicesReponses,
      });
    }

    // ─── Assembler les résultats (mapping en mémoire) ───
    const siteData = sites.map((site) => {
      const effectif = effectifMap.get(site.id) ?? 0;
      const facturesRetard = facturesRetardMap.get(site.id) ?? 0;
      const facturesPayees = facturesPayeesMap.get(site.id) ?? 0;
      const mastery = masteryMap.get(site.id);
      const recommandations = recoMap.get(site.id) ?? 0;
      const predictions = predictionsBySite.get(site.id) ?? [];
      const rel = relationKpis.get(site.id)!;

      const avgMoyenne = rel.moyennesNotes._avg.valeur ?? 0;
      const nbNotes = rel.moyennesNotes._count.id;
      const nbPred = predictions.length;
      const predCorrectes = predictions.filter((p) => p.predictionCorrecte === true).length;
      const avgProbaReussite =
        nbPred > 0 ? predictions.reduce((s, p) => s + p.probaReussite, 0) / nbPred : 0;
      const predsWithEcart = predictions.filter((p) => p.ecart !== null);
      const avgEcart =
        predsWithEcart.length > 0
          ? predsWithEcart.reduce((s, p) => s + (p.ecart ?? 0), 0) / predsWithEcart.length
          : 0;
      const avgMastery = mastery?._avg.masteryScore ?? 0;
      const avgConfidence = mastery?._avg.confidenceScore ?? 0;
      const tauxExercices =
        rel.exercicesAssignes > 0 ? (rel.exercicesReponses / rel.exercicesAssignes) * 100 : 0;
      const tauxPrecision = nbPred > 0 ? (predCorrectes / nbPred) * 100 : 0;

      return {
        siteId: site.id,
        siteNom: site.nom,
        siteCode: site.code,
        effectif,
        moyenneGenerale: Math.round(avgMoyenne * 100) / 100,
        nbNotes,
        absencesInjust: rel.absencesInjust,
        facturesRetard,
        facturesPayees,
        exclusions: rel.exclusions,
        recommandations,
        // LEARNOS
        nbPredictions: nbPred,
        probaReussiteMoy: Math.round(avgProbaReussite * 1000) / 10,
        precisionPredictions: Math.round(tauxPrecision * 10) / 10,
        ecartMoyen: Math.round(avgEcart * 1000) / 10,
        masteryMoy: Math.round(avgMastery * 1000) / 10,
        confidenceMoy: Math.round(avgConfidence * 1000) / 10,
        exercicesAssignes: rel.exercicesAssignes,
        exercicesReponses: rel.exercicesReponses,
        tauxExercices: Math.round(tauxExercices * 10) / 10,
      };
    });

    return NextResponse.json({
      mode: "sites",
      anneeId: targetAnneeId,
      annees: annees.map((a) => ({ id: a.id, libelle: a.libelle, isCurrent: a.isCurrent })),
      sites: siteData,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // MODE: COMPARAISON INTER-ANNÉES
  // ═══════════════════════════════════════════════════════════════
  if (mode === "annees") {
    const anneeIds = annees.map((a) => a.id);

    // ─── Batch 1 : prédictions LEARNOS en une seule findMany (1 connexion) ───
    // Les prédictions sont filtrées par anneeId, pas par plage de dates, donc
    // on peut toutes les récupérer en une seule requête.
    const predictionsAll = await prisma.predictionDifficulte.findMany({
      where: {
        tenantId,
        ...(siteId ? { siteId } : {}),
        anneeId: { in: anneeIds },
      },
      select: {
        anneeId: true,
        probaReussite: true,
        predictionCorrecte: true,
        difficultePredite: true,
        ecart: true,
      },
    });

    const predictionsByAnnee = new Map<string, typeof predictionsAll>();
    for (const p of predictionsAll) {
      if (!predictionsByAnnee.has(p.anneeId)) predictionsByAnnee.set(p.anneeId, []);
      predictionsByAnnee.get(p.anneeId)!.push(p);
    }

    // ─── Batch 2 : requêtes restantes, séquentiel par année (9 connexions max) ───
    // La plupart de ces requêtes filtrent par plage de dates (dateDebut/dateFin
    // de l'année), ce qui empêche un groupBy par anneeId. On traite donc une
    // année à la fois pour éviter N×9 connexions simultanées.
    const anneeData: Array<{
      anneeId: string;
      libelle: string;
      isCurrent: boolean;
      effectif: number;
      moyenneGenerale: number;
      nbNotes: number;
      absencesInjust: number;
      facturesRetard: number;
      exclusions: number;
      nbPredictions: number;
      probaReussiteMoy: number;
      precisionPredictions: number;
      ecartMoyen: number;
      masteryMoy: number;
      confidenceMoy: number;
      exercicesAssignes: number;
      exercicesReponses: number;
      tauxExercices: number;
      kpiSnapshots: Record<string, { valeur: number; cible: number | null; periode: string }[]>;
    }> = [];

    for (const annee of annees) {
      const eleveSiteFilter = siteId ? { siteId } : {};
      const feuilleSiteFilter = siteId ? { siteId } : {};
      const factureSiteFilter = siteId ? { siteId } : {};
      const kpiSiteFilter = siteId ? { siteId } : {};
      const slpSiteFilter = siteId ? { siteId } : {};

      const [
        effectif,
        moyennesNotes,
        absencesInjust,
        facturesRetard,
        exclusions,
        exercicesAssignes,
        exercicesReponses,
        masteryScores,
        kpiSnapshots,
      ] = await Promise.all([
        prisma.eleve.count({
          where: {
            tenantId,
            ...eleveSiteFilter,
            statut: "ACTIF",
            deletedAt: null,
          },
        }),
        prisma.note.aggregate({
          where: {
            tenantId,
            isPubliee: true,
            eleve: { ...eleveSiteFilter, tenantId },
            createdAt: { gte: annee.dateDebut, lt: annee.dateFin },
          },
          _avg: { valeur: true },
          _count: { id: true },
        }),
        prisma.absence.count({
          where: {
            tenantId,
            statut: "INJUSTIFIEE",
            eleve: { ...eleveSiteFilter, tenantId },
            date: { gte: annee.dateDebut, lt: annee.dateFin },
          },
        }),
        prisma.facture.count({
          where: {
            tenantId,
            ...factureSiteFilter,
            statut: "EN_RETARD",
            anneeId: annee.id,
            createdAt: { gte: annee.dateDebut, lt: annee.dateFin },
          },
        }),
        prisma.exclusionEleve.count({
          where: {
            tenantId,
            eleve: { ...eleveSiteFilter, tenantId },
            dateDebut: { gte: annee.dateDebut, lt: annee.dateFin },
          },
        }),
        prisma.exerciceAssigne.count({
          where: {
            feuille: {
              tenantId,
              ...feuilleSiteFilter,
              createdAt: { gte: annee.dateDebut, lt: annee.dateFin },
            },
          },
        }),
        prisma.exerciceReponse.count({
          where: {
            exercice: {
              feuille: {
                tenantId,
                ...feuilleSiteFilter,
              },
            },
            repondueLe: { gte: annee.dateDebut, lt: annee.dateFin },
          },
        }),
        prisma.studentLearningProfile.aggregate({
          where: {
            tenantId,
            ...slpSiteFilter,
          },
          _avg: { masteryScore: true, confidenceScore: true },
          _count: { id: true },
        }),
        prisma.kpiSnapshot.findMany({
          where: {
            tenantId,
            ...kpiSiteFilter,
            periode: { gte: annee.dateDebut, lt: annee.dateFin },
          },
          select: { kpiKey: true, valeur: true, cible: true, periode: true },
          orderBy: { periode: "asc" },
        }),
      ]);

      const predictions = predictionsByAnnee.get(annee.id) ?? [];

      const avgMoyenne = moyennesNotes._avg.valeur ?? 0;
      const nbNotes = moyennesNotes._count.id;
      const nbPred = predictions.length;
      const predCorrectes = predictions.filter((p) => p.predictionCorrecte === true).length;
      const avgProbaReussite =
        nbPred > 0 ? predictions.reduce((s, p) => s + p.probaReussite, 0) / nbPred : 0;
      const predsWithEcart = predictions.filter((p) => p.ecart !== null);
      const avgEcart =
        predsWithEcart.length > 0
          ? predsWithEcart.reduce((s, p) => s + (p.ecart ?? 0), 0) / predsWithEcart.length
          : 0;
      const avgMastery = masteryScores._avg.masteryScore ?? 0;
      const avgConfidence = masteryScores._avg.confidenceScore ?? 0;
      const tauxExercices =
        exercicesAssignes > 0 ? (exercicesReponses / exercicesAssignes) * 100 : 0;
      const tauxPrecision = nbPred > 0 ? (predCorrectes / nbPred) * 100 : 0;

      // Grouper les KPI snapshots par clé
      const kpiByYear: Record<string, { valeur: number; cible: number | null; periode: string }[]> = {};
      for (const k of kpiSnapshots) {
        if (!kpiByYear[k.kpiKey]) kpiByYear[k.kpiKey] = [];
        kpiByYear[k.kpiKey].push({
          valeur: k.valeur,
          cible: k.cible,
          periode: k.periode.toISOString(),
        });
      }

      anneeData.push({
        anneeId: annee.id,
        libelle: annee.libelle,
        isCurrent: annee.isCurrent,
        effectif,
        moyenneGenerale: Math.round(avgMoyenne * 100) / 100,
        nbNotes,
        absencesInjust,
        facturesRetard,
        exclusions,
        // LEARNOS
        nbPredictions: nbPred,
        probaReussiteMoy: Math.round(avgProbaReussite * 1000) / 10,
        precisionPredictions: Math.round(tauxPrecision * 10) / 10,
        ecartMoyen: Math.round(avgEcart * 1000) / 10,
        masteryMoy: Math.round(avgMastery * 1000) / 10,
        confidenceMoy: Math.round(avgConfidence * 1000) / 10,
        exercicesAssignes,
        exercicesReponses,
        tauxExercices: Math.round(tauxExercices * 10) / 10,
        kpiSnapshots: kpiByYear,
      });
    }

    return NextResponse.json({
      mode: "annees",
      siteId: siteId || null,
      sites: sites.map((s) => ({ id: s.id, nom: s.nom, code: s.code })),
      annees: anneeData,
    });
  }

  return NextResponse.json({ error: "Mode non supporté" }, { status: 400 });
}
