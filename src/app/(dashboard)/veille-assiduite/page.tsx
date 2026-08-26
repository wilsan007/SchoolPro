import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { VeilleAssiduiteView } from "@/components/veille-assiduite/VeilleAssiduiteView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function VeilleAssiduitePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("veilleAssiduite"),
  ]);
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const hierarchie: ClassesHierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const classes = aplatirHierarchie(hierarchie).map((c) => ({
    ...c,
    annee: anneeCourante ?? "",
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <VeilleAssiduiteView classes={classes} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
