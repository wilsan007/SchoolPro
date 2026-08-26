import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { FactureForm } from "@/components/facturation/FactureForm";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getClassesHierarchie, aplatirHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

export default async function NouvelleFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ eleveId?: string }>;
}) {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tf = await getTranslations("facturation");

  const siteFilter = siteFilterForModel("eleve", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const anneeClasse = anneeCourante ? { classe: { annee: anneeCourante } } : {};
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const classes = aplatirHierarchie(hierarchie);
  // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilter spread
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId: session.user.tenantId,
      ...siteFilter,
      statut: "ACTIF",
      ...anneeClasse,
      ...(hierarchieClasseIds.length > 0 ? { classeId: { in: hierarchieClasseIds } } : {}),
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { id: true, nom: true } },
    },
    orderBy: [{ nom: "asc" }],
  });

  const params = await searchParams;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={tf("newInvoice")}
        subtitle={tf("newInvoiceSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <FactureForm eleves={eleves} classes={classes} eleveIdPreselected={params.eleveId} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
