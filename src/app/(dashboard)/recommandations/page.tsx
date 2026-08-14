import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RecommandationsView } from "@/components/learnos/RecommandationsView";
import { PlansAValider } from "@/components/learnos/PlansAValider";
import { AttestationsAValider } from "@/components/learnos/AttestationsAValider";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

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
  return prisma.recommandation.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("recommandation", claims),
      resolueLe: null,
      // Un enseignant ne voit que ses classes ; la direction voit tout.
      ...(scope?.isRestricted
        ? { eleve: { classeId: { in: scope.classeIds.length > 0 ? scope.classeIds : ["__none__"] } } }
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
  return prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: "PROPOSE",
      ...siteFilterForModel("planProgression", claims),
      ...(scope?.isRestricted
        ? {
            eleve: {
              classeId: { in: scope.classeIds.length > 0 ? scope.classeIds : ["__none__"] },
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

  const [recommandations, plans] = await Promise.all([
    getRecommandations(session!.user.tenantId!, session!.user, scope),
    getPlansAValider(session!.user.tenantId!, session!.user, scope),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-6 scrollbar-thin">
        {/* En tête, avant les parcours : une attestation est un travail que
            l'élève a DÉJÀ fait et qui attend l'enseignant, alors qu'un parcours
            est une décision à prendre. Ce qui attend passe devant. */}
        <AttestationsAValider />
        <PlansAValider plans={plans} />
        <RecommandationsView recommandations={recommandations} />
      </div>
    </div>
  );
}
