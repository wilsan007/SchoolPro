import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { FactureForm } from "@/components/facturation/FactureForm";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

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
  const [eleves, classes] = await Promise.all([
    prisma.eleve.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilter, statut: "ACTIF" },
      select: {
        id: true,
        nom: true,
        prenom: true,
        matricule: true,
        classe: { select: { id: true, nom: true } },
      },
      orderBy: [{ nom: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId, ...siteFilterForModel("classe", session.user) },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

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
        <FactureForm eleves={eleves} classes={classes} eleveIdPreselected={params.eleveId} />
      </div>
    </div>
  );
}
