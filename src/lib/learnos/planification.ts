/**
 * EcolPro / LEARNOS — Alertes anticipatives (accès base)
 * ======================================================
 *
 * Les calculs purs (frise, trous, décalages, écarts) vivent dans
 * `planification-pure.ts` : ils sont utilisés par l'écran côté navigateur, qui
 * ne doit pas embarquer Prisma. Ce module les réexporte, de sorte que le code
 * serveur importe un seul point d'entrée.
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { SEUILS_MAITRISE } from "@/lib/learnos/learning-twin";
import {
  semaineScolaire,
  ANTICIPATION_SEMAINES,
} from "@/lib/learnos/planification-pure";

export * from "@/lib/learnos/planification-pure";

export interface AlerteAnticipee {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  semaineDebut: number;
  semainesAvant: number;
  classeId: string | null;
  classeNom: string | null;
  /** Prérequis non acquis, et les élèves concernés. */
  prerequisManquants: {
    competenceId: string;
    libelle: string;
    eleves: { id: string; nom: string; prenom: string }[];
  }[];
}

/**
 * Chapitres qui démarrent bientôt et dont les prérequis ne sont pas en place.
 *
 * C'est la fonction qui rend le système anticipatif. Elle ne signale que les
 * élèves dont on SAIT que le prérequis n'est pas acquis : un profil `UNKNOWN`
 * n'est pas une difficulté, et alerter dessus ferait perdre toute crédibilité
 * à l'avertissement.
 */
export async function alertesAnticipees(
  tenantId: string,
  anneeId: string,
  /**
   * Périmètre de l'appelant. Exigé et non optionnel : cette fonction nomme des
   * élèves, et un paramètre facultatif qu'on oublie de passer produirait
   * exactement la fuite que l'isolation par site sert à empêcher.
   */
  claims: SessionSiteClaims,
  aujourdHui: Date = new Date(),
  fenetre = ANTICIPATION_SEMAINES
): Promise<AlerteAnticipee[]> {
  const annee = await prisma.anneesScolaires.findFirst({
    where: { id: anneeId, tenantId },
    select: { dateDebut: true },
  });
  if (!annee) return [];

  const semaineCourante = semaineScolaire(aujourdHui, annee.dateDebut);

  const aVenir = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId,
      statut: "PREVU",
      semaineDebut: { gt: semaineCourante, lte: semaineCourante + fenetre },
      ...siteFilterForModel("planificationChapitre", claims),
    },
    select: {
      chapitreId: true,
      semaineDebut: true,
      classeId: true,
      classe: { select: { id: true, nom: true, niveau: true } },
      chapitre: {
        select: {
          nom: true,
          niveau: true,
          matiere: { select: { nom: true } },
          competences: {
            select: {
              id: true,
              prerequis: { select: { id: true, libelle: true } },
            },
          },
        },
      },
    },
    orderBy: { semaineDebut: "asc" },
  });

  const alertes: AlerteAnticipee[] = [];

  for (const p of aVenir) {
    // Prérequis externes au chapitre : ceux qu'il exige et qu'il n'enseigne pas.
    const internes = new Set(p.chapitre.competences.map((c) => c.id));
    const prerequis = new Map<string, string>();
    for (const c of p.chapitre.competences) {
      for (const q of c.prerequis) {
        if (!internes.has(q.id)) prerequis.set(q.id, q.libelle);
      }
    }
    if (prerequis.size === 0) continue;

    // Élèves concernés : ceux de la classe visée, ou de tout le niveau.
    const eleves = await prisma.eleve.findMany({
      where: {
        tenantId,
        statut: "ACTIF",
        deletedAt: null,
        ...siteFilterForModel("eleve", claims),
        ...(p.classeId
          ? { classeId: p.classeId }
          : { classe: { niveau: p.chapitre.niveau } }),
      },
      select: { id: true, nom: true, prenom: true },
    });
    if (eleves.length === 0) continue;

    const profils = await prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId: { in: eleves.map((e) => e.id) },
        competenceId: { in: [...prerequis.keys()] },
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      select: {
        eleveId: true,
        competenceId: true,
        masteryScore: true,
        masteryStatus: true,
      },
    });

    const parEleve = new Map(eleves.map((e) => [e.id, e]));
    const manquants: AlerteAnticipee["prerequisManquants"] = [];

    for (const [competenceId, libelle] of prerequis) {
      const concernes = profils
        .filter(
          (pr) =>
            pr.competenceId === competenceId &&
            // `UNKNOWN` n'est pas une difficulté : on ne sait pas, on se tait.
            pr.masteryStatus !== "UNKNOWN" &&
            pr.masteryScore < SEUILS_MAITRISE.enDeveloppement
        )
        .map((pr) => parEleve.get(pr.eleveId))
        .filter((e): e is NonNullable<typeof e> => e !== undefined);

      if (concernes.length > 0) {
        manquants.push({ competenceId, libelle, eleves: concernes });
      }
    }

    if (manquants.length > 0) {
      alertes.push({
        chapitreId: p.chapitreId,
        chapitreNom: p.chapitre.nom,
        matiereNom: p.chapitre.matiere?.nom ?? "—",
        semaineDebut: p.semaineDebut,
        semainesAvant: p.semaineDebut - semaineCourante,
        classeId: p.classeId,
        classeNom: p.classe?.nom ?? null,
        prerequisManquants: manquants,
      });
    }
  }

  return alertes;
}

