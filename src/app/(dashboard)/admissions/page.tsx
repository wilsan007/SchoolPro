import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AdmissionsView } from "@/components/admissions/AdmissionsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";

async function getCandidatures(tenantId: string, siteFilter: Record<string, unknown>) {
  const anneeActuelle = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  const candidatures = await prisma.candidature.findMany({
    where: { tenantId, annee: anneeActuelle, ...siteFilter },
    orderBy: { createdAt: "desc" },
  });

  return { candidatures };
}

export default async function AdmissionsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("admissions"),
  ]);
  await guardPage(session);

  const siteFilter = siteFilterForModel("candidature", session!.user);
  const { candidatures } = await getCandidatures(session!.user.tenantId!, siteFilter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <AdmissionsView candidatures={candidatures} />
      </div>
    </div>
  );
}
