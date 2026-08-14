import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { RapportClasseTable } from "@/components/examens/RapportClasseTable";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function RapportClassePage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tx = await getTranslations("examens");

  const siteFilter = siteFilterForModel("classe", session.user);
  const [classes, periodes] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilter },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId: session.user.tenantId } },
      select: { id: true, nom: true, numero: true, isCurrent: true },
      orderBy: { numero: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={tx("matrixReportTitle")}
        subtitle={tx("matrixReportSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <RapportClasseTable classes={classes} periodes={periodes} />
      </div>
    </div>
  );
}
