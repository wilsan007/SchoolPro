import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { TransfertClasseForm } from "@/components/eleves/TransfertClasseForm";

export default async function TransfertClassePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await prisma.classe.findMany({
    where: { tenantId: session.user.tenantId },
    select: {
      id: true, nom: true, niveau: true,
      eleves: {
        where: { statut: "ACTIF" },
        select: { id: true, nom: true, prenom: true, matricule: true },
        orderBy: { nom: "asc" },
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
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <TransfertClasseForm classes={classes} />
      </div>
    </div>
  );
}
