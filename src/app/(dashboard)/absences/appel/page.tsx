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

/**
 * Créneaux de l'emploi du temps des classes affichées, pour proposer l'appel
 * par créneau. Le filtrage par période se fait côté client, selon le jour choisi.
 */
async function getCreneauxEdt(tenantId: string, claims: SessionSiteClaims, classeIds: string[], anneeCourante: string | null) {
  if (classeIds.length === 0) return [];
  const rows = await prisma.emploiTemps.findMany({
    where: {
      tenantId,
      classeId: { in: classeIds },
      ...siteFilterForModel("emploiTemps", claims),
      ...(anneeCourante ? { annee: anneeCourante } : {}),
    },
    select: {
      classeId: true, jour: true, heureDebut: true, heureFin: true, salle: true,
      matiere: { select: { nom: true } },
      periode: { select: { dateDebut: true, dateFin: true } },
    },
    orderBy: { heureDebut: "asc" },
  });
  return rows.map((r) => ({
    classeId: r.classeId,
    jour: r.jour,
    heureDebut: r.heureDebut,
    heureFin: r.heureFin,
    salle: r.salle,
    matiere: r.matiere.nom,
    periodeDebut: r.periode?.dateDebut.toISOString().slice(0, 10) ?? null,
    periodeFin: r.periode?.dateFin.toISOString().slice(0, 10) ?? null,
  }));
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
  const creneaux = await getCreneauxEdt(session.user.tenantId, session.user, classes.map((c) => c.id), anneeCourante);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Faire l'appel"
        subtitle={`${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(maintenant)}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <AppelInterface
          classes={classes}
          tenantId={session.user.tenantId}
          hierarchie={hierarchie}
          creneauxEdt={creneaux}
          maintenantISO={maintenant.toISOString()}
        />
      </div>
    </div>
  );
}
