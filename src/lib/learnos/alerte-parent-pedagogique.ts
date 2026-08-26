/**
 * EcolPro / LEARNOS — Alertes pédagogiques vers les familles
 * ===========================================================
 *
 * Ce module complète `alertes-parent.ts` (qui détecte les absences, les
 * parcours à l'arrêt et les jalons atteints) avec des signaux proprement
 * pédagogiques :
 *
 *   1. **Compétence maîtrisée** — la bonne nouvelle : l'élève a maîtrisé
 *      une compétence cette semaine.
 *   2. **Devoir en retard** — un devoir dont la date de rendu est dépassée
 *      et qui n'est pas encore rendu.
 *   3. **Chapitre non enseigné** — signal indirect à la famille : « cette
 *      semaine, le cours a porté sur X ». Jamais accusateur envers
 *      l'enseignant.
 *   4. **Élève en difficulté** — un profil d'apprentissage signale
 *      NEEDS_REVIEW sur une compétence planifiée la semaine prochaine.
 *
 * DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 *
 * La fonction ne lève JAMAIS d'exception : une erreur de lecture sur un
 * tenant renvoie un tableau vide, pas un crash du cron.
 */

import prisma from "@/lib/prisma";
import { semaineScolaire } from "@/lib/learnos/planification-pure";
import { anneeActiveId } from "@/lib/annee-scolaire";

// ------------------------------------------------------------
// Type de retour
// ------------------------------------------------------------

export interface AlertePedagogique {
  eleveId: string;
  parentId: string | null;
  niveau: "INFO" | "ATTENTION";
  cle: string;
  /** Clé de déduplication — deux détections du même fait produisent la même valeur. */
  signature: string;
  /** Message déjà traduit en français (le bot parent re-traduit si besoin). */
  message: string;
  eleveNom: string;
}

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------

/** Fenêtre de détection des compétences nouvellement maîtrisées (7 jours). */
const FENETRE_BONNE_NOUVELLE_JOURS = 7;

// ------------------------------------------------------------
// Fonction principale
// ------------------------------------------------------------

/**
 * Détecte les alertes pédagogiques pour un tenant.
 *
 * Tâche système : elle traverse tous les sites du tenant, puisqu'elle
 * n'agit pour le compte d'aucun utilisateur. L'isolation est faite à
 * l'envoi, où chaque alerte est adressée au parent rattaché à l'élève.
 *
 * @param tenantId    Le tenant à balayer.
 * @param maintenant  L'instant de référence (injectable pour les tests).
 * @returns           Les alertes détectées. Jamais `null`, jamais d'exception.
 */
export async function detecterAlertesPedagogiques(
  tenantId: string,
  maintenant: Date = new Date()
): Promise<AlertePedagogique[]> {
  try {
    const alertes = await Promise.all([
      competencesMaitrisees(tenantId, maintenant),
      devoirsEnRetard(tenantId, maintenant),
      chapitresNonEnseignes(tenantId, maintenant),
      elevesEnDifficulte(tenantId, maintenant),
    ]);

    return alertes.flat();
  } catch {
    // Une erreur non prévue dans une sous-fonction ne doit pas faire
    // planter le cron : on renvoie un tableau vide.
    return [];
  }
}

// ------------------------------------------------------------
// 1. Compétence maîtrisée — la bonne nouvelle
// ------------------------------------------------------------

/**
 * Détecte les compétences nouvellement marquées MAITRISEE (dans les 7
 * derniers jours) et notifie les parents.
 *
 * `SeanceCompetence` n'a pas de colonne `createdAt` : on utilise
 * `SeancePedagogique.updatedAt` comme proxy temporel, puisque c'est la
 * clôture de la séance qui pose le niveau.
 */
async function competencesMaitrisees(
  tenantId: string,
  maintenant: Date
): Promise<AlertePedagogique[]> {
  const depuis = new Date(
    maintenant.getTime() - FENETRE_BONNE_NOUVELLE_JOURS * 86_400_000
  );

  // Détection système : balayage tenant, pas de session utilisateur.
  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const seanceComps = await prisma.seanceCompetence.findMany({
    where: {
      niveau: "MAITRISEE",
      seance: {
        tenantId,
        updatedAt: { gte: depuis },
      },
    },
    select: {
      id: true,
      competenceId: true,
      competence: { select: { libelle: true } },
      seance: {
        select: {
          id: true,
          date: true,
          classeId: true,
          classe: { select: { id: true, nom: true } },
        },
      },
    },
  });

  if (seanceComps.length === 0) return [];

  // Pour chaque séance, récupérer les élèves de la classe et leurs parents.
  const parClasse = new Map<string, typeof seanceComps>();
  for (const sc of seanceComps) {
    const key = sc.seance.classeId;
    if (!parClasse.has(key)) parClasse.set(key, []);
    parClasse.get(key)!.push(sc);
  }

  const alertes: AlertePedagogique[] = [];

  for (const [classeId, comps] of parClasse) {
    // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        classeId,
        statut: "ACTIF",
        deletedAt: null,
      },
      select: { id: true, prenom: true, nom: true },
    });

    const parents = await parentsDEleves(tenantId, eleves.map((e) => e.id));
    const parentParEleve = new Map(parents.map((p) => [p.eleveId, p]));

    for (const sc of comps) {
      for (const eleve of eleves) {
        const parent = parentParEleve.get(eleve.id);
        alertes.push({
          eleveId: eleve.id,
          parentId: parent?.parentId ?? null,
          niveau: "INFO",
          cle: "competence_maitrisee",
          signature: `competence_maitrisee|${eleve.id}|${sc.competenceId}|${sc.seance.id}`,
          message: `${eleve.prenom} a maîtrisé la compétence « ${sc.competence.libelle} » lors de la séance du ${new Date(sc.seance.date).toLocaleDateString("fr-FR")}. Félicitations !`,
          eleveNom: `${eleve.prenom} ${eleve.nom}`,
        });
      }
    }
  }

  return alertes;
}

