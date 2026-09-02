/**
 * EcolPro / LEARNOS — Dossier d'un élève, vu par sa famille
 * =========================================================
 *
 * CE QUE CE MODULE N'EST PAS
 * --------------------------
 * Ce n'est pas un bulletin. Un parent qui reçoit « moyenne 11,4 » n'apprend
 * rien qu'il puisse utiliser : il ne sait ni ce qui coince, ni quoi faire.
 *
 * Ce module produit un **récit court et actionnable** — acquis, en cours, à
 * reprendre, et surtout *la chose concrète à faire cette semaine*. C'est la
 * dernière ligne qui compte : un constat n'aide personne, une action de quinze
 * minutes, si.
 *
 * PARENT ET ÉLÈVE PARTAGENT CE MODULE
 * -----------------------------------
 * Les deux ont besoin du même récit ; ce qui change est le cadrage et le
 * responsable de l'action à venir (`pourResponsable`). Dupliquer aurait
 * garanti que les deux écrans divergent au premier correctif.
 *
 * ISOLATION
 * ---------
 * Le filtre de site NE joue PAS pour les rôles `PARENT` / `STUDENT` : c'est le
 * périmètre relationnel (`eleveScopeFilter`) qui protège. L'appelant DOIT
 * résoudre l'élève via `enfantsDuParent` ou `eleveDeLUtilisateur` — passer un
 * `eleveId` non vérifié ouvrirait le dossier de n'importe quel élève.
 *
 * ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import prisma from "@/lib/prisma";
import {
  eleveScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/** Fenêtre d'observation de l'assiduité, en jours. */
const FENETRE_ASSIDUITE_JOURS = 30;

/**
 * Nombre de compétences observées en deçà duquel on refuse de conclure à une
 * tendance. Deux profils qui montent ne font pas un élève « en progression » —
 * l'annoncer à une famille serait une promesse que rien ne soutient.
 */
const PROFILS_POUR_TENDANCE = 4;

/** Écart minimal entre hausses et baisses pour trancher. */
const ECART_POUR_TENDANCE = 2;

export interface CompetenceDuDossier {
  competenceId: string;
  code: string;
  libelle: string;
  matiere: string | null;
  /** 0..1 — estimation, jamais présentée comme une note. */
  mastery: number;
  /** `true` quand d'autres compétences en dépendent : à traiter en premier. */
  bloquante: boolean;
}

export interface EtapeDuDossier {
  id: string;
  action: string;
  competence: string;
  matiere: string | null;
  responsable: string;
  echeance: Date | null;
}

export interface PlanDuDossier {
  id: string;
  type: string;
  matiere: string | null;
  statut: string;
  dateRevue: Date | null;
  regleDeclenchee: string;
  motif: string;
  motifParams: unknown;
  /** Étapes restantes, dans l'ordre. */
  etapes: EtapeDuDossier[];
}

export interface DossierEleve {
  eleve: { id: string; nom: string; prenom: string; classe: string | null };
  acquis: CompetenceDuDossier[];
  enCours: CompetenceDuDossier[];
  aReprendre: CompetenceDuDossier[];
  /** "hausse" | "baisse" | "stable" | "indetermine" */
  tendance: string;
  plans: PlanDuDossier[];
  /**
   * L'action à faire cette semaine. `null` est un résultat valable : inventer
   * une tâche pour remplir l'écran ferait perdre toute crédibilité aux fois
   * où il y en a réellement une.
   */
  prochaineAction: EtapeDuDossier | null;
  assiduite: { absencesInjustifiees: number; fenetreJours: number };
  /** Renseigné seulement quand `avecFinance` — un élève n'a pas à le voir. */
  finance: { facturesEnRetard: number; montantDu: number } | null;
}

/** Les enfants rattachés au compte parent connecté. */
export async function enfantsDuParent(
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string }
) {
  return prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...eleveScopeFilter(claims, null),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      photoUrl: true,
      classe: { select: { nom: true } },
    },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });
}

