import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";
import {
  analyserPatterns,
  detecterCorrelations,
} from "@/lib/learnos/pattern-analyzer";
import { predirePourChapitre, verifierPredictions } from "@/lib/learnos/prediction-engine";
import { calibrerSeuils } from "@/lib/learnos/calibration";
import { publishEvent, type KpiRecalculerPayload } from "@/lib/learnos/events";

const intelligenceSchema = z.object({
  action: z.enum(["analyser", "correlations", "predire", "verifier", "calibrer", "complet"]).optional(),
  chapitreId: z.string().optional(),
  anneeId: z.string().optional(),
});

/**
 * Tableau de bord d'intelligence pédagogique.
 *
 * GET  — consulte l'état actuel : patterns, prédictions, calibrations, journal.
 * POST — déclenche un cycle d'analyse complet :
 *          1. Détection des patterns
 *          2. Détection des corrélations
 *          3. Vérification des prédictions passées
 *          4. Calibration des seuils
 *
 * Ouvert à la direction et aux enseignants (`entrainement:read`), car c'est
 * un tableau de bord pédagogique, pas une donnée élève individuelle.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const anneeId = searchParams.get("anneeId");

  // Charger en parallèle : patterns, prédictions, calibrations, journal.
  const [patterns, predictions, calibrations, journal, stats] = await Promise.all([
    prisma.patternPedagogique.findMany({
      where: { tenantId, ...siteFilterForModel("patternPedagogique", session.user) },
      include: {
        competence: { select: { code: true, libelle: true, chapitre: { select: { nom: true, matiere: { select: { nom: true } } } } } },
      },
      orderBy: { tauxEchec: "desc" },
      take: 50,
    }),
    anneeId
      ? prisma.predictionDifficulte.findMany({
          // Le commentaire de tête présente cet écran comme réservé à la
          // direction et aux enseignants, mais `entrainement:read` est aussi
          // accordé à PARENT et STUDENT. Pour ces rôles le filtre de site est
          // NEUTRE (périmètre relationnel, cf. site-scope.ts) : la liste des
          // prédictions, nominative (`eleve.nom`/`prenom`), leur était donc
          // servie en entier. `personalScopeFilter` la borne à leurs enfants
          // sans rien changer pour le personnel.
          where: {
            tenantId,
            anneeId,
            ...mergeFilters(
              siteFilterForModel("predictionDifficulte", session.user),
              personalScopeFilter(session.user, "eleve")
            ),
          },
          select: {
            id: true,
            difficultePredite: true,
            probaReussite: true,
            predictionCorrecte: true,
            ecart: true,
            verifieeLe: true,
            eleve: { select: { nom: true, prenom: true } },
            competence: { select: { code: true, libelle: true } },
          },
          orderBy: { emiseLe: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    prisma.calibrationSeuil.findMany({
      where: { tenantId, ...siteFilterForModel("calibrationSeuil", session.user) },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.journalApprentissage.findMany({
      where: { tenantId, ...siteFilterForModel("journalApprentissage", session.user) },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Statistiques agrégées.
    anneeId
      ? prisma.predictionDifficulte.groupBy({
          by: ["difficultePredite", "predictionCorrecte"],
          where: { tenantId, anneeId, verifieeLe: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // Calculer le taux de précision global.
  const totalVerifiees = stats.reduce((s, st) => s + st._count._all, 0);
  const totalCorrectes = stats
    .filter((s) => s.predictionCorrecte === true)
    .reduce((s, st) => s + st._count._all, 0);
  const tauxPrecision = totalVerifiees > 0 ? totalCorrectes / totalVerifiees : null;

  // Distribution par difficulté.
  const distribution: Record<string, number> = {};
  for (const s of stats) {
    distribution[s.difficultePredite] = (distribution[s.difficultePredite] ?? 0) + s._count._all;
  }

  return NextResponse.json({
    patterns,
    predictions,
    calibrations,
    journal,
    stats: {
      totalPatterns: patterns.length,
      totalPredictions: predictions.length,
      totalCalibrations: calibrations.length,
      tauxPrecision,
      totalVerifiees,
      distribution,
    },
  });
}

/**
 * Déclenche un cycle d'analyse complet.
 *
 * Body:
 *   - action: "analyser" | "predire" | "verifier" | "calibrer" | "complet"
 *   - chapitreId: (pour "predire")
 *   - anneeId: (pour "verifier")
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
  const denied = await checkPermission(session.user.role, "ai:teacher");
  if (denied) return denied;

  const tenantId = session.user.tenantId;
  const body = (await req.json().catch(() => ({})));
  const parsed = intelligenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
  }
  const { action, chapitreId, anneeId } = parsed.data;

  const actionStr = action ?? "complet";
  const resultats: Record<string, unknown> = {};

  if (actionStr === "analyser" || actionStr === "complet") {
    resultats.patterns = await analyserPatterns(tenantId, session.user);
  }

  if (actionStr === "correlations" || actionStr === "complet") {
    resultats.correlations = await detecterCorrelations(tenantId, session.user);
  }

  if (actionStr === "predire" && chapitreId && anneeId) {
    resultats.predictions = await predirePourChapitre(
      tenantId,
      session.user,
      chapitreId,
      anneeId
    );
  }

  if (actionStr === "verifier" && anneeId) {
    resultats.verification = await verifierPredictions(tenantId, session.user, anneeId);
  }

  if (actionStr === "calibrer" || actionStr === "complet") {
    resultats.calibration = await calibrerSeuils(tenantId, session.user);
  }

  const patternsResult = resultats.patterns as
    | { patternsCrees: number; patternsMisAJour: number; echantillonTotal: number }
    | undefined;
  const correlationsResult = resultats.correlations as
    | { correlationsCrees: number }
    | undefined;

  if (patternsResult || correlationsResult) {
    await publishEvent({
      tenantId,
      siteId: null,
      eventType: "kpi.recalculer",
      aggregateType: "Tenant",
      aggregateId: tenantId,
      payload: {
        perimetre: actionStr,
        patternsCrees: patternsResult?.patternsCrees ?? 0,
        patternsMisAJour: patternsResult?.patternsMisAJour ?? 0,
        echantillonTotal: patternsResult?.echantillonTotal ?? 0,
        correlationsCrees: correlationsResult?.correlationsCrees ?? 0,
      } satisfies KpiRecalculerPayload,
    });
  }

  return NextResponse.json({ action, resultats });
}
