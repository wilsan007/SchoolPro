/**
 * EcolPro / LEARNOS — Tableau de bord enseignant (avant-séance)
 * =============================================================
 *
 * Avant d'entrer en classe, l'enseignant a besoin d'une vue consolidée :
 *   - Où en est la planification pour ce chapitre ?
 *   - Quels élèves sont prédits en difficulté, et sur quels prérequis ?
 *   - Que disent les cohortes précédentes (pattern historique) ?
 *   - Y a-t-il un plan de leçon proposé par l'IA qu'il peut accepter,
 *     ajuster ou refuser ?
 *   - Quels exercices de remédiation servir aux élèves fragiles ?
 *
 * Ce module agrège ces signaux en une seule structure, prête à afficher.
 * Il ne prend AUCUNE décision à la place de l'enseignant : il rend visibles
 * les informations qui existent déjà dans le système.
 *
 * DÉTERMINISTE — aucun appel de modèle ici. La prédiction et la sélection
 * d'exercices sont déléguées à leurs modules respectifs.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { predirePourChapitre } from "@/lib/learnos/prediction-engine";
import { proposerPlanLecon, type PlanLeconPropose } from "@/lib/learnos/plan-lecon";
import { ciblesPourEleve, type CibleExercice } from "@/lib/learnos/exercice-selector";
import type { PalierExercice } from "@prisma/client";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Type de retour
// ------------------------------------------------------------

export interface TableauBordSeance {
  seance: {
    id: string;
    date: string;
    dureePrevue: number;
    classeNom: string;
    matiereNom: string;
    chapitreNom: string;
  };
  planification: {
    statut: string;
    semaineDebut: number;
    semaineFin: number;
    heuresPrevues: number | null;
  } | null;
  competencesPrevues: { code: string; libelle: string; statut: string }[];
  prediction: {
    elevesEnDifficulte: number;
    totalEleves: number;
    prerequisManquants: { competence: string; eleves: number }[];
  } | null;
  patternHistorique: { moyenneHistorique: number; tauxEchec: number } | null;
  planLecon: {
    titre: string;
    objectifs: string[];
    etapes: { nom: string; duree: number; description: string; support?: string }[];
    materiel: string[];
    differentiation: string | null;
    statut: string;
  } | null;
  exercicesRemediation: {
    eleveId: string;
    eleveNom: string;
    competence: string;
    palier: PalierExercice;
  }[];
}

// ------------------------------------------------------------
// Fonction principale
// ------------------------------------------------------------

/**
 * Agrège toutes les informations nécessaires avant d'entrer en classe.
 *
 * @param tenantId  Le tenant.
 * @param claims    Les claims de l'appelant (pour le périmètre site).
 * @param seanceId  La séance pédagogique concernée.
 */