// ------------------------------------------------------------
// 2. Devoir en retard
// ------------------------------------------------------------

/**
 * Détecte les devoirs dont la date de rendu est dépassée et qui ne sont
 * pas encore rendus (statut A_FAIRE ou EN_COURS). Notifie les parents
 * des élèves de la classe concernée.
 */
async function devoirsEnRetard(
  tenantId: string,
  maintenant: Date
): Promise<AlertePedagogique[]> {
  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const devoirs = await prisma.devoir.findMany({
    where: {
      tenantId,
      dateRendu: { lt: maintenant },
      statut: { in: ["A_FAIRE", "EN_COURS"] },
    },
    select: {
      id: true,
      titre: true,
      dateRendu: true,
      classeId: true,
      matiere: { select: { nom: true } },
    },
  });

  if (devoirs.length === 0) return [];

  const alertes: AlertePedagogique[] = [];

  for (const devoir of devoirs) {
    // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        classeId: devoir.classeId,
        statut: "ACTIF",
        deletedAt: null,
      },
      select: { id: true, prenom: true, nom: true },
    });

    const parents = await parentsDEleves(tenantId, eleves.map((e) => e.id));
    const parentParEleve = new Map(parents.map((p) => [p.eleveId, p]));

    for (const eleve of eleves) {
      const parent = parentParEleve.get(eleve.id);
      const dateStr = new Date(devoir.dateRendu).toLocaleDateString("fr-FR");
      alertes.push({
        eleveId: eleve.id,
        parentId: parent?.parentId ?? null,
        niveau: "ATTENTION",
        cle: "devoir_retard",
        signature: `devoir_retard|${eleve.id}|${devoir.id}`,
        message: `Le devoir « ${devoir.titre} » en ${devoir.matiere.nom} devait être rendu le ${dateStr}. Merci d'accompagner ${eleve.prenom} pour sa réalisation.`,
        eleveNom: `${eleve.prenom} ${eleve.nom}`,
      });
    }
  }

  return alertes;
}

// ------------------------------------------------------------
// 3. Chapitre non enseigné — signal indirect à la famille
// ------------------------------------------------------------

/**
 * Détecte les chapitres dont la semaine de fin est dépassée et qui sont
 * toujours en statut "PREVU". Le message à la famille n'est JAMAIS
 * accusateur envers l'enseignant : il indique ce sur quoi le cours a
 * porté, sans pointer un retard.
 */
async function chapitresNonEnseignes(
  tenantId: string,
  maintenant: Date
): Promise<AlertePedagogique[]> {
  const anneeId = await anneeActiveId(tenantId);
  if (!anneeId) return [];
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { id: true, dateDebut: true },
  });
  if (!annee) return [];

  const semaineCourante = semaineScolaire(maintenant, annee.dateDebut);

  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const planifications = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId: annee.id,
      statut: "PREVU",
      semaineFin: { lt: semaineCourante },
    },
    select: {
      id: true,
      chapitreId: true,
      classeId: true,
      chapitre: {
        select: {
          nom: true,
          niveau: true,
          matiere: { select: { nom: true } },
          competences: { select: { libelle: true }, take: 3 },
        },
      },
    },
  });

  if (planifications.length === 0) return [];

  const alertes: AlertePedagogique[] = [];

  for (const plan of planifications) {
    // Si classeId est null, la planification s'applique à toutes les classes
    // du niveau — on notifie tous les élèves du niveau correspondant.
    // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...(plan.classeId
          ? { classeId: plan.classeId }
          : { classe: { niveau: plan.chapitre.niveau } }),
      },
      select: { id: true, prenom: true, nom: true },
    });

    const parents = await parentsDEleves(tenantId, eleves.map((e) => e.id));
    const parentParEleve = new Map(parents.map((p) => [p.eleveId, p]));

    const competencesStr = plan.chapitre.competences
      .map((c) => c.libelle)
      .join(", ");

    for (const eleve of eleves) {
      const parent = parentParEleve.get(eleve.id);
      alertes.push({
        eleveId: eleve.id,
        parentId: parent?.parentId ?? null,
        niveau: "INFO",
        cle: "chapitre_non_enseigne",
        signature: `chapitre_non_enseigne|${eleve.id}|${plan.id}`,
        message:
          `Cette semaine en ${plan.chapitre.matiere.nom}, le cours porte sur ` +
          `« ${plan.chapitre.nom} »${competencesStr ? ` (${competencesStr})` : ""}. ` +
          `N'hésitez pas à échanger avec ${eleve.prenom} sur ce sujet à la maison.`,
        eleveNom: `${eleve.prenom} ${eleve.nom}`,
      });
    }
  }

  return alertes;
}

