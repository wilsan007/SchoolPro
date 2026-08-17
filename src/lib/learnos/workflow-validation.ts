/**
 * EcolPro / LEARNOS — Workflow de validation des propositions IA
 * ================================================================
 *
 * Les plans de leçon et grilles d'évaluation générés par l'IA suivent un
 * workflow strict à trois étapes :
 *
 *   1. PROPOSE  — l'IA a généré, en attente de relecture enseignant
 *   2. AJUSTE   — l'enseignant a modifié, en attente de validation direction
 *   3. VALIDE   — le directeur/principal/tenant-admin a validé
 *
 * N'importe quelle étape peut rejeter → REJETE.
 *
 * QUI PEUT FAIRE QUOI ?
 * ---------------------
 *   - Enseignant (TEACHER, CLASS_TEACHER, SUBJECT_LEAD) :
 *       → consulter PROPOSE, ajuster, rejeter
 *   - Direction (TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN) :
 *       → consulter tous statuts, valider, rejeter
 *   - Conseil pédagogique : peut aussi valider (délégué)
 *
 * Le workflow est immuable : on ne peut pas passer de VALIDE à PROPOSE.
 * Les transitions autorisées sont :
 *   PROPOSE → AJUSTE | REJETE
 *   AJUSTE  → VALIDE | REJETE
 *   VALIDE  → (terminal)
 *   REJETE  → (terminal)
 */

import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import type { Role } from "@prisma/client";

/** Rôles autorisés à valider (direction). */
const ROLES_VALIDATION: Role[] = ["TENANT_ADMIN", "PRINCIPAL", "SUPER_ADMIN"];

/** Rôles autorisés à ajuster (enseignants). */
const ROLES_AJUSTEMENT: Role[] = [
  "TEACHER",
  "CLASS_TEACHER",
  "SUBJECT_LEAD",
  "TENANT_ADMIN",
  "PRINCIPAL",
  "SUPER_ADMIN",
];

export type TypeProposition = "plan_lecon" | "rubrique";

