import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { DossierProgressionView } from "@/components/dossier-progression/DossierProgressionView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";

export default async function DossierProgressionPage({
  params,
}: {
  params: Promise<{ eleveId: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("dossierProgression"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const { eleveId } = await params;
  const tenantId = session.user.tenantId;

  // Vérifier que l'élève existe dans le périmètre de l'appelant.
  const eleve = await prisma.eleve.findFirst({
    where: {
      id: eleveId,
      tenantId,
      ...mergeFilters(
        siteFilterForModel("eleve", session.user),
        personalScopeFilter(session.user, null)
      ),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { id: true, nom: true, niveau: true } },
    },
  });

  if (!eleve) notFound();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={`${eleve.prenom} ${eleve.nom}`}
        subtitle={`${eleve.matricule} · ${eleve.classe?.nom ?? "—"} · ${t("title")}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <DossierProgressionView eleveId={eleve.id} />
      </div>
    </div>
  );
}
