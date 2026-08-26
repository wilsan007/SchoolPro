import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { ConvocationForm } from "@/components/vie-scolaire/ConvocationForm";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function ConvocationsPage() {
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

  const [classes, tenant] = await Promise.all([
    prisma.classe.findMany({
      where: {
        tenantId: session.user.tenantId,
        ...siteFilter,
        ...(anneeCourante ? { annee: anneeCourante } : {}),
        ...(hierarchieClasseIds.length > 0 ? { id: { in: hierarchieClasseIds } } : {}),
      },
      include: {
        eleves: {
          where: { statut: "ACTIF", ...siteFilterForModel("eleve", session.user) },
          select: {
            id: true, nom: true, prenom: true, matricule: true,
            parents: {
              where: siteFilterForModel("eleveParent", session.user),
              include: { parent: { select: { id: true, nom: true, prenom: true, phone: true, email: true } } },
            },
          },
          orderBy: { nom: "asc" },
        },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, city: true, chefEtablissement: true, currentYear: true },
    }),
  ]);

  if (!tenant) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Convocation des Parents"
        subtitle="Générer et imprimer des convocations pour les parents d'élèves"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <ConvocationForm classes={classes} tenant={tenant} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
