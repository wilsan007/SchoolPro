import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { Header } from "@/components/layout/Header";
import { TransfertClasseForm } from "@/components/eleves/TransfertClasseForm";
import { guardPage } from "@/lib/guard-page";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function TransfertClassePage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const siteFilter = siteFilterForModel("classe", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilter spread
  const classes = await prisma.classe.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...(hierarchieClasseIds.length > 0 ? { id: { in: hierarchieClasseIds } } : {}),
    },
    select: {
      id: true, nom: true, niveau: true,
      eleves: {
        where: { statut: "ACTIF" },
        select: { id: true, nom: true, prenom: true, matricule: true },
        orderBy: { prenom: "asc" },
      },
    },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Changement de Classe"
        subtitle="Transfert d'élèves entre classes en masse"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <TransfertClasseForm classes={classes} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
