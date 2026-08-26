import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { Header } from "@/components/layout/Header";
import { GenerationComptesForm } from "@/components/eleves/GenerationComptesForm";
import { GenerationComptesParentsForm } from "@/components/eleves/GenerationComptesParentsForm";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function ComptesElevesPage() {
  const session = await auth();
  // La génération de comptes est une action d'écriture : la page expose
  // des formulaires qui créent des comptes de connexion. `eleves:read`
  // (possédé par TEACHER, NURSE, COUNSELOR, etc.) ne doit pas suffire.
  await guardPage(session, "eleves:write");
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const te = await getTranslations("eleves");

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const classes = aplatirHierarchie(hierarchie);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={te("studentAccounts")}
        subtitle={te("studentAccountsSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin space-y-6 sm:space-y-8">
        <GenerationComptesForm classes={classes} hierarchie={hierarchie} />
        <GenerationComptesParentsForm classes={classes} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
