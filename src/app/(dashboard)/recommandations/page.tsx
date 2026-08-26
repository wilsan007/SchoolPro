import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RecommandationsTabs } from "@/components/learnos/RecommandationsTabs";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
  type SessionSiteClaims,
} from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import type { Role, Prisma } from "@prisma/client";

/**
 * Recommandations — la liste de travail de l'enseignant.
 *
 * Ne montre que les recommandations **non traitées** : celles qu'un humain a
 * déjà acceptées ou écartées sortent de la liste. Une file qui ne se vide
 * jamais cesse d'être consultée.
 */
async function getRecommandations(
  tenantId: string,
  claims: SessionSiteClaims,
  scope?: { classeIds: string[]; isRestricted: boolean }
) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  return prisma.recommandation.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("recommandation", claims),
      resolueLe: null,
      // Un enseignant ne voit que ses classes ; la direction voit tout.
      ...(anneeCourante || scope?.isRestricted
        ? {
            eleve: {
              ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
              ...(scope?.isRestricted
                ? { classeId: { in: scope.classeIds.length > 0 ? scope.classeIds : ["__none__"] } }
                : {}),
            },
          }
        : {}),
      statut: { in: ["OBLIGATOIRE", "RECOMMANDEE", "PROPOSEE"] },
    },
    select: {
      id: true,
      niveau: true,
      statut: true,
      motif: true,
      actionProposee: true,
      regleDeclenchee: true,
      motifParams: true,
      competencesBloquees: true,
      createdAt: true,
      eleve: {
        select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
      },
      competence: {
        select: {
          code: true,
          libelle: true,
          chapitre: { select: { matiere: { select: { nom: true } } } },
        },
      },
    },
    orderBy: [{ niveau: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
}

/**
 * Parcours en attente de décision, dans le périmètre de l'appelant.
 *
 * Sans cet écran, le moteur produisait des accompagnements que personne ne
 * pouvait engager : du travail visible qui ne servait à rien.
 */
async function getPlansAValider(
  tenantId: string,
  claims: SessionSiteClaims,
  scope?: { classeIds: string[]; isRestricted: boolean }
) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  return prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "PROPOSE",
      ...siteFilterForModel("planProgression", claims),
      ...(anneeCourante || scope?.isRestricted
        ? {
            eleve: {
              ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
              ...(scope?.isRestricted
                ? { classeId: { in: scope.classeIds.length > 0 ? scope.classeIds : ["__none__"] } }
                : {}),
            },
          }
        : {}),
    },
    select: {
      id: true, type: true, motif: true, regleDeclenchee: true,
      motifParams: true, dateRevue: true,
      eleve: { select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } } },
      matiere: { select: { nom: true } },
      etapes: {
        select: {
          id: true, ordre: true, action: true, responsable: true, echeance: true,
          competence: { select: { libelle: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Attestations en attente de validation.
 *
 * Récupérées côté serveur pour que le wrapper connaisse le compte dès le
 * premier rendu — avant, le composant faisait son propre fetch client et
 * l'onglet affichait 0 jusqu'à la réponse.
 *
 * Reproduit la logique de `/api/learnos/attestations` : feuilles de type
 * `attestation` en statut `PROPOSEE` (à signer) ou `ASSIGNEE` sans
 * `assigneeLe` (acceptées, à lancer en classe), avec le profil de maîtrise
 * qui justifie la proposition.
 */
async function getAttestations(
  tenantId: string,
  claims: SessionSiteClaims & { userId?: string; id?: string },
  scope?: { classeIds: string[]; isRestricted: boolean }
) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const feuilles = await prisma.feuilleExercices.findMany({
    where: mergeFilters(
      { tenantId, type: "attestation" },
      {
        OR: [
          { statut: "PROPOSEE" },
          { statut: "ASSIGNEE", assigneeLe: null },
        ],
      },
      ...(anneeCourante || scope?.isRestricted
        ? [{
            eleve: {
              ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
              ...(scope?.isRestricted
                ? { classeId: { in: scope.classeIds.length > 0 ? scope.classeIds : ["__none__"] } }
                : {}),
            },
          }]
        : []),
      siteFilterForModel("feuilleExercices", claims),
      personalScopeFilter(claims, "eleve"),
    ) as Prisma.FeuilleExercicesWhereInput,
    select: {
      id: true,
      statut: true,
      assigneeLe: true,
      createdAt: true,
      competenceAttesteeId: true,
      competenceAttestee: { select: { libelle: true, code: true } },
      matiere: { select: { nom: true, couleur: true } },
      eleve: {
        select: { id: true, nom: true, prenom: true, classe: { select: { nom: true } } },
      },
      _count: { select: { exercices: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  if (feuilles.length === 0) return [];

  // Profil de maîtrise — lu en une passe, comme la route API.
  const profils = await prisma.studentLearningProfile.findMany({
    where: {
      tenantId,
      OR: feuilles
        .filter((f) => f.competenceAttesteeId)
        .map((f) => ({ eleveId: f.eleve.id, competenceId: f.competenceAttesteeId! })),
      ...siteFilterForModel("studentLearningProfile", claims),
    },
    select: {
      eleveId: true,
      competenceId: true,
      masteryScore: true,
      confidenceScore: true,
      evidenceCount: true,
    },
  });
  const profilDe = new Map(profils.map((p) => [`${p.eleveId}|${p.competenceId}`, p]));

  return feuilles.map((f) => ({
    id: f.id,
    signee: f.statut === "ASSIGNEE",
    creeeLe: f.createdAt,
    nbExercices: f._count.exercices,
    competence: f.competenceAttestee,
    matiere: f.matiere,
    eleve: f.eleve,
    profil: profilDe.get(`${f.eleve.id}|${f.competenceAttesteeId}`) ?? null,
  }));
}

export default async function RecommandationsPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.recommandations")]);
  await guardPage(session);

  const scope = isTeacherRole(session!.user.role as Role)
    ? await getTeacherScope(
        session!.user.tenantId!,
        session!.user.id,
        session!.user.role as Role
      )
    : undefined;

  const [recommandations, plans, attestations] = await Promise.all([
    getRecommandations(session!.user.tenantId!, session!.user, scope),
    getPlansAValider(session!.user.tenantId!, session!.user, scope),
    getAttestations(session!.user.tenantId!, session!.user, scope),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <RecommandationsTabs
        attestations={attestations}
        plans={plans}
        recommandations={recommandations}
      />
    </div>
  );
}
