import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { VieScolaireView } from "@/components/vie-scolaire/VieScolaireView";

async function getVieScolaireData(tenantId: string) {
  const [incidents, eleves, classes] = await Promise.all([
    prisma.incident.findMany({
      where: { tenantId },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.eleve.findMany({
      where: { tenantId, statut: "ACTIF" },
      select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return { incidents, eleves, classes };
}

export default async function VieScolairePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { incidents, eleves, classes } = await getVieScolaireData(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Vie Scolaire & Discipline"
        subtitle="Incidents, sanctions, comportement et suivi élèves"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <VieScolaireView
          incidents={incidents}
          eleves={eleves}
          classes={classes}
          currentUserId={session.user.id}
          tenantId={session.user.tenantId}
        />
      </div>
    </div>
  );
}
