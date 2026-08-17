/**
 * seed-ambouli-learnos-intelligence.ts — Intelligence pédagogique LEARNOS.
 *
 * - PatternPedagogique : patterns historiques (moyenne/taux échec par niveau × matière × compétence)
 * - PredictionDifficulte : prédictions émises avant chapitres + vérification
 * - JournalApprentissage : trace d'audit des analyses
 * - KpiSnapshot : indicateurs périodiques
 * - AlerteParent : alertes envoyées aux familles
 * - EchangeParent : questions de parents + réponses
 * - PlanLecon / RubriqueEvaluation : propositions IA (workflow validation)
 * - AiDecisionLog : traces de décisions IA
 * - AiCache : cache de générations
 */

import { PrismaClient, NiveauAlerteParent, StatutPropositionIa } from "@prisma/client";
import { setSeed, randInt, pick, chance, clamp, gauss, dateStr } from "./seed-ambouli-helpers";
import type { RefData } from "./seed-ambouli-ref";
import type { UsersData } from "./seed-ambouli-users";
import type { ClassesData } from "./seed-ambouli-classes";
import type { LearnosCurriculumData } from "./seed-ambouli-learnos-curriculum";

export async function seedLearnosIntelligence(
  prisma: PrismaClient,
  ref: RefData,
  users: UsersData,
  classes: ClassesData,
  curriculum: LearnosCurriculumData,
): Promise<void> {
  setSeed(20250401);
  console.log("🌱 [11/12] Création de l'intelligence pédagogique LEARNOS (patterns, prédictions, bot parent, IA)...");

  // ════════════════════════════════════════════════════════════
  // PatternPedagogique : patterns historiques par niveau × matière
  // ════════════════════════════════════════════════════════════
  let patternCount = 0;
  const niveaux = ["6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale"];
  const matieresCodes = ["MATH", "FR", "PC", "SVT"];

  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    // Variation entre sites : Arhiba a des résultats légèrement plus faibles
    const siteVariation = site === "arhiba" ? -0.05 : 0;

    for (const niveau of niveaux) {
      for (const matCode of matieresCodes) {
        const matiereId = ref.matieres[`${siteCode}-${matCode}`];
        if (!matiereId) continue;

        // Récupérer les compétences de cette matière × niveau
        const comps = await prisma.competence.findMany({
          where: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            chapitre: { matiereId, niveau },
          },
          take: 5,
        });

        for (const comp of comps) {
          const masteryMoyenne = clamp(0.55 + siteVariation + gauss(0, 0.1), 0.2, 0.85);
          const tauxEchec = masteryMoyenne < 0.4 ? randInt(30, 60) / 100 : randInt(5, 20) / 100;

          await prisma.patternPedagogique.create({
            data: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              niveau,
              matiereId,
              competenceId: comp.id,
              masteryMoyenne: Math.round(masteryMoyenne * 100) / 100,
              confidenceMoyenne: 0.7,
              effectif: randInt(50, 200),
              ecartType: 0.15,
              tauxEchec: Math.round(tauxEchec * 100) / 100,
              periodeDebut: dateStr(2024, 9, 15),
              periodeFin: dateStr(2025, 7, 15),
              anneesCouvertes: 2,
              semaineChapitre: randInt(1, 30),
            },
          });
          patternCount++;
        }
      }
    }
  }
  console.log(`  ✅ PatternPedagogique: ${patternCount}`);

  // ════════════════════════════════════════════════════════════
  // PredictionDifficulte : prédictions émises + vérification
  // ════════════════════════════════════════════════════════════
  let predictionCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    const siteVariation = site === "arhiba" ? -0.05 : 0;

    for (const annee of ["2024-2025", "2025-2026"]) {
      const anneeId = annee === "2024-2025" ? ref.annees.y2024 : ref.annees.y2025;
      const siteClasses = classes.classesBySiteYear[`${site}-${annee}`] || [];

      for (const cls of siteClasses) {
        const eleves = classes.elevesByClass[cls.id] || [];
        if (eleves.length === 0) continue;

        // Pour MATH et FR, créer des prédictions pour un échantillon d'élèves
        for (const matCode of ["MATH", "FR"]) {
          const matiereId = ref.matieres[`${siteCode}-${matCode}`];
          if (!matiereId) continue;
          const comps = await prisma.competence.findMany({
            where: {
              tenantId: ref.tenantId,
              siteId: ref.sites[site],
              chapitre: { matiereId, niveau: cls.niveau },
            },
            take: 3,
          });

          for (const comp of comps) {
            // Prédictions pour 30% des élèves
            for (const el of eleves.filter(() => chance(0.3))) {
              const probaReussite = clamp(0.6 + siteVariation + gauss(0, 0.15), 0.2, 0.9);
              const difficulte = probaReussite < 0.4 ? "CRITIQUE" : probaReussite < 0.6 ? "DIFFICILE" : probaReussite < 0.75 ? "MODERE" : "FACILE";
              const isAnneePassee = annee === "2024-2025";

              // Récupérer le profil de l'élève
              const profil = await prisma.studentLearningProfile.findFirst({
                where: { eleveId: el.id, competenceId: comp.id },
              });

              await prisma.predictionDifficulte.create({
                data: {
                  tenantId: ref.tenantId,
                  siteId: ref.sites[site],
                  eleveId: el.id,
                  competenceId: comp.id,
                  chapitreId: comp.chapitreId,
                  anneeId,
                  probaReussite: Math.round(probaReussite * 100) / 100,
                  difficultePredite: difficulte,
                  masteryAvant: profil?.masteryScore ?? null,
                  confidenceAvant: profil?.confidenceScore ?? null,
                  prerequisManquants: profil?.prerequisiteStatus ? 2 : 0,
                  // Vérification pour l'année passée
                  masteryApres: isAnneePassee ? clamp(probaReussite + gauss(0.05, 0.1), 0.1, 0.95) : null,
                  predictionCorrecte: isAnneePassee ? chance(0.7) : null,
                  ecart: isAnneePassee ? Math.round(gauss(0, 0.1) * 100) / 100 : null,
                  emiseLe: dateStr(parseInt(annee.split("-")[0]), 9, randInt(1, 15)),
                  verifieeLe: isAnneePassee ? dateStr(2025, 6, randInt(1, 15)) : null,
                },
              });
              predictionCount++;
            }
          }
        }
      }
    }
  }
  console.log(`  ✅ PredictionDifficulte: ${predictionCount} (avec vérification pour 2024-2025)`);

  // ════════════════════════════════════════════════════════════
  // JournalApprentissage : trace d'audit
  // ════════════════════════════════════════════════════════════
  let journalCount = 0;
  const journalTypes = [
    { type: "pattern_detection", resume: "Détection des patterns pédagogiques sur 2 ans", perimetre: "Tous niveaux × Mathématiques" },
    { type: "pattern_detection", resume: "Analyse des taux d'échec par compétence", perimetre: "Collège × Français" },
    { type: "prediction", resume: "Émission de prédictions pour le 1er trimestre 2025-2026", perimetre: "3ème × Physique-Chimie" },
    { type: "prediction", resume: "Émission de prédictions pour le 2ème trimestre", perimetre: "Terminale S × Mathématiques" },
    { type: "calibration", resume: "Calibration des seuils pour le niveau 6ème", perimetre: "6ème × toutes matières" },
    { type: "calibration", resume: "Ajustement des seuils critiques en Mathématiques", perimetre: "Terminale × Mathématiques" },
    { type: "pattern_detection", resume: "Comparaison inter-sites : Ambouli vs Arhiba", perimetre: "Tous niveaux × SVT" },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    for (const j of journalTypes) {
      await prisma.journalApprentissage.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          typeAnalyse: j.type,
          resume: `${j.resume} - ${site}`,
          detail: `Analyse effectuée sur ${randInt(50, 300)} données. Périmètre: ${j.perimetre}.`,
          echantillon: randInt(50, 300),
          perimetre: `${j.perimetre} - ${site}`,
        },
      });
      journalCount++;
    }
  }
  console.log(`  ✅ JournalApprentissage: ${journalCount}`);

  // ════════════════════════════════════════════════════════════
  // KpiSnapshot : indicateurs périodiques
  // ════════════════════════════════════════════════════════════
  let kpiCount = 0;
  const kpiDefs = [
    { role: "PRINCIPAL", key: "learnos.kpi.coverage_curriculum", valeur: 0.72, cible: 0.9 },
    { role: "PRINCIPAL", key: "learnos.kpi.taux_recommandations_critiques", valeur: 0.15, cible: 0.05 },
    { role: "PRINCIPAL", key: "learnos.kpi.taux_plans_actifs", valeur: 0.08, cible: 0.12 },
    { role: "TEACHER", key: "learnos.kpi.eleves_fragiles", valeur: 0.22, cible: 0.15 },
    { role: "TEACHER", key: "learnos.kpi.mastery_moyenne", valeur: 0.58, cible: 0.7 },
    { role: "TENANT_ADMIN", key: "learnos.kpi.precision_predictions", valeur: 0.73, cible: 0.8 },
    { role: "TENANT_ADMIN", key: "learnos.kpi.calibration_gain", valeur: 5.2, cible: 10 },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    // 6 mois d'historique
    for (let m = 0; m < 6; m++) {
      const periode = dateStr(2025, 7 + m, 1);
      for (const k of kpiDefs) {
        // Variation entre sites
        const variation = site === "arhiba" ? -0.03 : 0;
        const valeur = clamp(k.valeur + variation + gauss(0, 0.02), 0, 1);
        await prisma.kpiSnapshot.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            role: k.role,
            kpiKey: k.key,
            valeur: Math.round(valeur * 100) / 100,
            cible: k.cible,
            periode,
          },
        }).catch(() => {});
        kpiCount++;
      }
    }
  }
  console.log(`  ✅ KpiSnapshot: ${kpiCount} (6 mois × 7 indicateurs × 2 sites)`);

  // ════════════════════════════════════════════════════════════
  // AlerteParent : alertes envoyées aux familles
  // ════════════════════════════════════════════════════════════
  let alerteCount = 0;
  const alerteDefs = [
    { niveau: NiveauAlerteParent.INFO, cle: "learnos.alertes.progression_positive", params: { competence: "Fractions", evolution: "+12%" } },
    { niveau: NiveauAlerteParent.ATTENTION, cle: "learnos.alertes.absences_repetees", params: { count: 5, matiere: "Mathématiques" } },
    { niveau: NiveauAlerteParent.URGENT, cle: "learnos.alertes.maitrise_critique", params: { competence: "Équations", mastery: 0.28 } },
    { niveau: NiveauAlerteParent.INFO, cle: "learnos.alertes.objectif_atteint", params: { competence: "Géométrie", plan: "remediation" } },
    { niveau: NiveauAlerteParent.ATTENTION, cle: "learnos.alertes.baisse_performance", params: { matiere: "Français", evolution: "-8%" } },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteClasses = classes.classesBySiteYear[`${site}-2025-2026`] || [];
    for (const cls of siteClasses.slice(0, 10)) {
      const eleves = classes.elevesByClass[cls.id] || [];
      for (const el of eleves.filter(() => chance(0.15))) {
        const parentInfo = classes.parentsByEleve[el.id]?.[0];
        if (!parentInfo) continue;
        const alerteDef = pick(alerteDefs);
        await prisma.alerteParent.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            eleveId: el.id,
            parentId: parentInfo.id,
            niveau: alerteDef.niveau,
            cle: alerteDef.cle,
            params: alerteDef.params,
            canal: pick(["whatsapp", "sms", "whatsapp", "telegram"]),
            statut: pick(["ENVOYEE", "ENVOYEE", "EN_ATTENTE", "SUPPRIMEE"]),
            empreinte: `alerte-${el.id}-${alerteDef.cle}-${Date.now()}-${alerteCount}`,
            envoyeeLe: chance(0.7) ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
            motifSuppression: null,
          },
        }).catch(() => {});
        alerteCount++;
      }
    }
  }
  console.log(`  ✅ AlerteParent: ${alerteCount}`);

  // ════════════════════════════════════════════════════════════
  // EchangeParent : questions de parents + réponses
  // ════════════════════════════════════════════════════════════
  let echangeCount = 0;
  const echangeDefs = [
    { question: "Comment va mon enfant en mathématiques ?", intention: "progression", reponse: "Votre enfant progresse bien en mathématiques. Sa maîtrise moyenne est de 62%, en hausse de 8% par rapport au trimestre précédent." },
    { question: "Quelles sont les difficultés de mon fils ?", intention: "difficultes", reponse: "Votre fils rencontre des difficultés sur les équations du 1er degré (maîtrise 28%). Un plan de remédiation a été proposé." },
    { question: "Comment puis-je l'aider à la maison ?", intention: "aider", reponse: "Pour soutenir votre enfant, nous recommandons de réviser les fractions (prérequis des équations). Des exercices adaptés sont disponibles sur le portail." },
    { question: "Mon enfant était-il absent cette semaine ?", intention: "assiduite", reponse: "Votre enfant a été absent le mardi 12 novembre (maladie, justifié). Aucune autre absence signalée cette semaine." },
    { question: "Quel est le solde de ma facture ?", intention: "solde", reponse: "Votre solde restant à payer est de 45 000 DJF (3 mensualités en retard). Merci de régulariser auprès du secrétariat." },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteClasses = classes.classesBySiteYear[`${site}-2025-2026`] || [];
    for (const cls of siteClasses.slice(0, 5)) {
      const eleves = classes.elevesByClass[cls.id] || [];
      for (const el of eleves.filter(() => chance(0.1))) {
        const parentInfo = classes.parentsByEleve[el.id]?.[0];
        if (!parentInfo) continue;
        const echangeDef = pick(echangeDefs);
        await prisma.echangeParent.create({
          data: {
            tenantId: ref.tenantId,
            siteId: ref.sites[site],
            parentId: parentInfo.id,
            eleveId: el.id,
            canal: "whatsapp",
            question: echangeDef.question,
            intention: echangeDef.intention,
            reponse: echangeDef.reponse,
            modele: chance(0.3) ? "gpt-4o-mini" : null,
          },
        }).catch(() => {});
        echangeCount++;
      }
    }
  }
  console.log(`  ✅ EchangeParent: ${echangeCount}`);

  // ════════════════════════════════════════════════════════════
  // PlanLecon & RubriqueEvaluation : propositions IA (workflow)
  // ════════════════════════════════════════════════════════════
  let planLeconCount = 0;
  let rubriqueCount = 0;
  for (const site of ["ambouli", "arhiba"] as const) {
    const siteCode = site === "ambouli" ? "AMB" : "ARH";
    const teachers = users.teachers[site];
    const principalId = users.principals[`${site}-coll`];

    // 5 plans de leçon par site
    for (let i = 0; i < 5; i++) {
      const matCode = pick(["MATH", "FR", "PC", "SVT"]);
      const matiereId = ref.matieres[`${siteCode}-${matCode}`];
      if (!matiereId) continue;
      const niveau = pick(["6ème", "3ème", "2nde", "Terminale"]);
      const comps = await prisma.competence.findMany({
        where: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          chapitre: { matiereId, niveau },
        },
        take: 1,
      });
      if (comps.length === 0) continue;
      const comp = comps[0];
      const teacher = pick(teachers);
      const statut = pick([StatutPropositionIa.PROPOSE, StatutPropositionIa.AJUSTE, StatutPropositionIa.VALIDE, StatutPropositionIa.REJETE]);

      await prisma.planLecon.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          competenceId: comp.id,
          niveauScolaire: niveau,
          dureeTotale: pick([45, 60, 90]),
          titre: `Plan de leçon - ${comp.libelle}`,
          objectifs: JSON.stringify(["Objectif 1", "Objectif 2", "Objectif 3"]),
          etapes: JSON.stringify([
            { nom: "Introduction", duree: 10, description: "Rappel des prérequis" },
            { nom: "Découverte", duree: 20, description: "Présentation du concept" },
            { nom: "Application", duree: 15, description: "Exercices guidés" },
            { nom: "Évaluation", duree: 10, description: "Quiz de fin" },
          ]),
          materiel: JSON.stringify(["Manuel", "Tableau", "Calculatrice"]),
          evaluation: "Quiz final + exercice d'application",
          differentiation: "Adaptation pour élèves en difficulté : exercices simplifiés",
          statut,
          proposeParId: teacher.userId,
          ajusteParId: statut !== StatutPropositionIa.PROPOSE ? teacher.userId : null,
          ajusteLe: statut !== StatutPropositionIa.PROPOSE ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          valideParId: statut === StatutPropositionIa.VALIDE ? principalId : null,
          valideLe: statut === StatutPropositionIa.VALIDE ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          motifRejet: statut === StatutPropositionIa.REJETE ? "Contenu à approfondir" : null,
          modeleIa: "gpt-4o",
          cachedIa: chance(0.3),
        },
      });
      planLeconCount++;
    }

    // 5 rubriques d'évaluation par site
    for (let i = 0; i < 5; i++) {
      const matCode = pick(["MATH", "FR", "PC", "SVT"]);
      const matiereId = ref.matieres[`${siteCode}-${matCode}`];
      if (!matiereId) continue;
      const niveau = pick(["6ème", "3ème", "2nde", "Terminale"]);
      const comps = await prisma.competence.findMany({
        where: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          chapitre: { matiereId, niveau },
        },
        take: 1,
      });
      if (comps.length === 0) continue;
      const comp = comps[0];
      const teacher = pick(teachers);
      const statut = pick([StatutPropositionIa.PROPOSE, StatutPropositionIa.AJUSTE, StatutPropositionIa.VALIDE]);

      await prisma.rubriqueEvaluation.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          competenceId: comp.id,
          niveauScolaire: niveau,
          totalPoints: 20,
          titre: `Grille d'évaluation - ${comp.libelle}`,
          criteres: JSON.stringify([
            { nom: "Maîtrise du concept", points: 5, niveaux: { excellent: "Restitue parfaitement", satisfaisant: "Restitue avec erreurs mineures", fragile: "Restitue partiellement", insuffisant: "Ne restitue pas" } },
            { nom: "Application", points: 5, niveaux: { excellent: "Applique sans erreur", satisfaisant: "Applique avec guidance", fragile: "Applique avec erreurs", insuffisant: "N'applique pas" } },
            { nom: "Raisonnement", points: 5, niveaux: { excellent: "Raisonnement complet", satisfaisant: "Raisonnement correct", fragile: "Raisonnement incomplet", insuffisant: "Pas de raisonnement" } },
            { nom: "Communication", points: 5, niveaux: { excellent: "Expression claire", satisfaisant: "Expression compréhensible", fragile: "Expression confuse", insuffisant: "Non lisible" } },
          ]),
          statut,
          proposeParId: teacher.userId,
          ajusteParId: statut !== StatutPropositionIa.PROPOSE ? teacher.userId : null,
          ajusteLe: statut !== StatutPropositionIa.PROPOSE ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          valideParId: statut === StatutPropositionIa.VALIDE ? principalId : null,
          valideLe: statut === StatutPropositionIa.VALIDE ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          modeleIa: "gpt-4o",
          cachedIa: chance(0.3),
        },
      });
      rubriqueCount++;
    }
  }
  console.log(`  ✅ PlanLecon (IA): ${planLeconCount} (workflow PROPOSE→AJUSTE→VALIDE)`);
  console.log(`  ✅ RubriqueEvaluation (IA): ${rubriqueCount}`);

  // ════════════════════════════════════════════════════════════
  // AiDecisionLog : traces de décisions IA
  // ════════════════════════════════════════════════════════════
  let aiLogCount = 0;
  const aiLogDefs = [
    { action: "evidence.classify", actorType: "AI", confidence: 0.85 },
    { action: "twin.recompute", actorType: "AI", confidence: 0.9 },
    { action: "intervention.propose", actorType: "AI", confidence: 0.75 },
    { action: "recommendation.emit", actorType: "AI", confidence: 0.8 },
    { action: "prediction.generate", actorType: "AI", confidence: 0.7 },
    { action: "pattern.detect", actorType: "AI", confidence: 0.85 },
    { action: "calibration.adjust", actorType: "AI", confidence: 0.8 },
  ];
  for (const site of ["ambouli", "arhiba"] as const) {
    for (let i = 0; i < 20; i++) {
      const logDef = pick(aiLogDefs);
      await prisma.aiDecisionLog.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          actorType: logDef.actorType,
          actorId: null,
          action: logDef.action,
          inputRef: `ref-${i}`,
          output: { result: "success", details: "Analyse effectuée" },
          confidence: logDef.confidence,
          providerName: "openai",
          modelName: "gpt-4o",
          modelVersion: "2024-08",
          promptVersion: "1.2",
          approvedBy: chance(0.5) ? users.principals[`${site}-coll`] : null,
          approvedAt: chance(0.5) ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
        },
      });
      aiLogCount++;
    }
  }
  console.log(`  ✅ AiDecisionLog: ${aiLogCount}`);

  // ════════════════════════════════════════════════════════════
  // AiCache : cache de générations
  // ════════════════════════════════════════════════════════════
  for (let i = 0; i < 5; i++) {
    await prisma.aiCache.create({
      data: {
        cacheKey: `cache-ambouli-${i}-${Date.now()}`,
        response: { generated: true, content: "Contenu généré mis en cache" },
        expiresAt: dateStr(2026, 6, 30),
      },
    });
  }
  console.log(`  ✅ AiCache: 5 entrées`);

  // ════════════════════════════════════════════════════════════
  // LearnosEvent : événements métier (outbox)
  // ════════════════════════════════════════════════════════════
  let eventCount = 0;
  const eventTypes = ["note.recorded", "evaluation.completed", "intervention.proposed", "recommendation.emitted", "prediction.generated"];
  for (const site of ["ambouli", "arhiba"] as const) {
    for (let i = 0; i < 10; i++) {
      await prisma.learnosEvent.create({
        data: {
          tenantId: ref.tenantId,
          siteId: ref.sites[site],
          eventType: pick(eventTypes),
          aggregateType: pick(["note", "evaluation", "intervention", "recommendation"]),
          aggregateId: `agg-${i}`,
          payload: { site, index: i, timestamp: Date.now() },
          processedAt: chance(0.8) ? dateStr(2025, randInt(10, 12), randInt(1, 28)) : null,
          attempts: chance(0.8) ? 1 : randInt(2, 3),
        },
      });
      eventCount++;
    }
  }
  console.log(`  ✅ LearnosEvent: ${eventCount} (outbox)`);

  // ════════════════════════════════════════════════════════════
  // AuditLog : quelques entrées d'audit
  // ════════════════════════════════════════════════════════════
  for (let i = 0; i < 10; i++) {
    await prisma.auditLog.create({
      data: {
        tenantId: ref.tenantId,
        userId: pick(users.allStaffIds),
        action: pick(["login", "view.eleve", "create.note", "update.bulletin", "view.facture"]),
        verdict: "ALLOWED",
        resource: pick(["eleve", "note", "bulletin", "facture"]),
        resourceId: `res-${i}`,
        ip: "196.200.0.1",
        userAgent: "Mozilla/5.0",
      },
    });
  }
  console.log(`  ✅ AuditLog: 10 entrées`);

  // ════════════════════════════════════════════════════════════
  // DeviceToken : tokens push pour quelques utilisateurs
  // ════════════════════════════════════════════════════════════
  for (const site of ["ambouli", "arhiba"] as const) {
    const teachers = users.teachers[site];
    for (const t of teachers.slice(0, 5)) {
      await prisma.deviceToken.create({
        data: {
          tenantId: ref.tenantId,
          userId: t.userId,
          token: `token-${t.userId}-${Date.now()}`,
          platform: pick(["IOS", "ANDROID", "ANDROID"]),
          isActive: true,
        },
      }).catch(() => {});
    }
  }
  console.log(`  ✅ DeviceToken: 10 (push notifications)`);
}