/** L'élève correspondant au compte élève connecté. */
export async function eleveDeLUtilisateur(
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string }
) {
  return prisma.eleve.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      ...eleveScopeFilter(claims, null),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      photoUrl: true,
      classe: { select: { nom: true } },
    },
  });
}

/**
 * Dossier complet d'un élève dont l'accès a **déjà** été vérifié.
 *
 * @param pourResponsable ne remonte comme « prochaine action » que les étapes
 *        portées par ce responsable (`"parent"` ou `"eleve"`). Proposer à un
 *        parent une étape qui incombe à l'enseignant produirait de la
 *        culpabilité sans levier.
 */
export async function dossierEleve(
  tenantId: string,
  eleveId: string,
  claims: SessionSiteClaims,
  options: {
    pourResponsable?: string;
    avecFinance?: boolean;
    maintenant?: Date;
    anneeCourante?: string | null;
  } = {}
): Promise<DossierEleve | null> {
  const { pourResponsable, avecFinance = false, maintenant = new Date(), anneeCourante } =
    options;

  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);

  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", claims) },
    select: {
      id: true,
      nom: true,
      prenom: true,
      classe: { select: { nom: true } },
    },
  });
  if (!eleve) return null;

  // Fenêtre d'assiduité relative à la date simulée (ou réelle par défaut).
  const depuis = new Date(
    maintenant.getTime() - FENETRE_ASSIDUITE_JOURS * 86_400_000
  );

  const anneeId = await anneeActiveId(tenantId);

  const [profils, recos, plans, absences, factures] = await Promise.all([
    prisma.studentLearningProfile.findMany({
      where: {
        tenantId,
        eleveId,
        ...siteFilterForModel("studentLearningProfile", claims),
      },
      select: {
        competenceId: true,
        masteryScore: true,
        masteryStatus: true,
        trend: true,
        competence: {
          select: {
            code: true,
            libelle: true,
            chapitre: { select: { matiere: { select: { nom: true } } } },
          },
        },
      },
    }),
    prisma.recommandation.findMany({
      where: {
        tenantId,
        eleveId,
        resolueLe: null,
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("recommandation", claims),
      },
      select: { competenceId: true, competencesBloquees: true },
    }),
    prisma.planProgression.findMany({
      where: {
        tenantId,
        eleveId,
        statut: { in: ["ACTIF", "EN_REVUE"] },
        ...siteFilterForModel("planProgression", claims),
      },
      select: {
        id: true,
        type: true,
        statut: true,
        dateRevue: true,
        motif: true,
        regleDeclenchee: true,
        motifParams: true,
        matiere: { select: { nom: true } },
        etapes: {
          where: { statut: { not: "VALIDE" } },
          orderBy: { ordre: "asc" },
          select: {
            id: true,
            action: true,
            responsable: true,
            echeance: true,
            competence: {
              select: {
                libelle: true,
                chapitre: { select: { matiere: { select: { nom: true } } } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.absence.count({
      where: {
        tenantId,
        eleveId,
        statut: "INJUSTIFIEE",
        date: { gte: depuis },
        ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
        ...siteFilterForModel("absence", claims),
      },
    }),
    avecFinance
      ? prisma.facture.findMany({
          where: {
            tenantId,
            eleveId,
            statut: "EN_RETARD",
            ...(anneeId ? { anneeId } : {}),
            ...siteFilterForModel("facture", claims),
          },
          // Le reste dû se calcule : `Facture` porte le montant émis, les
          // encaissements vivent dans `Paiement`.
          select: { montant: true, paiements: { select: { montant: true } } },
        })
      : Promise.resolve(null),
  ]);

  const bloquantes = new Map(
    recos.map((r) => [r.competenceId, r.competencesBloquees > 0])
  );

  const versDossier = (p: (typeof profils)[number]): CompetenceDuDossier => ({
    competenceId: p.competenceId,
    code: p.competence.code,
    libelle: p.competence.libelle,
    matiere: p.competence.chapitre?.matiere?.nom ?? null,
    mastery: p.masteryScore,
    bloquante: bloquantes.get(p.competenceId) ?? false,
  });

  // Les compétences non mesurées (`UNKNOWN`) sont écartées : dire à une famille
  // qu'une compétence n'est « pas acquise » alors qu'elle n'a jamais été
  // évaluée serait un mensonge par omission.
  const acquis = profils
    .filter((p) => p.masteryStatus === "MASTERED" || p.masteryStatus === "PROFICIENT")
    .map(versDossier)
    .sort((a, b) => b.mastery - a.mastery);

  const enCours = profils
    .filter((p) => p.masteryStatus === "DEVELOPING")
    .map(versDossier)
    .sort((a, b) => b.mastery - a.mastery);

  // Les bloquantes d'abord : c'est ce qui empêche le reste d'avancer.
  const aReprendre = profils
    .filter((p) => p.masteryStatus === "EMERGING")
    .map(versDossier)
    .sort((a, b) => Number(b.bloquante) - Number(a.bloquante) || a.mastery - b.mastery);

  const versEtape = (
    e: (typeof plans)[number]["etapes"][number]
  ): EtapeDuDossier => ({
    id: e.id,
    action: e.action,
    competence: e.competence.libelle,
    matiere: e.competence.chapitre?.matiere?.nom ?? null,
    responsable: e.responsable,
    echeance: e.echeance,
  });

  const plansDuDossier: PlanDuDossier[] = plans.map((p) => ({
    id: p.id,
    type: p.type,
    matiere: p.matiere?.nom ?? null,
    statut: p.statut,
    dateRevue: p.dateRevue,
    regleDeclenchee: p.regleDeclenchee,
    motif: p.motif,
    motifParams: p.motifParams,
    etapes: p.etapes.map(versEtape),
  }));

  // Une seule action à la fois. En proposer trois revient à n'en proposer
  // aucune : on prend l'échéance la plus proche, sans échéance en dernier.
  const candidates = plansDuDossier
    .flatMap((p) => p.etapes)
    .filter((e) => !pourResponsable || e.responsable === pourResponsable)
    .sort((a, b) => {
      if (a.echeance && b.echeance) return a.echeance.getTime() - b.echeance.getTime();
      if (a.echeance) return -1;
      if (b.echeance) return 1;
      return 0;
    });

  return {
    eleve: {
      id: eleve.id,
      nom: eleve.nom,
      prenom: eleve.prenom,
      classe: eleve.classe?.nom ?? null,
    },
    acquis,
    enCours,
    aReprendre,
    tendance: tendanceGlobale(profils),
    plans: plansDuDossier,
    prochaineAction: candidates[0] ?? null,
    assiduite: {
      absencesInjustifiees: absences,
      fenetreJours: FENETRE_ASSIDUITE_JOURS,
    },
    finance: factures
      ? {
          facturesEnRetard: factures.length,
          montantDu: factures.reduce(
            (total, f) =>
              total +
              Math.max(0, f.montant - f.paiements.reduce((s, p) => s + p.montant, 0)),
            0
          ),
        }
      : null,
  };
}

/**
 * Tendance d'ensemble, à partir des tendances par compétence.
 *
 * `indetermine` est le résultat par défaut, et il est fréquent : annoncer
 * « stable » sans avoir observé assez de compétences serait une conclusion
 * tirée du vide. Une famille se souvient d'un « ça progresse » démenti le
 * trimestre suivant.
 */
export function tendanceGlobale(profils: { trend: string }[]): string {
  const mesurees = profils.filter((p) => p.trend !== "indetermine");
  if (mesurees.length < PROFILS_POUR_TENDANCE) return "indetermine";

  const hausses = mesurees.filter((p) => p.trend === "hausse").length;
  const baisses = mesurees.filter((p) => p.trend === "baisse").length;

  if (hausses - baisses >= ECART_POUR_TENDANCE) return "hausse";
  if (baisses - hausses >= ECART_POUR_TENDANCE) return "baisse";
  return "stable";
}
