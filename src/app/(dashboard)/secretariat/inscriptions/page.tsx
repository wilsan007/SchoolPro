import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { InscriptionsView } from "@/components/secretariat/InscriptionsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

async function getDossiers(tenantId: string, siteFilter: Record<string, unknown>) {
  const anneeActuelle = await getAnneeCouranteLibelle(tenantId);

  const dossiers = await prisma.candidature.findMany({
    where: {
      tenantId,
      ...(anneeActuelle ? { annee: anneeActuelle } : {}),
      ...siteFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      creePar: { select: { id: true, name: true } },
      validePar: { select: { id: true, name: true } },
      _count: { select: { historique: true } },
    },
  });

  return { dossiers };
}

export default async function InscriptionsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("inscriptions"),
  ]);
  await guardPage(session);

  const siteFilter = siteFilterForModel("candidature", session!.user);
  const { dossiers } = await getDossiers(session!.user.tenantId!, siteFilter);

  // Sérialiser les dates pour le client
  const serialises = dossiers.map((d) => ({
    ...d,
    dateNaissance: d.dateNaissance.toISOString(),
    valideLe: d.valideLe?.toISOString() ?? null,
    closLe: d.closLe?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
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
        <InscriptionsView dossiers={serialises as never} />
      </div>
    </div>
  );
}
