import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RapportClasseTable } from "@/components/examens/RapportClasseTable";

export default async function RapportClassePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const [classes, periodes] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId: session.user.tenantId } },
      select: { id: true, nom: true, numero: true, isCurrent: true },
      orderBy: { numero: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Rapport de Classe Matriciel"
        subtitle="Tableau récapitulatif des notes par classe et période"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <RapportClasseTable classes={classes} periodes={periodes} />
      </div>
    </div>
  );
}
