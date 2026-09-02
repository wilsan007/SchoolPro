import { NextRequest, NextResponse } from "next/server";
import { erreurJson } from "@/lib/erreurs-api";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import {
  siteFilterForModel,
  eleveScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";
import { anneeActiveId } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Évolution d'un élève au fil de l'année scolaire.
 *
 * Répond à la question : « cet élève a-t-il progressé du début à la fin de
 * l'année, et les prédictions émises en amont se sont-elles vérifiées ? »
 *
 * Renvoie :
 *   1. Les prédictions émises avant chaque chapitre, avec leur vérification
 *      a posteriori (masteryAvant → masteryApres, écart, correcte ou non).
 *   2. L'historique des preuves d'apprentissage (timeline de masterySignal).
 *   3. Les bulletins par période (moyenne, rang, décision).
 *   4. Une synthèse de trajectoire (progression, précision des prédictions).
 *
 * TIME MACHINE
 * -----------
 * L'horizon démo filtre automatiquement les preuves (`occurredAt <= demoDate`),
 * les bulletins (`publishedAt <= demoDate`) et les prédictions (`emiseLe <= demoDate`).
 * Pour les prédictions, la vérification (`verifieeLe`) n'est PAS filtrée par
 * l'horizon : on la masque manuellement si `verifieeLe > demoDate` — une
 * prédiction ne peut pas être « vérifiée » avant que la vérification n'ait eu lieu.
 *
 * ISOLATION
 * ---------
 * Accessible à l'élève lui-même, à son parent, au prof principal, au principal
 * et au tenant-admin. Le filtrage est double :
 *   - périmètre de site pour le personnel ;
 *   - périmètre relationnel (parent → ses enfants, élève → lui-même) via
 *     `eleveScopeFilter`.
 *
 * La permission `entrainement:read` est possédée par tous ces rôles.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }
  const denied = checkPermission(session.user.role, "entrainement:read");
  if (denied) return denied;

  const { id: eleveId } = await params;
  const tenantId = session.user.tenantId;
  const { searchParams } = new URL(req.url);
  const anneeId = searchParams.get("anneeId");

  // Double contrôle : périmètre de site ET périmètre personnel.
  // Un parent ne doit voir que ses enfants, un élève que son propre dossier.
  const eleve = await prisma.eleve.findFirst({
    where: mergeFilters(
      { id: eleveId, tenantId },
      siteFilterForModel("eleve", session.user),
      eleveScopeFilter(session.user, null)
    ),
    select: {
      id: true,
      nom: true,
      prenom: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
  });
  if (!eleve) {
    return erreurJson("ELEVE_INTROUVABLE");
  }

  // Résoudre l'année scolaire : celle demandée, sinon l'active (Time Machine),
  // sinon la plus récente.
  let annee = anneeId
    ? await prisma.anneesScolaires.findFirst({
        where: { id: anneeId, tenantId },
        select: { id: true, libelle: true, dateDebut: true, dateFin: true, isCurrent: true },
      })
    : await prisma.anneesScolaires.findFirst({
        where: { id: (await anneeActiveId(tenantId)) ?? "_none_", tenantId },
        select: { id: true, libelle: true, dateDebut: true, dateFin: true, isCurrent: true },
      });

  if (!annee) {
    annee = await prisma.anneesScolaires.findFirst({
      where: { tenantId },
      select: { id: true, libelle: true, dateDebut: true, dateFin: true, isCurrent: true },
      orderBy: { dateDebut: "desc" },
    });
  }

  if (!annee) {
    return NextResponse.json({
      eleve,
      annee: null,
      anneesDisponibles: [],
      predictions: [],
      evidences: [],
      bulletins: [],
      synthese: null,
    });
  }

  // Filtre relationnel pour les modèles rattachés à l'élève.
  const eleveRelFilter = eleveScopeFilter(session.user, "eleve");
  const siteFilter = siteFilterForModel("predictionDifficulte", session.user);

  // Date simulée (Time Machine) — borne supérieure pour les preuves, bulletins
  // et vérifications de prédictions. L'horizon démo filtre automatiquement
  // `LearningEvidence`, `Bulletin` et `PredictionDifficulte` ; nous l'utilisons
  // aussi ici pour masquer manuellement les vérifications de prédictions qui
  // n'ont pas encore eu lieu à la date simulée.
  const demoNow = await getDemoNow();

  // Charger en parallèle : prédictions, preuves, bulletins, années disponibles.
  const [predictions, evidences, bulletins, anneesDisponibles] = await Promise.all([
    // 1. Prédictions pour cette année, avec compétence et chapitre.
    prisma.predictionDifficulte.findMany({
      where: mergeFilters(
        { tenantId, eleveId, anneeId: annee.id },
        siteFilter,
        eleveRelFilter
      ),
      select: {
        id: true,
        probaReussite: true,
        difficultePredite: true,
        masteryAvant: true,
        masteryApres: true,
        predictionCorrecte: true,
        ecart: true,
        emiseLe: true,
        verifieeLe: true,
        competence: {
          select: {
            id: true,
            code: true,
            libelle: true,
            chapitre: {
              select: {
                id: true,
                nom: true,
                niveau: true,
                matiere: { select: { id: true, nom: true, couleur: true } },
              },
            },
          },
        },
      },
      orderBy: { emiseLe: "asc" },
    }),

    // 2. Preuves d'apprentissage (timeline de masterySignal).
    prisma.learningEvidence.findMany({
      where: mergeFilters(
        { tenantId, eleveId, occurredAt: { gte: annee.dateDebut, lte: annee.dateFin } },
        siteFilterForModel("learningEvidence", session.user),
        eleveRelFilter
      ),
      select: {
        id: true,
        masterySignal: true,
        confidence: true,
        occurredAt: true,
        evidenceType: true,
        sourceType: true,
        competence: {
          select: {
            id: true,
            code: true,
            libelle: true,
            chapitre: {
              select: {
                matiere: { select: { id: true, nom: true, couleur: true } },
              },
            },
          },
        },
        matiere: { select: { id: true, nom: true, couleur: true } },
      },
      orderBy: { occurredAt: "asc" },
      take: 500,
    }),

    // 3. Bulletins par période — uniquement ceux déjà publiés à la date simulée.
    //    L'horizon démo filtre `publishedAt <= demoDate` automatiquement ; on
    //    ajoute aussi `isPublie: true` pour le cas où le flag et la date
    //    divergent (seed, migration partielle).
    prisma.bulletin.findMany({
      where: mergeFilters(
        { tenantId, eleveId, isPublie: true, periode: { anneeId: annee.id } },
        siteFilterForModel("bulletin", session.user),
        eleveRelFilter
      ),
      select: {
        id: true,
        moyenneGenerale: true,
        moyenneClasse: true,
        rang: true,
        effectifClasse: true,
        appreciation: true,
        decision: true,
        isPublie: true,
        heuresAbsence: true,
        periode: {
          select: { id: true, nom: true, numero: true, dateDebut: true, dateFin: true },
        },
      },
      orderBy: { periode: { numero: "asc" } },
    }),

    // 4. Toutes les années disponibles pour le sélecteur.
    prisma.anneesScolaires.findMany({
      where: { tenantId },
      select: {
        id: true,
        libelle: true,
        dateDebut: true,
        dateFin: true,
        isCurrent: true,
        statut: true,
      },
      orderBy: { dateDebut: "desc" },
    }),
  ]);

  // ── Masquer les vérifications de prédictions futures ────────────────────
  // L'horizon démo filtre `emiseLe <= demoDate` (une prédiction non encore
  // émise n'est pas visible). Mais `verifieeLe` n'est pas filtré : une
  // prédiction émise en septembre peut être vérifiée en avril, et en se
  // plaçant en octobre on ne doit pas voir le résultat de cette vérification.
  const predictionsMasquees = predictions.map((p) => {
    if (p.verifieeLe && new Date(p.verifieeLe) > demoNow) {
      return {
        ...p,
        verifieeLe: null,
        masteryApres: null,
        predictionCorrecte: null,
        ecart: null,
      };
    }
    return p;
  });

  // ── Synthèse de trajectoire ──────────────────────────────────────────────

  // 1. Progression : comparer la maîtrise moyenne au début vs à la fin.
  const evidencesAvecDate = evidences.filter((e) => e.masterySignal != null);
  const milieuAnnee = new Date(
    (annee.dateDebut.getTime() + annee.dateFin.getTime()) / 2
  );

  const evidencesDebut = evidencesAvecDate.filter(
    (e) => new Date(e.occurredAt) < milieuAnnee
  );
  const evidencesFin = evidencesAvecDate.filter(
    (e) => new Date(e.occurredAt) >= milieuAnnee
  );

  const moyenneDebut =
    evidencesDebut.length > 0
      ? evidencesDebut.reduce((s, e) => s + (e.masterySignal ?? 0), 0) /
        evidencesDebut.length
      : null;
  const moyenneFin =
    evidencesFin.length > 0
      ? evidencesFin.reduce((s, e) => s + (e.masterySignal ?? 0), 0) /
        evidencesFin.length
      : null;

  // 2. Précision des prédictions pour cet élève.
  const predictionsVerifiees = predictionsMasquees.filter((p) => p.verifieeLe !== null);
  const predictionsCorrectes = predictionsVerifiees.filter(
    (p) => p.predictionCorrecte === true
  );
  const tauxPrecision =
    predictionsVerifiees.length > 0
      ? predictionsCorrectes.length / predictionsVerifiees.length
      : null;

  // 3. Écarts moyens (prédiction vs réalité).
  const ecarts = predictionsVerifiees
    .filter((p) => p.ecart != null)
    .map((p) => p.ecart as number);
  const ecartMoyen =
    ecarts.length > 0 ? ecarts.reduce((s, e) => s + e, 0) / ecarts.length : null;

  // 4. Distribution par difficulté prédite.
  const distribution: Record<string, number> = {};
  for (const p of predictionsMasquees) {
    distribution[p.difficultePredite] =
      (distribution[p.difficultePredite] ?? 0) + 1;
  }

  // 5. Trajectoire : progression vs régression.
  let trajectoire: "PROGRESSION" | "STABLE" | "REGRESSION" | "INDETERMINE" =
    "INDETERMINE";
  if (moyenneDebut !== null && moyenneFin !== null) {
    const delta = moyenneFin - moyenneDebut;
    if (delta > 0.05) trajectoire = "PROGRESSION";
    else if (delta < -0.05) trajectoire = "REGRESSION";
    else trajectoire = "STABLE";
  }

  // 6. Évolution des bulletins (moyenne par période).
  const moyennesBulletins = bulletins
    .filter((b) => b.moyenneGenerale != null)
    .map((b) => ({
      periode: b.periode.nom,
      numero: b.periode.numero,
      moyenne: b.moyenneGenerale as number,
      rang: b.rang,
      effectif: b.effectifClasse,
    }));

  const synthese = {
    trajectoire,
    moyenneDebut,
    moyenneFin,
    deltaMoyenne:
      moyenneDebut !== null && moyenneFin !== null
        ? moyenneFin - moyenneDebut
        : null,
    totalPredictions: predictionsMasquees.length,
    predictionsVerifiees: predictionsVerifiees.length,
    predictionsCorrectes: predictionsCorrectes.length,
    tauxPrecision,
    ecartMoyen,
    distribution,
    moyennesBulletins,
    totalEvidences: evidences.length,
  };

  return NextResponse.json({
    eleve,
    annee,
    anneesDisponibles,
    predictions: predictionsMasquees,
    evidences,
    bulletins,
    synthese,
  });
}
