import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CampagneReinscriptionWizard } from "@/components/reinscription/CampagneReinscriptionWizard";
import {
  getCampagneActive,
  getCampagnes,
  getStatsCampagne,
} from "./actions";

export default async function ReinscriptionPage() {
  const session = await auth();
  await guardPage(session, "parametres:read");
  if (!session?.user?.tenantId) redirect("/login");

  const t = await getTranslations("reinscription");
  const [campagneActive, campagnes, annees] = await Promise.all([
    getCampagneActive(),
    getCampagnes(),
    prisma.anneesScolaires.findMany({
      where: { tenantId: session.user.tenantId },
      orderBy: { dateDebut: "desc" },
      select: { id: true, libelle: true, statut: true, isCurrent: true },
    }),
  ]);

  let stats = null;
  if (campagneActive) {
    stats = await getStatsCampagne(campagneActive.id);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <CampagneReinscriptionWizard
          campagneActive={campagneActive ? JSON.parse(JSON.stringify(campagneActive)) : null}
          campagnes={campagnes.map((c) => JSON.parse(JSON.stringify(c)))}
          annees={JSON.parse(JSON.stringify(annees))}
          stats={stats ? JSON.parse(JSON.stringify(stats)) : null}
          userRole={session.user.role as string}
        />
      </div>
    </div>
  );
}