export interface PropositionResume {
  id: string;
  type: TypeProposition;
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  statut: string;
  titre: string;
  proposePar: string | null;
  ajustePar: string | null;
  validePar: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Liste les propositions (plans de leçon et rubriques) pour un tenant.
 *
 * Filtrée par statut optionnel.
 */
export async function listerPropositions(
  tenantId: string,
  claims: SessionSiteClaims,
  filtreStatut?: string
): Promise<{ plans: PropositionResume[]; rubriques: PropositionResume[] }> {
  const wherePlans = {
    tenantId,
    ...siteFilterForModel("planLecon", claims),
    ...(filtreStatut ? { statut: filtreStatut as never } : {}),
  };
  const whereRubriques = {
    tenantId,
    ...siteFilterForModel("rubriqueEvaluation", claims),
    ...(filtreStatut ? { statut: filtreStatut as never } : {}),
  };

  const [plans, rubriques] = await Promise.all([
    prisma.planLecon.findMany({
      where: wherePlans,
      include: {
        competence: {
          select: {
            libelle: true,
            chapitre: { select: { matiere: { select: { nom: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rubriqueEvaluation.findMany({
      where: whereRubriques,
      include: {
        competence: {
          select: {
            libelle: true,
            chapitre: { select: { matiere: { select: { nom: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    plans: plans.map((p) => ({
      id: p.id,
      type: "plan_lecon" as const,
      competenceId: p.competenceId,
      competenceLibelle: p.competence.libelle,
      matiereNom: p.competence.chapitre.matiere.nom,
      statut: p.statut,
      titre: p.titre,
      proposePar: p.proposeParId,
      ajustePar: p.ajusteParId,
      validePar: p.valideParId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    rubriques: rubriques.map((r) => ({
      id: r.id,
      type: "rubrique" as const,
      competenceId: r.competenceId,
      competenceLibelle: r.competence.libelle,
      matiereNom: r.competence.chapitre.matiere.nom,
      statut: r.statut,
      titre: r.titre,
      proposePar: r.proposeParId,
      ajustePar: r.ajusteParId,
      validePar: r.valideParId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

/**
 * Vérifie qu'un rôle est autorisé à effectuer une action donnée.
 */
export function peutAjuster(role: Role): boolean {
  return ROLES_AJUSTEMENT.includes(role);
}

export function peutValider(role: Role): boolean {
  return ROLES_VALIDATION.includes(role);
}

/**
 * Ajuste une proposition : l'enseignant modifie le contenu et passe le statut
 * de PROPOSE à AJUSTE.
 *
 * @throws si le statut actuel n'est pas PROPOSE.
 * @throws si le rôle n'est pas autorisé.
 */
export async function ajusterPlanLecon(
  tenantId: string,
  claims: SessionSiteClaims,
  planId: string,
  modifications: {
    titre?: string;
    objectifs?: string[];
    etapes?: { nom: string; duree: number; description: string; support?: string }[];
    materiel?: string[];
    evaluation?: string;
    differentiation?: string;
    dureeTotale?: number;
  },
  userId: string,
  role: Role
): Promise<void> {
  if (!peutAjuster(role)) {
    throw new Error("Rôle non autorisé à ajuster un plan de leçon.");
  }

  const plan = await prisma.planLecon.findFirst({
    where: {
      id: planId,
      tenantId,
      ...siteFilterForModel("planLecon", claims),
    },
    select: { id: true, statut: true },
  });

  if (!plan) throw new Error("Plan de leçon introuvable.");
  if (plan.statut !== "PROPOSE") {
    throw new Error(`Impossible d'ajuster : le statut actuel est ${plan.statut}.`);
  }

  await prisma.planLecon.update({
    where: { id: planId },
    data: {
      ...(modifications.titre ? { titre: modifications.titre } : {}),
      ...(modifications.objectifs ? { objectifs: JSON.stringify(modifications.objectifs) } : {}),
      ...(modifications.etapes ? { etapes: JSON.stringify(modifications.etapes) } : {}),
      ...(modifications.materiel ? { materiel: JSON.stringify(modifications.materiel) } : {}),
      ...(modifications.evaluation ? { evaluation: modifications.evaluation } : {}),
      ...(modifications.differentiation ? { differentiation: modifications.differentiation } : {}),
      ...(modifications.dureeTotale ? { dureeTotale: modifications.dureeTotale } : {}),
      statut: "AJUSTE",
      ajusteParId: userId,
      ajusteLe: new Date(),
    },
  });
}

/**
 * Ajuste une rubrique d'évaluation.
 */
export async function ajusterRubrique(
  tenantId: string,
  claims: SessionSiteClaims,
  rubriqueId: string,
  modifications: {
    titre?: string;
    criteres?: {
      nom: string;
      points: number;
      niveaux: { excellent: string; satisfaisant: string; fragile: string; insuffisant: string };
    }[];
    totalPoints?: number;
  },
  userId: string,
  role: Role
): Promise<void> {
  if (!peutAjuster(role)) {
    throw new Error("Rôle non autorisé à ajuster une rubrique.");
  }

  const rubrique = await prisma.rubriqueEvaluation.findFirst({
    where: {
      id: rubriqueId,
      tenantId,
      ...siteFilterForModel("rubriqueEvaluation", claims),
    },
    select: { id: true, statut: true },
  });

  if (!rubrique) throw new Error("Rubrique introuvable.");
  if (rubrique.statut !== "PROPOSE") {
    throw new Error(`Impossible d'ajuster : le statut actuel est ${rubrique.statut}.`);
  }

  await prisma.rubriqueEvaluation.update({
    where: { id: rubriqueId },
    data: {
      ...(modifications.titre ? { titre: modifications.titre } : {}),
      ...(modifications.criteres ? { criteres: JSON.stringify(modifications.criteres) } : {}),
      ...(modifications.totalPoints ? { totalPoints: modifications.totalPoints } : {}),
      statut: "AJUSTE",
      ajusteParId: userId,
      ajusteLe: new Date(),
    },
  });
}

/**
 * Valide une proposition : la direction passe le statut de AJUSTE à VALIDE.
 *
 * @throws si le statut actuel n'est pas AJUSTE.
 * @throws si le rôle n'est pas autorisé (direction uniquement).
 */
export async function validerPlanLecon(
  tenantId: string,
  claims: SessionSiteClaims,
  planId: string,
  userId: string,
  role: Role
): Promise<void> {
  if (!peutValider(role)) {
    throw new Error("Seul le directeur, le principal ou le tenant-admin peut valider.");
  }

  const plan = await prisma.planLecon.findFirst({
    where: {
      id: planId,
      tenantId,
      ...siteFilterForModel("planLecon", claims),
    },
    select: { id: true, statut: true },
  });

  if (!plan) throw new Error("Plan de leçon introuvable.");
  if (plan.statut !== "AJUSTE") {
    throw new Error(`Impossible de valider : le statut actuel est ${plan.statut}. Seuls les plans ajustés peuvent être validés.`);
  }

  await prisma.planLecon.update({
    where: { id: planId },
    data: {
      statut: "VALIDE",
      valideParId: userId,
      valideLe: new Date(),
    },
  });
}

/**
 * Valide une rubrique d'évaluation.
 */
export async function validerRubrique(
  tenantId: string,
  claims: SessionSiteClaims,
  rubriqueId: string,
  userId: string,
  role: Role
): Promise<void> {
  if (!peutValider(role)) {
    throw new Error("Seul le directeur, le principal ou le tenant-admin peut valider.");
  }

  const rubrique = await prisma.rubriqueEvaluation.findFirst({
    where: {
      id: rubriqueId,
      tenantId,
      ...siteFilterForModel("rubriqueEvaluation", claims),
    },
    select: { id: true, statut: true },
  });

  if (!rubrique) throw new Error("Rubrique introuvable.");
  if (rubrique.statut !== "AJUSTE") {
    throw new Error(`Impossible de valider : le statut actuel est ${rubrique.statut}.`);
  }

  await prisma.rubriqueEvaluation.update({
    where: { id: rubriqueId },
    data: {
      statut: "VALIDE",
      valideParId: userId,
      valideLe: new Date(),
    },
  });
}

/**
 * Rejette une proposition (plan ou rubrique).
 *
 * Accessible à tous les rôles autorisés (enseignant ou direction).
 * Le motif de rejet est obligatoire pour la traçabilité.
 */
export async function rejeterProposition(
  tenantId: string,
  claims: SessionSiteClaims,
  type: TypeProposition,
  propositionId: string,
  motif: string,
  _userId: string,
  role: Role
): Promise<void> {
  if (!peutAjuster(role)) {
    throw new Error("Rôle non autorisé à rejeter une proposition.");
  }

  if (!motif.trim()) {
    throw new Error("Le motif de rejet est obligatoire.");
  }

  if (type === "plan_lecon") {
    const plan = await prisma.planLecon.findFirst({
      where: {
        id: propositionId,
        tenantId,
        ...siteFilterForModel("planLecon", claims),
      },
      select: { id: true, statut: true },
    });
    if (!plan) throw new Error("Plan de leçon introuvable.");
    if (plan.statut === "VALIDE" || plan.statut === "REJETE") {
      throw new Error(`Impossible de rejeter : le statut actuel est ${plan.statut}.`);
    }

    await prisma.planLecon.update({
      where: { id: propositionId },
      data: { statut: "REJETE", motifRejet: motif },
    });
  } else {
    const rubrique = await prisma.rubriqueEvaluation.findFirst({
      where: {
        id: propositionId,
        tenantId,
        ...siteFilterForModel("rubriqueEvaluation", claims),
      },
      select: { id: true, statut: true },
    });
    if (!rubrique) throw new Error("Rubrique introuvable.");
    if (rubrique.statut === "VALIDE" || rubrique.statut === "REJETE") {
      throw new Error(`Impossible de rejeter : le statut actuel est ${rubrique.statut}.`);
    }

    await prisma.rubriqueEvaluation.update({
      where: { id: propositionId },
      data: { statut: "REJETE", motifRejet: motif },
    });
  }
}

/**
 * Persiste un plan de leçon proposé par l'IA en base.
 *
 * Créé avec statut PROPOSE — en attente de relecture enseignant.
 */
export async function persisterPlanLecon(
  tenantId: string,
  claims: SessionSiteClaims,
  data: {
    competenceId: string;
    niveauScolaire: string;
    dureeTotale: number;
    titre: string;
    objectifs: string[];
    etapes: { nom: string; duree: number; description: string; support?: string }[];
    materiel: string[];
    evaluation: string;
    differentiation?: string;
  },
  proposeParId: string,
  modeleIa: string,
  cachedIa: boolean
): Promise<string> {
  const plan = await prisma.planLecon.create({
    data: {
      tenantId,
      siteId: claims.siteId ?? null,
      competenceId: data.competenceId,
      niveauScolaire: data.niveauScolaire,
      dureeTotale: data.dureeTotale,
      titre: data.titre,
      objectifs: JSON.stringify(data.objectifs),
      etapes: JSON.stringify(data.etapes),
      materiel: JSON.stringify(data.materiel),
      evaluation: data.evaluation,
      differentiation: data.differentiation,
      statut: "PROPOSE",
      proposeParId,
      modeleIa,
      cachedIa,
    },
  });
  return plan.id;
}

/**
 * Persiste une rubrique d'évaluation proposée par l'IA.
 */
export async function persisterRubrique(
  tenantId: string,
  claims: SessionSiteClaims,
  data: {
    competenceId: string;
    niveauScolaire: string;
    totalPoints: number;
    titre: string;
    criteres: {
      nom: string;
      points: number;
      niveaux: { excellent: string; satisfaisant: string; fragile: string; insuffisant: string };
    }[];
  },
  proposeParId: string,
  modeleIa: string,
  cachedIa: boolean
): Promise<string> {
  const rubrique = await prisma.rubriqueEvaluation.create({
    data: {
      tenantId,
      siteId: claims.siteId ?? null,
      competenceId: data.competenceId,
      niveauScolaire: data.niveauScolaire,
      totalPoints: data.totalPoints,
      titre: data.titre,
      criteres: JSON.stringify(data.criteres),
      statut: "PROPOSE",
      proposeParId,
      modeleIa,
      cachedIa,
    },
  });
  return rubrique.id;
}
