import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { GenerationComptesForm } from "@/components/eleves/GenerationComptesForm";

export default async function ComptesElevesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await prisma.classe.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, nom: true, niveau: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Comptes Élèves"
        subtitle="Génération en masse de comptes utilisateurs pour les élèves"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <GenerationComptesForm classes={classes} />
      </div>
    </div>
  );
}