// ------------------------------------------------------------
// 4. Élève en difficulté sur une compétence planifiée
// ------------------------------------------------------------

/**
 * Détecte les élèves dont le profil d'apprentissage signale
 * NEEDS_REVIEW sur une compétence qui est planifiée pour la semaine
 * prochaine. Le message indique que des exercices de révision ont été
 * assignés.
 */
async function elevesEnDifficulte(
  tenantId: string,
  maintenant: Date
): Promise<AlertePedagogique[]> {
  const anneeId = await anneeActiveId(tenantId);
  if (!anneeId) return [];
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { id: true, dateDebut: true },
  });
  if (!annee) return [];

  const semaineCourante = semaineScolaire(maintenant, annee.dateDebut);
  const semaineProchaine = semaineCourante + 1;

  // Compétences planifiées pour la semaine prochaine.
  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const planComps = await prisma.planificationCompetence.findMany({
    where: {
      tenantId,
      anneeId: annee.id,
      statut: "PREVU",
      semaineDebut: { lte: semaineProchaine },
      semaineFin: { gte: semaineProchaine },
    },
    select: {
      competenceId: true,
      competence: { select: { libelle: true } },
    },
  });

  if (planComps.length === 0) return [];

  const competenceIds = planComps.map((p) => p.competenceId);
  const compLibelle = new Map(planComps.map((p) => [p.competenceId, p.competence.libelle]));

  // Profils d'élèves en NEEDS_REVIEW sur ces compétences.
  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      masteryStatus: "NEEDS_REVIEW",
      competenceId: { in: competenceIds },
    },
    select: {
      eleveId: true,
      competenceId: true,
    },
  });

  if (profils.length === 0) return [];

  const eleveIds = [...new Set(profils.map((p) => p.eleveId))];

  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      id: { in: eleveIds },
      statut: "ACTIF",
      deletedAt: null,
    },
    select: { id: true, prenom: true, nom: true },
  });

  const parents = await parentsDEleves(tenantId, eleveIds);
  const parentParEleve = new Map(parents.map((p) => [p.eleveId, p]));
  const eleveParId = new Map(eleves.map((e) => [e.id, e]));

  const alertes: AlertePedagogique[] = [];

  for (const profil of profils) {
    const eleve = eleveParId.get(profil.eleveId);
    if (!eleve) continue;

    const parent = parentParEleve.get(profil.eleveId);
    const libelle = compLibelle.get(profil.competenceId) ?? profil.competenceId;

    alertes.push({
      eleveId: eleve.id,
      parentId: parent?.parentId ?? null,
      niveau: "ATTENTION",
      cle: "eleve_difficulte",
      signature: `eleve_difficulte|${eleve.id}|${profil.competenceId}|${semaineProchaine}`,
      message:
        `Des exercices de révision ont été assignés à ${eleve.prenom} sur ` +
        `« ${libelle} », une compétence qui sera travaillée la semaine prochaine. ` +
        `Encouragez-le à les réaliser.`,
      eleveNom: `${eleve.prenom} ${eleve.nom}`,
    });
  }

  return alertes;
}

// ------------------------------------------------------------
// Utilitaire : parents d'un ensemble d'élèves
// ------------------------------------------------------------

interface ParentCible {
  eleveId: string;
  parentId: string;
  prenom: string;
}

/**
 * Retourne le tuteur légal principal (isGardien) pour chaque élève, ou le
 * premier parent trouvé à défaut. Même logique que `gardiensDe` dans
 * `alertes-parent.ts`.
 */
async function parentsDEleves(
  tenantId: string,
  eleveIds: string[]
): Promise<ParentCible[]> {
  if (eleveIds.length === 0) return [];

  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire
  const liens = await prisma.eleveParent.findMany({
    where: {
      eleveId: { in: [...new Set(eleveIds)] },
      parent: { tenantId },
      eleve: { tenantId, statut: "ACTIF", deletedAt: null },
    },
    select: {
      eleveId: true,
      parentId: true,
      isGardien: true,
      eleve: { select: { prenom: true } },
    },
  });

  const parEleve = new Map<string, typeof liens>();
  for (const l of liens) {
    if (!parEleve.has(l.eleveId)) parEleve.set(l.eleveId, []);
    parEleve.get(l.eleveId)!.push(l);
  }

  const resultats: ParentCible[] = [];
  for (const [eleveId, candidats] of parEleve) {
    const gardien = candidats.find((c) => c.isGardien) ?? candidats[0];
    if (!gardien) continue;
    resultats.push({
      eleveId,
      parentId: gardien.parentId,
      prenom: gardien.eleve.prenom,
    });
  }

  return resultats;
}
