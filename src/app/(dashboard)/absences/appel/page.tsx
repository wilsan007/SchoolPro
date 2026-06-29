import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AppelInterface } from "@/components/absences/AppelInterface";

async function getClasses(tenantId: string) {
  return prisma.classe.findMany({
    where: { tenantId },
    include: {
      eleves: {
        where: { statut: "ACTIF" },
        select: {
          id: true, nom: true, prenom: true,
          photoUrl: true, sexe: true, matricule: true,
        },
        orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      },
    },
    orderBy: { nom: "asc" },
  });
}

export default async function AppelPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await getClasses(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Faire l'appel"
        subtitle={`${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AppelInterface classes={classes} tenantId={session.user.tenantId} />
      </div>
    </div>
  );
}
