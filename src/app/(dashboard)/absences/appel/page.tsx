import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { AppelInterface } from "@/components/absences/AppelInterface";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";

async function getClasses(tenantId: string, claims: SessionSiteClaims, hierarchieClasseIds: string[]) {
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilterForModel spread
  return prisma.classe.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("classe", claims),
      ...(anneeCourante ? { annee: anneeCourante } : {}),
      ...(hierarchieClasseIds.length > 0 ? { id: { in: hierarchieClasseIds } } : {}),
    },
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

  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  // Hiérarchie des classes avec scope enseignant + site + année intégrés.
  const hierarchie = await getClassesHierarchie(session.user.tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const [classes, maintenant] = await Promise.all([
    getClasses(session.user.tenantId, session.user, hierarchieClasseIds),
    getDemoNow(),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Faire l'appel"
        subtitle={`${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(maintenant)}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <AppelInterface classes={classes} tenantId={session.user.tenantId} hierarchie={hierarchie} />
      </div>
    </div>
  );
}
