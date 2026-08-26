/**
 * Recalcule les LearningEvidence et StudentLearningProfile à partir des VRAIES notes.
 *
 * Le seed initial (seed-ambouli-learnos-apprentissage.ts) générait des evidences
 * avec des masteryScore aléatoires (gauss(0.55, 0.2)), déconnectés des notes
 * réelles. Ce script corrige en :
 *  1. Supprimant les anciennes evidences et profils (avec compétence)
 *  2. Pour chaque note avec evaluationId, trouvant les EvaluationCompetence
 *  3. Calculant le masterySignal = valeur / noteMax (via la même logique que l'evidence-engine)
 *  4. Recréant les LearningEvidence
 *  5. Recalculant les StudentLearningProfile avec le learning-twin
 *
 * Usage : node scripts/recalculer-evidences-depuis-notes.mjs
 */

import { PrismaClient, EvidenceType, ErrorType } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

// ── Constantes (synchronisées avec evidence-engine.ts et learning-twin.ts) ──

const FIABILITE_PAR_TYPE = {
  EXAMEN: 0.9,
  PROJET: 0.8,
  DEVOIR: 0.75,
  EXERCICE: 0.6,
  RETEST: 0.6,
  ORAL: 0.5,
  QUIZ: 0.4,
  OBSERVATION: 0.3,
  AUTO_ENTRAINEMENT: 0.2,
};

function facteurBareme(noteMax) {
  if (noteMax >= 20) return 1;
  if (noteMax >= 10) return 0.9;
  if (noteMax >= 5) return 0.8;
  return 0.7;
}

function evidenceTypeFromNote(type) {
  switch (type) {
    case "EXAMEN": return "EXAMEN";
    case "CONTROLE":
    case "DEVOIR": return "DEVOIR";
    case "INTERROGATION": return "QUIZ";
    case "PROJET": return "PROJET";
    case "ORAL": return "ORAL";
    case "TP": return "EXERCICE";
    default: return "DEVOIR";
  }
}

function calculerSignal({ valeur, noteMax, coefficient, evidenceType }) {
  if (!Number.isFinite(noteMax) || noteMax <= 0) {
    return { masterySignal: 0, confidence: 0, weight: 0 };
  }
  const brut = valeur / noteMax;
  const masterySignal = Math.min(1, Math.max(0, brut));
  const confidence = Math.min(1, FIABILITE_PAR_TYPE[evidenceType] * facteurBareme(noteMax));
  const weight = Math.min(10, Math.max(0, coefficient || 1));
  return { masterySignal, confidence, weight };
}

function evidenceId(sourceType, sourceId, competenceId) {
  return createHash("sha256")
    .update(`${sourceType}|${sourceId}|${competenceId ?? ""}`)
    .digest("hex")
    .slice(0, 24);
}

// ── Learning twin (simplifié) ──

const DEMI_VIE_JOURS = 90;
const SATURATION_CONFIANCE = 2.5;
const CONFIANCE_MINIMALE = 0.5;
const PREUVES_MIN_TENDANCE = 4;
const SEUIL_TENDANCE = 0.08;
const SEUILS_MAITRISE = { emergent: 0.35, enDeveloppement: 0.55, acquis: 0.8 };

const TYPES_NON_SUPERVISES = new Set(["AUTO_ENTRAINEMENT"]);
function estSupervisee(type) { return !TYPES_NON_SUPERVISES.has(type); }

function poidsRecence(date, maintenant) {
  const jours = (maintenant.getTime() - date.getTime()) / 86400000;
  if (jours <= 0) return 1;
  return Math.pow(0.5, jours / DEMI_VIE_JOURS);
}

function calculerTendance(preuvesTriees) {
  if (preuvesTriees.length < PREUVES_MIN_TENDANCE) return "indetermine";
  const milieu = Math.floor(preuvesTriees.length / 2);
  const anciennes = preuvesTriees.slice(0, milieu);
  const recentes = preuvesTriees.slice(milieu);
  const moyenne = (liste) => {
    const total = liste.reduce((s, p) => s + p.weight * p.confidence, 0);
    if (total <= 0) return null;
    return liste.reduce((s, p) => s + p.masterySignal * p.weight * p.confidence, 0) / total;
  };
  const avant = moyenne(anciennes);
  const apres = moyenne(recentes);
  if (avant === null || apres === null) return "indetermine";
  const ecart = apres - avant;
  if (ecart > SEUIL_TENDANCE) return "hausse";
  if (ecart < -SEUIL_TENDANCE) return "baisse";
  return "stable";
}

