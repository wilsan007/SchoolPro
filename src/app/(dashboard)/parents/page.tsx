import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ParentsView } from "@/components/parents/ParentsView";

async function getParentsData(tenantId: string) {
  const parents = await prisma.parent.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true } },
      enfants: {
        include: {
          eleve: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              matricule: true,
              statut: true,
              classe: { select: { nom: true, niveau: true } },
              absences: { select: { id: true }, where: { statut: "INJUSTIFIEE" } },
              notes: { select: { valeur: true, noteMax: true, coefficient: true }, where: { isPubliee: true } },
              bulletins: { select: { moyenneGenerale: true, isPublie: true }, orderBy: { createdAt: "desc" }, take: 3 },
            },
          },
        },
      },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  return { parents };
}

export default async function ParentsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { parents: rawParents } = await getParentsData(session.user.tenantId);

  // Mapper 'enfants' (relation Prisma) → 'eleves' (prop attendue par ParentsView)
  const parents = rawParents.map((p) => ({
    ...p,
    eleves: p.enfants ?? [],
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Espace Parents (ENT)"
        subtitle="Gestion des comptes parents, accès ENT, communication famille"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <ParentsView parents={parents} tenantId={session.user.tenantId} />
      </div>
    </div>
  );
}
