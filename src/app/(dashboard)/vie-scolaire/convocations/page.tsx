import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { ConvocationForm } from "@/components/vie-scolaire/ConvocationForm";
import { guardPage } from "@/lib/guard-page";

export default async function ConvocationsPage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");


  const siteFilter = siteFilterForModel("classe", session.user);
  const [classes, tenant] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilter },
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
        <ConvocationForm classes={classes} tenant={tenant} />
      </div>
    </div>
  );
}
