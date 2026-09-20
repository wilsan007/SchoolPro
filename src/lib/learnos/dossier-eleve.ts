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
import { cookies } from "next/headers";
import {
  eleveScopeFilter,
  siteFilterForModel,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { anneeActiveId, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { recalculerProfils, fusionnerProfil } from "@/lib/learnos/profile-recompute";

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

/**
 * UNE FICHE PAR ANNÉE, UNE PERSONNE POUR TOUJOURS
 *
 * Le modèle de données crée une fiche élève par année scolaire : la « 2nde D »
 * de 2025-2026 et celle de 2026-2027 ne partagent aucune ligne. Un compte
 * famille, lui, suit la personne d'une année sur l'autre.
 *
 * Les deux fonctions ci-dessous font donc la jonction : elles retiennent
 * d'abord les fiches de l'année active, et ne retombent sur les autres que
 * s'il n'y en a aucune — sans quoi l'espace d'un parent afficherait l'enfant
 * tel qu'il était l'an dernier, dans une classe qui n'existe plus.
 */
const CHAMPS_FICHE = {
  id: true,
  nom: true,
  prenom: true,
  photoUrl: true,
  dateNaissance: true,
  userId: true,
  classe: { select: { nom: true, annee: true } },
} as const;

/** Les enfants rattachés au compte parent connecté, pour l'année active. */
export async function enfantsDuParent(
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string }
) {
  const enfants = await prisma.eleve.findMany({
    where: {
      tenantId,
      statut: "ACTIF",
      deletedAt: null,
      ...eleveScopeFilter(claims, null),
    },
    select: CHAMPS_FICHE,
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  const annee = await getAnneeCouranteLibelle(tenantId);

  // Un enfant SANS classe est retenu lui aussi : inscrit la semaine dernière et
  // pas encore placé, ou en attente de réaffectation en cours d'année, il est
  // bien de cette année. L'écarter le ferait disparaître de l'espace de ses
  // parents sans qu'aucun écran ne l'explique — et d'autant plus sûrement que
  // sa fratrie, elle, a une classe et suffit à désamorcer le repli ci-dessous.
  const deLAnnee = annee
    ? enfants.filter((e) => e.classe === null || e.classe.annee === annee)
    : [];

  // Repli volontaire : une famille dont aucun enfant n'est inscrit cette
  // année — départ, fin de scolarité — doit continuer à voir son dossier
  // plutôt qu'un écran vide.
  return deLAnnee.length > 0 ? deLAnnee : enfants;
}

/**
 * L'élève correspondant au compte élève connecté, pour l'année active.
 *
 * `Eleve.userId` est unique : le compte ne peut être rattaché qu'à UNE fiche,
 * donc à une seule année. Quand l'année active est une autre, on retrouve la
 * fiche de la même personne — même nom, même prénom, même date de naissance —
 * dans l'année en cours. C'est le rapprochement décrit par `identityKey`
 * (`src/lib/eleve-identity.ts`), appliqué ici sur les champs bruts.
 *
 * DEUX GARDE-FOUS, PARCE QUE L'HOMONYMIE EXISTE VRAIMENT
 * Le même module documente que la base porte des homonymes réels — jumeaux,
 * patronymes fréquents — et surtout soixante-seize élèves nés le 1er janvier
 * 2008, date de repli d'un ancien import. Nom + prénom + date de naissance ne
 * désigne donc PAS toujours une seule personne, et un élève verrait alors le
 * dossier de compétences et l'assiduité d'un camarade.
 *
 *   1. une fiche déjà rattachée à un AUTRE compte n'est jamais « la même
 *      personne » : elle appartient à quelqu'un qui se connecte lui aussi ;
 *   2. à égalité, le tri est déterministe — deux appels rendent la même fiche,
 *      plutôt qu'une réponse qui change d'une requête à l'autre.
 *
 * En dernier recours, on rend la fiche rattachée : montrer l'élève tel qu'il
 * était l'an dernier vaut mieux que montrer quelqu'un d'autre.
 */
export async function eleveDeLUtilisateur(
  tenantId: string,
  claims: SessionSiteClaims & {
    userId?: string;
    id?: string;
    availableRoles?: readonly string[];
  }
) {
  // COMPTE HYBRIDE ÉLÈVE+PARENT : l'espace élève peut incarner l'un des
  // enfants du compte (bascule de démonstration). Le choix est un cookie,
  // REVALIDÉ à chaque lecture contre le périmètre familial — un identifiant
  // falsifié ne donne jamais la fiche d'un autre.
  const choisie = await eleveChoisiPourEspace(tenantId, claims);
  if (choisie) return choisie;

  const rattachee = await prisma.eleve.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      ...eleveScopeFilter(claims, null),
    },
    select: CHAMPS_FICHE,
  });
  if (!rattachee) return null;

  return ficheDeLAnnee(tenantId, rattachee);
}

/** Fiche telle que sélectionnée par `CHAMPS_FICHE`. */
interface FicheEleve {
  id: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  dateNaissance: Date;
  userId: string | null;
  classe: { nom: string; annee: string } | null;
}

/**
 * Recale une fiche sur l'année active quand elle appartient à une autre —
 * même nom, même prénom, même date de naissance, fiche libre ou portée par
 * le même compte. C'est le rapprochement décrit par `identityKey`
 * (`src/lib/eleve-identity.ts`), appliqué sur les champs bruts.
 */
