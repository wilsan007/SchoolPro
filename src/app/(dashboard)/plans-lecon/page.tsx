import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { GenerateurPlanLecon } from "@/components/learnos/GenerateurPlanLecon";

/**
 * Page de génération de plans de leçon par IA.
 *
 * ACCÈS : enseignants (curriculum:write) et direction.
 */
export default async function PlansLeconPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.planLecon"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;

  // Charger les compétences disponibles pour le sélecteur.
  const competences = await prisma.competence.findMany({
    where: { tenantId, ...siteFilterForModel("competence", session!.user) },
    select: {
      id: true,
      libelle: true,
      chapitre: {
        select: {
          niveau: true,
          matiere: { select: { nom: true } },
        },
      },
    },
    orderBy: { chapitre: { matiere: { nom: "asc" } } },
    take: 200,
  });

  const competencesFormatees = competences.map((c) => ({
    id: c.id,
    libelle: c.libelle,
    matiere: c.chapitre.matiere.nom,
    niveau: c.chapitre.niveau,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <div className="mx-auto max-w-3xl">
          <GenerateurPlanLecon competences={competencesFormatees} />
        </div>
      </div>
    </div>
  );
}