export async function tableauBordSeance(
  tenantId: string,
  claims: SessionSiteClaims,
  seanceId: string,
  anneeCourante?: string | null
): Promise<TableauBordSeance | null> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  // 1. Charger la séance avec classe, matière, chapitre et compétences.
  const seance = await prisma.seancePedagogique.findFirst({
    where: { id: seanceId, tenantId, ...(annee ? { classe: { annee: annee } } : {}), ...siteFilterForModel("seancePedagogique", claims) },
    select: {
      id: true,
      date: true,
      dureePrevue: true,
      classe: { select: { id: true, nom: true, niveau: true } },
      matiere: { select: { id: true, nom: true } },
      chapitre: {
        select: {
          id: true,
          nom: true,
          niveau: true,
          matiereId: true,
          competences: {
            select: {
              id: true,
              code: true,
              libelle: true,
              prerequis: { select: { id: true, code: true, libelle: true } },
            },
          },
        },
      },
      planificationId: true,
    },
  });

  if (!seance) return null;

  const chapitre = seance.chapitre;
  const competenceIds = chapitre?.competences.map((c) => c.id) ?? [];

  // 2. Planification du chapitre pour cette classe.
  let planification: TableauBordSeance["planification"] = null;
  if (chapitre && seance.planificationId) {
    const plan = await prisma.planificationChapitre.findFirst({
      where: {
        id: seance.planificationId,
        tenantId,
        ...siteFilterForModel("planificationChapitre", claims),
      },
      select: {
        statut: true,
        semaineDebut: true,
        semaineFin: true,
        heuresPrevues: true,
      },
    });
    if (plan) {
      planification = {
        statut: plan.statut,
        semaineDebut: plan.semaineDebut,
        semaineFin: plan.semaineFin,
        heuresPrevues: plan.heuresPrevues,
      };
    }
  }

  // 3. Compétences prévues avec leur statut de planification.
  let competencesPrevues: TableauBordSeance["competencesPrevues"] = [];
  if (chapitre && competenceIds.length > 0) {
    const planComps = await prisma.planificationCompetence.findMany({
      where: {
        tenantId,
        competenceId: { in: competenceIds },
        ...siteFilterForModel("planificationCompetence", claims),
      },
      select: { competenceId: true, statut: true },
    });
    const planCompMap = new Map(planComps.map((p) => [p.competenceId, p.statut]));
    competencesPrevues = chapitre.competences.map((c) => ({
      code: c.code,
      libelle: c.libelle,
      statut: planCompMap.get(c.id) ?? "PREVU",
    }));
  }

  // 4. Prédiction : appeler le moteur de prédiction pour ce chapitre.
  let prediction: TableauBordSeance["prediction"] = null;
  if (chapitre) {
    const anneeId = await anneeActiveId(tenantId);
    const annee = anneeId ? { id: anneeId } : null;
    if (annee) {
      try {
        const resultat = await predirePourChapitre(
          tenantId,
          claims,
          chapitre.id,
          annee.id
        );

        // Compter les élèves en difficulté (MODERE, DIFFICILE ou CRITIQUE).
        const elevesIds = new Set(resultat.predictions.map((p) => p.eleveId));
        const enDifficulte = new Set(
          resultat.predictions
            .filter(
              (p) =>
                p.difficultePredite === "DIFFICILE" ||
                p.difficultePredite === "CRITIQUE"
            )
            .map((p) => p.eleveId)
        );

        // Agréger les prérequis manquants par compétence.
        const prereqMap = new Map<string, Set<string>>();
        for (const p of resultat.predictions) {
          if (p.prerequisManquants > 0) {
            // Retrouver le libellé de la compétence visée.
            const comp = chapitre.competences.find((c) => c.id === p.competenceId);
            const libelle = comp?.libelle ?? p.competenceId;
            if (!prereqMap.has(libelle)) prereqMap.set(libelle, new Set());
            if (p.prerequisManquants > 0) {
              prereqMap.get(libelle)!.add(p.eleveId);
            }
          }
        }

        prediction = {
          elevesEnDifficulte: enDifficulte.size,
          totalEleves: elevesIds.size,
          prerequisManquants: [...prereqMap.entries()].map(([competence, eleves]) => ({
            competence,
            eleves: eleves.size,
          })),
        };
      } catch {
        // La prédiction peut échouer (pas d'élèves, pas de chapitre, etc.).
        // On ne bloque pas le tableau de bord pour autant.
        prediction = null;
      }
    }
  }

  // 5. Pattern historique pour cette matière × niveau.
  let patternHistorique: TableauBordSeance["patternHistorique"] = null;
  if (chapitre) {
    const patterns = await prisma.patternPedagogique.findMany({
      where: {
        tenantId,
        niveau: chapitre.niveau,
        matiereId: chapitre.matiereId,
        ...siteFilterForModel("patternPedagogique", claims),
      },
      select: { masteryMoyenne: true, tauxEchec: true, effectif: true },
    });
    if (patterns.length > 0) {
      // Moyenne pondérée par l'effectif.
      const totalEffectif = patterns.reduce((s, p) => s + p.effectif, 0);
      const moyenne =
        totalEffectif > 0
          ? patterns.reduce((s, p) => s + p.masteryMoyenne * p.effectif, 0) /
            totalEffectif
          : patterns.reduce((s, p) => s + p.masteryMoyenne, 0) / patterns.length;
      const tauxEchec =
        totalEffectif > 0
          ? patterns.reduce((s, p) => s + p.tauxEchec * p.effectif, 0) / totalEffectif
          : patterns.reduce((s, p) => s + p.tauxEchec, 0) / patterns.length;
      patternHistorique = {
        moyenneHistorique: Math.round(moyenne * 100) / 100,
        tauxEchec: Math.round(tauxEchec * 100) / 100,
      };
    }
  }

  // 6. Plan de leçon : chercher un PlanLecon existant pour la première
  //    compétence du chapitre, sinon proposer d'en générer un.
  let planLecon: TableauBordSeance["planLecon"] = null;
  if (chapitre && chapitre.competences.length > 0) {
    const premiereComp = chapitre.competences[0];
    const existant = await prisma.planLecon.findFirst({
      where: {
        tenantId,
        competenceId: premiereComp.id,
        ...siteFilterForModel("planLecon", claims),
        statut: { in: ["PROPOSE", "AJUSTE", "VALIDE"] },
      },
      select: {
        id: true,
        titre: true,
        objectifs: true,
        etapes: true,
        materiel: true,
        differentiation: true,
        statut: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existant) {
      try {
        planLecon = {
          titre: existant.titre,
          objectifs: JSON.parse(existant.objectifs) as string[],
          etapes: JSON.parse(existant.etapes) as {
            nom: string;
            duree: number;
            description: string;
            support?: string;
          }[],
          materiel: existant.materiel ? (JSON.parse(existant.materiel) as string[]) : [],
          differentiation: existant.differentiation ?? null,
          statut: existant.statut,
        };
      } catch {
        planLecon = null;
      }
    }
  }

  // 7. Exercices de remédiation pour les élèves en difficulté.
  const exercicesRemediation: TableauBordSeance["exercicesRemediation"] = [];
  if (chapitre && seance.classe) {
    // Charger les élèves de la classe.
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        classeId: seance.classe.id,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
      },
      select: { id: true, prenom: true, nom: true },
    });

    const anneeId = await anneeActiveId(tenantId);
    const annee = anneeId ? { id: anneeId } : null;

    if (annee && eleves.length > 0) {
      // Pour chaque élève, récupérer les cibles d'exercices.
      for (const eleve of eleves) {
        try {
          const cibles = await ciblesPourEleve(
            tenantId,
            eleve.id,
            claims,
            {
              anneeId: annee.id,
              matiereId: chapitre.matiereId,
              nombre: 3,
            }
          );
          for (const cible of cibles) {
            // Retrouver le libellé de la compétence.
            const comp = chapitre.competences.find((c) => c.id === cible.competenceId);
            const libelle = comp?.libelle ?? cible.competenceId;
            exercicesRemediation.push({
              eleveId: eleve.id,
              eleveNom: `${eleve.prenom} ${eleve.nom}`,
              competence: libelle,
              palier: cible.palier,
            });
          }
        } catch {
          // Un élève sans profil ou sans contexte ne bloque pas les autres.
        }
      }
    }
  }

  return {
    seance: {
      id: seance.id,
      date: seance.date.toISOString(),
      dureePrevue: seance.dureePrevue,
      classeNom: seance.classe.nom,
      matiereNom: seance.matiere.nom,
      chapitreNom: chapitre?.nom ?? "—",
    },
    planification,
    competencesPrevues,
    prediction,
    patternHistorique,
    planLecon,
    exercicesRemediation,
  };
}

