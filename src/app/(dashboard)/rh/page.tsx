import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RHView } from "@/components/rh/RHView";
import { getTranslations } from "next-intl/server";

async function getEnseignantsRH(tenantId: string) {
  const enseignants = await prisma.enseignant.findMany({
    where: { tenantId },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, avatarUrl: true,
          phone: true, isActive: true, lastLoginAt: true,
        },
      },
      ficheRH: {
        include: {
          bulletinsPaie: {
            orderBy: [{ annee: "desc" }, { mois: "desc" }],
            take: 3,
          },
        },
      },
      emploiTemps: {
        select: {
          jour: true, heureDebut: true, heureFin: true,
          matiere: { select: { nom: true, couleur: true } },
          classe: { select: { nom: true } },
        },
      },
      classesPrincipales: {
        select: { id: true, nom: true, niveau: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  return { enseignants };
}

export default async function RHPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("rh"),
  ]);
  if (!session?.user?.tenantId) redirect("/login");

  const { enseignants } = await getEnseignantsRH(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <RHView enseignants={enseignants} />
      </div>
    </div>
  );
}
