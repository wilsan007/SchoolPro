import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { Header } from "@/components/layout/Header";
import { TachesView } from "@/components/taches/TachesView";
import { guardPage } from "@/lib/guard-page";

export default async function TachesPage() {
  const session = await auth();
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  const [taches, users] = await Promise.all([
    prisma.tache.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("tache", session.user),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      include: {
        assigneeA: { select: { id: true, name: true, email: true } },
        creePar: { select: { id: true, name: true } },
        classe: { select: { id: true, nom: true } },
        matiere: { select: { id: true, nom: true } },
      },
      orderBy: [
        { statut: "asc" },
        { echeance: "asc" },
        { createdAt: "desc" },
      ],
      take: 200,
    }),
    prisma.user.findMany({
      where: { tenantId, ...siteFilterForModel("user", session.user) },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    description: t.description,
    type: t.type,
    priorite: t.priorite,
    statut: t.statut,
    echeance: t.echeance?.toISOString() ?? null,
    dateFaite: t.dateFaite?.toISOString() ?? null,
    assigneeA: t.assigneeA,
    creePar: t.creePar,
    classe: t.classe,
    matiere: t.matiere,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Tâches"
        subtitle="Suivi des tâches assignées et à accomplir"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <TachesView taches={serialized} users={users} />
      </div>
    </div>
  );
}
