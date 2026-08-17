import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { AppelInterface } from "@/components/absences/AppelInterface";
import { guardPage } from "@/lib/guard-page";

async function getClasses(tenantId: string, claims: SessionSiteClaims) {
  return prisma.classe.findMany({
    where: { tenantId, ...siteFilterForModel("classe", claims) },
    include: {
      eleves: {
        where: { statut: "ACTIF", ...siteFilterForModel("eleve", claims) },
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
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await getClasses(session.user.tenantId, session.user);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Faire l'appel"
        subtitle={`${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <AppelInterface classes={classes} tenantId={session.user.tenantId} />
      </div>
    </div>
  );
}