// ------------------------------------------------------------
// Compétences visées, par semaine et par élève
// ------------------------------------------------------------

export interface ExigenceAVenir {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  semaineDebut: number;
  semainesAvant: number;
  /** Compétences que le chapitre va enseigner. */
  competencesVisees: { id: string; libelle: string }[];
  /** Prérequis exigés, avec l'état de CET élève. */
  prerequis: {
    id: string;
    libelle: string;
    masteryScore: number | null;
    acquis: boolean;
  }[];
}

/**
 * Ce qu'un élève devra maîtriser dans les prochaines semaines, et où il en est.
 *
 * Répond à la question qu'aucun élève en difficulté ne sait poser : « sur quoi
 * dois-je travailler maintenant, et pourquoi ? ». Le lien entre le programme et
 * le profil individuel est fait ici — c'est ce qui rend la planification utile
 * à l'élève, et pas seulement à l'administration.
 */
export async function exigencesAVenirPourEleve(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  aujourdHui: Date = new Date(),
  fenetre = 6
): Promise<ExigenceAVenir[]> {
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", claims) },
    select: { classe: { select: { niveau: true, id: true } } },
  });
  if (!eleve?.classe) return [];

  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true, dateDebut: true },
  });
  if (!annee) return [];

  const semaineCourante = semaineScolaire(aujourdHui, annee.dateDebut);

  const aVenir = await prisma.planificationChapitre.findMany({
    where: {
      tenantId,
      anneeId: annee.id,
      statut: { not: "TRAITE" },
      semaineFin: { gte: semaineCourante },
      semaineDebut: { lte: semaineCourante + fenetre },
      ...siteFilterForModel("planificationChapitre", claims),
      OR: [{ classeId: null }, { classeId: eleve.classe.id }],
      chapitre: { niveau: eleve.classe.niveau },
    },
    select: {
      chapitreId: true,
      semaineDebut: true,
      chapitre: {
        select: {
          nom: true,
          matiere: { select: { nom: true } },
          competences: {
            select: {
              id: true,
              libelle: true,
              prerequis: { select: { id: true, libelle: true } },
            },
          },
        },
      },
    },
    orderBy: { semaineDebut: "asc" },
  });

  if (aVenir.length === 0) return [];

  // Un seul aller-retour pour tous les prérequis : la latence par requête est
  // trop élevée pour interroger chapitre par chapitre.
  const tousPrerequis = new Set<string>();
  for (const p of aVenir) {
    const internes = new Set(p.chapitre.competences.map((c) => c.id));
    for (const c of p.chapitre.competences) {
      for (const q of c.prerequis) if (!internes.has(q.id)) tousPrerequis.add(q.id);
    }
  }

  const profils = tousPrerequis.size
    ? await prisma.studentLearningProfile.findMany({
        where: {
          tenantId,
          eleveId,
          competenceId: { in: [...tousPrerequis] },
          ...siteFilterForModel("studentLearningProfile", claims),
        },
        select: { competenceId: true, masteryScore: true, masteryStatus: true },
      })
    : [];
  const parCompetence = new Map(profils.map((p) => [p.competenceId, p]));

  return aVenir.map((p) => {
    const internes = new Set(p.chapitre.competences.map((c) => c.id));
    const prerequis = new Map<string, string>();
    for (const c of p.chapitre.competences) {
      for (const q of c.prerequis) if (!internes.has(q.id)) prerequis.set(q.id, q.libelle);
    }

    return {
      chapitreId: p.chapitreId,
      chapitreNom: p.chapitre.nom,
      matiereNom: p.chapitre.matiere?.nom ?? "—",
      semaineDebut: p.semaineDebut,
      semainesAvant: p.semaineDebut - semaineCourante,
      competencesVisees: p.chapitre.competences.map((c) => ({
        id: c.id,
        libelle: c.libelle,
      })),
      prerequis: [...prerequis].map(([id, libelle]) => {
        const profil = parCompetence.get(id);
        return {
          id,
          libelle,
          masteryScore: profil?.masteryScore ?? null,
          // Un prérequis jamais mesuré n'est pas réputé acquis : on ne présume
          // pas d'un savoir qu'on n'a pas observé.
          acquis:
            profil !== undefined &&
            profil.masteryStatus !== "UNKNOWN" &&
            profil.masteryScore >= SEUILS_MAITRISE.enDeveloppement,
        };
      }),
    };
  });
}
