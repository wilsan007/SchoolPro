import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { CartesScolairesForm } from "@/components/eleves/CartesScolairesForm";

export default async function CartesScolairesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await prisma.classe.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true, nom: true, niveau: true,
      eleves: {
        where: { statut: "ACTIF" },
        select: { id: true, nom: true, prenom: true, matricule: true, dateNaissance: true, photoUrl: true },
        orderBy: { nom: "asc" },
      },
    },
    orderBy: { nom: "asc" },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Cartes Scolaires"
        subtitle="Générer et imprimer les cartes scolaires des élèves"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <CartesScolairesForm classes={classes} />
      </div>
    </div>
  );
}