// ------------------------------------------------------------
// Génération de plan de leçon (exposé pour l'UI)
// ------------------------------------------------------------

/**
 * Génère un plan de leçon pour la première compétence du chapitre d'une séance.
 *
 * Exposé pour que l'UI puisse déclencher la génération à la demande, plutôt que
 * systématiquement au chargement du tableau de bord (coût d'un appel IA).
 */
export async function genererPlanLeconPourSeance(
  tenantId: string,
  claims: SessionSiteClaims,
  seanceId: string,
  actorId: string,
  anneeCourante?: string | null
): Promise<PlanLeconPropose | null> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const seance = await prisma.seancePedagogique.findFirst({
    where: { id: seanceId, tenantId, ...(annee ? { classe: { annee: annee } } : {}), ...siteFilterForModel("seancePedagogique", claims) },
    select: {
      dureePrevue: true,
      classe: { select: { id: true, nom: true, niveau: true } },
      chapitre: {
        select: {
          id: true,
          nom: true,
          niveau: true,
          competences: { select: { id: true, libelle: true } },
        },
      },
    },
  });

  if (!seance?.chapitre || seance.chapitre.competences.length === 0) return null;

  const premiereComp = seance.chapitre.competences[0];

  // Compter l'effectif de la classe pour la differentiation.
  const effectif = await prisma.eleve.count({
    where: {
      tenantId,
      classeId: seance.classe.id,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
  });

  return proposerPlanLecon(tenantId, claims, {
    competenceId: premiereComp.id,
    niveauScolaire: seance.chapitre.niveau,
    dureeSouhaitee: seance.dureePrevue,
    effectif,
  }, actorId);
}

// ------------------------------------------------------------
// Génération d'exercices de remédiation (exposé pour l'UI)
// ------------------------------------------------------------

/**
 * Récupère les cibles d'exercices de remédiation pour un élève donné,
 * dans le contexte du chapitre de la séance.
 */
export async function exercicesRemediationPourEleve(
  tenantId: string,
  claims: SessionSiteClaims,
  seanceId: string,
  eleveId: string,
  anneeCourante?: string | null
): Promise<CibleExercice[]> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const seance = await prisma.seancePedagogique.findFirst({
    where: { id: seanceId, tenantId, ...(annee ? { classe: { annee: annee } } : {}), ...siteFilterForModel("seancePedagogique", claims) },
    select: {
      chapitre: { select: { matiereId: true } },
    },
  });

  if (!seance?.chapitre) return [];

  const anneeId = await anneeActiveId(tenantId);

  if (!anneeId) return [];

  return ciblesPourEleve(tenantId, eleveId, claims, {
    anneeId,
    matiereId: seance.chapitre.matiereId,
    nombre: 5,
  });
}
