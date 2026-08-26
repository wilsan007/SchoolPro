import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RapportClasseTable } from "@/components/examens/RapportClasseTable";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function RapportClassePage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tx = await getTranslations("examens");

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const hierarchie: ClassesHierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const classes = aplatirHierarchie(hierarchie);

  const periodes = await prisma.periode.findMany({
    where: { annee: { tenantId: session.user.tenantId } },
    select: { id: true, nom: true, numero: true, isCurrent: true },
    orderBy: { numero: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={tx("matrixReportTitle")}
        subtitle={tx("matrixReportSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <RapportClasseTable classes={classes} hierarchie={hierarchie} periodes={periodes} />
      </div>
    </div>
  );
}