function statutDeMaitrise(masteryScore, confidenceScore, trend, auMoinsUnePreuveSupervisee = true) {
  if (confidenceScore < CONFIANCE_MINIMALE) return "UNKNOWN";
  if (masteryScore >= SEUILS_MAITRISE.enDeveloppement && trend === "baisse") return "NEEDS_REVIEW";
  if (masteryScore >= SEUILS_MAITRISE.acquis) return auMoinsUnePreuveSupervisee ? "MASTERED" : "PROFICIENT";
  if (masteryScore >= SEUILS_MAITRISE.enDeveloppement) return "PROFICIENT";
  if (masteryScore >= SEUILS_MAITRISE.emergent) return "DEVELOPING";
  return "EMERGING";
}

function calculerProfil(preuves, maintenant = new Date()) {
  if (preuves.length === 0) {
    return { masteryScore: 0, confidenceScore: 0, masteryStatus: "UNKNOWN", evidenceCount: 0, lastEvidenceAt: null, trend: "indetermine" };
  }
  const triees = [...preuves].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const poids = triees.map((p) => p.weight * p.confidence * poidsRecence(p.occurredAt, maintenant));
  const poidsTotal = poids.reduce((s, w) => s + w, 0);
  if (poidsTotal <= 0) {
    return { masteryScore: 0, confidenceScore: 0, masteryStatus: "UNKNOWN", evidenceCount: triees.length, lastEvidenceAt: triees[triees.length - 1].occurredAt, trend: "indetermine" };
  }
  const masteryScore = triees.reduce((s, p, i) => s + p.masterySignal * poids[i], 0) / poidsTotal;
  const confidenceScore = 1 - Math.exp(-poidsTotal / SATURATION_CONFIANCE);
  const trend = calculerTendance(triees);
  const supervisee = triees.some((p, i) => p.supervisee !== false && poids[i] > 0);
  return {
    masteryScore,
    confidenceScore,
    masteryStatus: statutDeMaitrise(masteryScore, confidenceScore, trend, supervisee),
    evidenceCount: triees.length,
    lastEvidenceAt: triees[triees.length - 1].occurredAt,
    trend,
  };
}

// ── Script principal ──

