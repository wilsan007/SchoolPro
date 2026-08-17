import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { isTenantWideRole } from "@/lib/site-scope";

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

    const siteData = await Promise.all(
      sites.map(async (site) => {
        const [
          effectif,
          moyennesNotes,
          absencesInjust,
          facturesRetard,
          facturesPayees,
          exclusions,
          predictions,
          exercicesAssignes,
          exercicesReponses,
          masteryScores,
          recommandations,
        ] = await Promise.all([
          // Effectif actif
          prisma.eleve.count({
            where: { tenantId, siteId: site.id, statut: "ACTIF", deletedAt: null },
          }),
          // Moyenne générale des notes publiées
          prisma.note.aggregate({
            where: {
              tenantId,
              isPubliee: true,
              eleve: { siteId: site.id },
            },
            _avg: { valeur: true },
            _count: { id: true },
          }),
          // Absences injustifiées
          prisma.absence.count({
            where: {
              tenantId,
              statut: "INJUSTIFIEE",
              eleve: { siteId: site.id },
            },
          }),
          // Factures en retard
          prisma.facture.count({
            where: { tenantId, siteId: site.id, statut: "EN_RETARD" },
          }),
          // Factures payées
          prisma.facture.count({
            where: { tenantId, siteId: site.id, statut: "PAYEE" },
          }),
          // Exclusions
          prisma.exclusionEleve.count({
            where: {
              tenantId,
              eleve: { siteId: site.id },
            },
          }),
          // Prédictions LEARNOS
          prisma.predictionDifficulte.findMany({
            where: {
              tenantId,
              siteId: site.id,
              anneeId: targetAnneeId,
            },
            select: {
              probaReussite: true,
              predictionCorrecte: true,
              difficultePredite: true,
              ecart: true,
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
          // Maîtrise moyenne (learning profiles)
          prisma.studentLearningProfile.aggregate({
            where: {
              tenantId,
              siteId: site.id,
            },
            _avg: { masteryScore: true, confidenceScore: true },
            _count: { id: true },
          }),
          // Recommandations actives
          prisma.recommandation.count({
            where: {
              tenantId,
              siteId: site.id,
              statut: { in: ["OBLIGATOIRE", "RECOMMANDEE", "PROPOSEE"] },
            },
          }),
        ]);

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

        return {
          siteId: site.id,
          siteNom: site.nom,
          siteCode: site.code,
          effectif,
          moyenneGenerale: Math.round(avgMoyenne * 100) / 100,
          nbNotes,
          absencesInjust,
          facturesRetard,
          facturesPayees,
          exclusions,
          recommandations,
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
        };
      })
    );

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
    const anneeData = await Promise.all(
      annees.map(async (annee) => {
        const eleveSiteFilter = siteId ? { siteId } : {};
        const feuilleSiteFilter = siteId ? { siteId } : {};
        const factureSiteFilter = siteId ? { siteId } : {};
        const kpiSiteFilter = siteId ? { siteId } : {};
        const predSiteFilter = siteId ? { siteId } : {};
        const slpSiteFilter = siteId ? { siteId } : {};

        const [
          effectif,
          moyennesNotes,
          absencesInjust,
          facturesRetard,
          exclusions,
          predictions,
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
          prisma.predictionDifficulte.findMany({
            where: {
              tenantId,
              ...predSiteFilter,
              anneeId: annee.id,
            },
            select: {
              probaReussite: true,
              predictionCorrecte: true,
              difficultePredite: true,
              ecart: true,
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

        return {
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
        };
      })
    );

    return NextResponse.json({
      mode: "annees",
      siteId: siteId || null,
      sites: sites.map((s) => ({ id: s.id, nom: s.nom, code: s.code })),
      annees: anneeData,
    });
  }

  return NextResponse.json({ error: "Mode non supporté" }, { status: 400 });
}