async function ficheDeLAnnee(tenantId: string, fiche: FicheEleve): Promise<FicheEleve> {
  const annee = await getAnneeCouranteLibelle(tenantId);
  if (!annee || fiche.classe?.annee === annee) return fiche;

  // eslint-disable-next-line ecolpro/require-site-filter -- rapprochement d'identité au sein du tenant : la fiche visée est la même personne que celle déjà autorisée ci-dessus
  const deLAnnee = await prisma.eleve.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      nom: fiche.nom,
      prenom: fiche.prenom,
      dateNaissance: fiche.dateNaissance,
      classe: { annee },
      // Libre, ou rattachée au même compte : une fiche portée par un autre
      // utilisateur est un homonyme, pas la même personne.
      OR: [{ userId: null }, { userId: fiche.userId }],
    },
    // `nulls: "last"` est explicite à dessein : en PostgreSQL, un tri
    // descendant place les NULL en tête par défaut — la fiche libre passerait
    // alors devant celle du compte lui-même, soit l'inverse du but.
    orderBy: [{ userId: { sort: "desc", nulls: "last" } }, { matricule: "asc" }],
    select: CHAMPS_FICHE,
  });

  return deLAnnee ?? fiche;
}

/** Cookie portant l'élève incarné dans l'espace STUDENT (comptes hybrides). */
export const ESPACE_ELEVE_CHOISI_COOKIE = "espace_eleve_choisi";

/**
 * La fiche incarnée dans l'espace élève quand le compte a choisi l'un de
 * ses enfants, ou `null` si aucun choix valide n'est posé.
 *
 * Fail-closed sur deux portes : le rôle actif doit être STUDENT, le compte
 * doit POSSÉDER aussi PARENT (sans lui, le périmètre de données du rôle
 * STUDENT resterait borné à sa propre fiche — voir `personalScopeFilter`),
 * et la fiche choisie doit être un enfant ACTIF du compte.
 */
async function eleveChoisiPourEspace(
  tenantId: string,
  claims: SessionSiteClaims & {
    userId?: string;
    id?: string;
    availableRoles?: readonly string[];
  }
): Promise<FicheEleve | null> {
  if (claims.role !== "STUDENT") return null;
  if (!claims.availableRoles?.includes("PARENT")) return null;
  const userId = claims.userId ?? claims.id;
  if (!userId) return null;

  const brut = (await cookies()).get(ESPACE_ELEVE_CHOISI_COOKIE)?.value;
  if (!brut) return null;

  // eslint-disable-next-line ecolpro/require-site-filter -- validation du périmètre familial : parent.userId borne déjà au compte connecté
  const choisie = await prisma.eleve.findFirst({
    where: {
      id: brut,
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      parents: { some: { parent: { userId } } },
    },
    select: CHAMPS_FICHE,
  });
  if (!choisie) return null;

  return ficheDeLAnnee(tenantId, choisie);
}

/**
 * Les enfants du compte pouvant être incarnés dans l'espace élève — ceux de
 * l'année active, repli sur tous s'il n'y en a aucun. Serve le sélecteur de
 * `/eleve` ; vide pour tout compte non hybride (rôle STUDENT sans PARENT).
 */
export async function enfantsDuComptePourBascule(
  tenantId: string,
  claims: SessionSiteClaims & {
    userId?: string;
    id?: string;
    availableRoles?: readonly string[];
  }
): Promise<FicheEleve[]> {
  if (claims.role !== "STUDENT") return [];
  if (!claims.availableRoles?.includes("PARENT")) return [];
  const userId = claims.userId ?? claims.id;
  if (!userId) return [];

  // eslint-disable-next-line ecolpro/require-site-filter -- périmètre familial : parent.userId borne déjà au compte connecté
  const enfants = await prisma.eleve.findMany({
    where: {
      tenantId,
      deletedAt: null,
      statut: "ACTIF",
      parents: { some: { parent: { userId } } },
    },
    select: CHAMPS_FICHE,
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  const annee = await getAnneeCouranteLibelle(tenantId);
  const deLAnnee = annee
    ? enfants.filter((e) => e.classe === null || e.classe.annee === annee)
    : [];
  return deLAnnee.length > 0 ? deLAnnee : enfants;
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

  const [profilsStockes, recos, plans, absences, factures, evidencesFiltrees] = await Promise.all([
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
    // Preuves filtrées par l'horizon démo (occurredAt <= demoDate) —
    // utilisées pour recalculer les champs temporels des profils.
    prisma.learningEvidence.findMany({
      where: {
        tenantId,
        eleveId,
        competenceId: { not: null },
        occurredAt: { lte: maintenant },
        ...siteFilterForModel("learningEvidence", claims),
      },
      select: {
        competenceId: true,
        masterySignal: true,
        occurredAt: true,
      },
    }),
  ]);

  // Recalculer les profils à partir des preuves filtrées par la date simulée.
  const evidencesPourRecalcul = evidencesFiltrees
    .filter((e) => e.competenceId !== null)
    .map((e) => ({ competenceId: e.competenceId!, masterySignal: e.masterySignal, occurredAt: e.occurredAt }));
  const profilsRecalcules = recalculerProfils(evidencesPourRecalcul);
  const profils = profilsStockes.map((p) =>
    fusionnerProfil(p, profilsRecalcules.get(p.competenceId))
  );

  const bloquantes = new Map(
    recos.map((r) => [r.competenceId, r.competencesBloquees > 0])
  );

  const versDossier = (p: typeof profils[number]): CompetenceDuDossier => ({
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
