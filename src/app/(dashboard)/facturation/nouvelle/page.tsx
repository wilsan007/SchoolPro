import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { FactureForm } from "@/components/facturation/FactureForm";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";

export default async function NouvelleFacturePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");


  const siteFilter = siteFilterForModel("eleve", session.user);
  const eleves = await prisma.eleve.findMany({
    where: { tenantId: session.user.tenantId, ...siteFilter, statut: "ACTIF" },
    select: {
      id: true,
      nom: true,
      prenom: true,
      matricule: true,
      classe: { select: { nom: true } },
    },
    orderBy: [{ nom: "asc" }],
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Nouvelle facture"
        subtitle="Créer une facture pour un élève"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <FactureForm eleves={eleves} />
      </div>
    </div>
  );
}
