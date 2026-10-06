import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { Header } from "@/components/layout/Header";
import { AppelInterface } from "@/components/absences/AppelInterface";
import { guardPage } from "@/lib/guard-page";
import { roleHasPermission } from "@/lib/permissions";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";
import { getClassesHierarchie, type ClassesHierarchie } from "@/lib/classes-hierarchie";
import { FENETRE_JOURS } from "@/lib/absences/signal-absenteisme";

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

/**
 * Absences et retards injustifiés des 30 derniers jours, par élève.
 *
 * L'enseignant voit ainsi, AVANT de saisir, quels élèves décrochent déjà —
 * l'information existait en base et dans les alertes aux parents, mais pas à
 * l'endroit et au moment où elle sert. Une seule agrégation pour tout l'écran.
 */
async function getSignauxAbsenteisme(
  tenantId: string,
  claims: SessionSiteClaims,
  classeIds: string[],
  maintenant: Date
): Promise<Record<string, { absences: number; retards: number }>> {
  if (classeIds.length === 0) return {};
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURS * 86_400_000);

  // La fenêtre glissante de 30 jours borne déjà le périmètre temporel : un
  // filtre d'année scolaire en plus ne changerait rien au résultat.
  // eslint-disable-next-line ecolpro/require-annee-filter -- fenêtre de dates explicite
  const lignes = await prisma.absence.groupBy({
    by: ["eleveId", "isRetard"],
    where: {
      tenantId,
      ...siteFilterForModel("absence", claims),
      motif: "INJUSTIFIE",
      date: { gte: depuis, lte: maintenant },
      eleve: { classeId: { in: classeIds } },
    },
    _count: { _all: true },
  });

  const signaux: Record<string, { absences: number; retards: number }> = {};
  for (const ligne of lignes) {
    const courant = signaux[ligne.eleveId] ?? { absences: 0, retards: 0 };
    if (ligne.isRetard) courant.retards += ligne._count._all;
    else courant.absences += ligne._count._all;
    signaux[ligne.eleveId] = courant;
  }
  return signaux;
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
  const classeIds = classes.map((c) => c.id);
  const [creneaux, signaux] = await Promise.all([
    getCreneauxEdt(session.user.tenantId, session.user, classeIds, anneeCourante),
    getSignauxAbsenteisme(session.user.tenantId, session.user, classeIds, maintenant),
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
        <AppelInterface
          classes={classes}
          tenantId={session.user.tenantId}
          hierarchie={hierarchie}
          creneauxEdt={creneaux}
          signauxAbsenteisme={signaux}
          maintenantISO={maintenant.toISOString()}
          // `absences:read` ouvre cet écran (l'assiduité est le dossier de suivi
          // de plusieurs rôles) ; seule `absences:write` autorise la saisie.
          // La même permission décide ici de l'affichage et dans
          // `/api/absences/appel` de l'enregistrement.
          canWrite={roleHasPermission(session.user.role, "absences:write")}
        />
      </div>
    </div>
  );
}