async function main() {
  const maintenant = new Date();
  console.log("=== Recalcul des evidences depuis les vraies notes ===");
  console.log(`Date de référence: ${maintenant.toISOString()}`);

  // 1. Supprimer les anciennes evidences AVEC compétence (celles du seed aléatoire)
  console.log("\n1. Suppression des anciennes evidences avec compétence...");
  const deletedEvidences = await prisma.learningEvidence.deleteMany({
    where: { competenceId: { not: null } },
  });
  console.log(`   ${deletedEvidences.count} evidences supprimées`);

  // 2. Supprimer les anciens profils
  console.log("2. Suppression des anciens profils...");
  const deletedProfils = await prisma.studentLearningProfile.deleteMany({});
  console.log(`   ${deletedProfils.count} profils supprimés`);

  // 3. Récupérer toutes les notes avec evaluationId, groupées par évaluation
  console.log("\n3. Récupération des notes et rattachements...");

  // D'abord, récupérer tous les rattachements EvaluationCompetence, groupés par evaluationId
  const rattachements = await prisma.evaluationCompetence.findMany({
    select: { evaluationId: true, competenceId: true, poids: true },
  });
  const rattachementsParEval = new Map();
  for (const r of rattachements) {
    if (!rattachementsParEval.has(r.evaluationId)) {
      rattachementsParEval.set(r.evaluationId, []);
    }
    rattachementsParEval.get(r.evaluationId).push({ competenceId: r.competenceId, poids: r.poids });
  }
  console.log(`   ${rattachementsParEval.size} évaluations avec rattachements`);

  // 4. Récupérer toutes les notes avec evaluationId
  const notes = await prisma.note.findMany({
    where: { evaluationId: { not: null } },
    select: {
      id: true, valeur: true, noteMax: true, coefficient: true, type: true,
      date: true, evaluationId: true, matiereId: true, eleveId: true, classeId: true, tenantId: true,
    },
  });
  console.log(`   ${notes.length} notes avec evaluationId`);

  // 5. Créer les evidences
  console.log("\n4. Création des evidences...");
  let evidenceCount = 0;
  let notesSansRattachement = 0;

  // Grouper par (eleveId, competenceId) pour le recalcul des profils
  const profilsACalculer = new Map(); // key: `${eleveId}:${competenceId}` → { eleveId, competenceId, tenantId, preuves: [] }

  // Traiter par batches pour éviter la surcharge mémoire
  const BATCH_SIZE = 5000;
  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    const batch = notes.slice(i, i + BATCH_SIZE);
    const evidencesACreer = [];

    for (const note of batch) {
      const rattachements = rattachementsParEval.get(note.evaluationId);
      if (!rattachements || rattachements.length === 0) {
        notesSansRattachement++;
        continue;
      }

      const evidenceType = evidenceTypeFromNote(note.type);
      const signal = calculerSignal({
        valeur: note.valeur,
        noteMax: note.noteMax,
        coefficient: note.coefficient,
        evidenceType,
      });

      for (const rattachement of rattachements) {
        const id = evidenceId("note", note.id, rattachement.competenceId);
        const weight = signal.weight * rattachement.poids;

        evidencesACreer.push({
          id,
          tenantId: note.tenantId,
          eleveId: note.eleveId,
          competenceId: rattachement.competenceId,
          matiereId: note.matiereId,
          sourceType: "note",
          sourceId: note.id,
          noteId: note.id,
          evaluationId: note.evaluationId,
          evidenceType,
          rawScore: note.valeur,
          maxScore: note.noteMax,
          occurredAt: note.date,
          masterySignal: signal.masterySignal,
          confidence: signal.confidence,
          weight,
          errorType: null,
          errorConfidence: null,
          metadata: { typeNote: note.type, coefficient: note.coefficient, poidsCompetence: rattachement.poids },
        });

        // Accumuler pour le profil
        const key = `${note.eleveId}:${rattachement.competenceId}`;
        if (!profilsACalculer.has(key)) {
          profilsACalculer.set(key, { eleveId: note.eleveId, competenceId: rattachement.competenceId, tenantId: note.tenantId, preuves: [] });
        }
        profilsACalculer.get(key).preuves.push({
          masterySignal: signal.masterySignal,
          confidence: signal.confidence,
          weight,
          occurredAt: new Date(note.date),
          supervisee: estSupervisee(evidenceType),
        });
      }
    }

    // Créer les evidences par batch avec createMany
    if (evidencesACreer.length > 0) {
      await prisma.learningEvidence.createMany({
        data: evidencesACreer,
        skipDuplicates: true,
      });
      evidenceCount += evidencesACreer.length;
    }

    if (i % 20000 === 0 || i + BATCH_SIZE >= notes.length) {
      console.log(`   ${Math.min(i + BATCH_SIZE, notes.length)}/${notes.length} notes traitées, ${evidenceCount} evidences créées`);
    }
  }

  console.log(`\n   Total: ${evidenceCount} evidences créées`);
  console.log(`   Notes sans rattachement (ignorées): ${notesSansRattachement}`);

  // 6. Récupérer les siteId des élèves
  console.log("\n5. Récupération des siteId des élèves...");
  const eleveIds = new Set([...profilsACalculer.values()].map((p) => p.eleveId));
  const eleves = await prisma.eleve.findMany({
    where: { id: { in: [...eleveIds] } },
    select: { id: true, siteId: true },
  });
  const siteParEleve = new Map(eleves.map((e) => [e.id, e.siteId]));

  // 7. Calculer et créer les profils
  console.log(`\n6. Calcul de ${profilsACalculer.size} profils...`);
  let profilCount = 0;
  const PROFIL_BATCH = 2000;
  const profilsList = [...profilsACalculer.values()];

  for (let i = 0; i < profilsList.length; i += PROFIL_BATCH) {
    const batch = profilsList.slice(i, i + PROFIL_BATCH);
    const profilsACreer = [];

    for (const entry of batch) {
      const profil = calculerProfil(entry.preuves, maintenant);
      profilsACreer.push({
        tenantId: entry.tenantId,
        siteId: siteParEleve.get(entry.eleveId) ?? null,
        eleveId: entry.eleveId,
        competenceId: entry.competenceId,
        masteryScore: profil.masteryScore,
        confidenceScore: profil.confidenceScore,
        masteryStatus: profil.masteryStatus,
        evidenceCount: profil.evidenceCount,
        lastEvidenceAt: profil.lastEvidenceAt,
        trend: profil.trend,
        computedAt: maintenant,
      });
    }

    await prisma.studentLearningProfile.createMany({
      data: profilsACreer,
      skipDuplicates: true,
    });
    profilCount += profilsACreer.length;

    if (i % 10000 === 0 || i + PROFIL_BATCH >= profilsList.length) {
      console.log(`   ${Math.min(i + PROFIL_BATCH, profilsList.length)}/${profilsList.length} profils calculés`);
    }
  }

  console.log(`\n   Total: ${profilCount} profils créés`);

  // 8. Statistiques finales
  const stats = await prisma.studentLearningProfile.groupBy({
    by: ["masteryStatus"],
    _count: true,
  });
  console.log("\n=== STATISTIQUES FINALES ===");
  for (const s of stats) {
    console.log(`   ${s.masteryStatus}: ${s._count}`);
  }

  const avgMastery = await prisma.studentLearningProfile.aggregate({
    _avg: { masteryScore: true },
  });
  console.log(`   Mastery moyenne: ${((avgMastery._avg.masteryScore || 0) * 100).toFixed(1)}%`);

  console.log("\n✓ Recalcul terminé");
}

main()
  .catch((e) => {
    console.error("Erreur:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
