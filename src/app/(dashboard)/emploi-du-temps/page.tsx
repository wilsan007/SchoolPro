import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { EmploiDuTempsView } from "@/components/emploi-du-temps/EmploiDuTempsView";

async function getEmploiData(tenantId: string) {
  const [classes, matieres, enseignants, emplois] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId },
      select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
    prisma.enseignant.findMany({
      where: { tenantId },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.emploiTemps.findMany({
      where: { tenantId },
      include: {
        matiere: { select: { nom: true, code: true, couleur: true } },
        classe: { select: { nom: true } },
        enseignant: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
    }),
  ]);

  return { classes, matieres, enseignants, emplois };
}

export default async function EmploiDuTempsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { classes, matieres, enseignants, emplois } = await getEmploiData(
    session.user.tenantId
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Emploi du temps"
        subtitle="Visualisation et configuration des créneaux horaires par classe"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <EmploiDuTempsView
          classes={classes}
          matieres={matieres}
          enseignants={enseignants}
          emplois={emplois}
          tenantId={session.user.tenantId}
        />
      </div>
    </div>
  );
}
