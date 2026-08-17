import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AbsenceChart } from "@/components/dashboard/AbsenceChart";
import { getTranslations, getLocale } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { isRelationScopedRole } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { guardPage } from "@/lib/guard-page";
import { accueilPourRole } from "@/lib/accueil-par-role";
import {
  buildDashboardWheres,
  dashboardCacheKey,
  type DashboardScopeClaims,
} from "./dashboard-scope";
import { getDemoNow } from "@/lib/demo-now";

async function fetchDashboardData(
  tenantId: string,
  claims: DashboardScopeClaims,
  maintenant: Date
) {
  const wheres = buildDashboardWheres(tenantId, claims);
  // Les filtres `where` sont construits par `buildDashboardWheres` (dans
  // `dashboard-scope.ts`), qui combine `siteFilterForModel` + `personalScopeFilter`
  // pour chaque modèle. Le linter `ecolpro/require-site-filter` ne remonte pas
  // l'appel depuis un autre fichier : on désactive donc la règle sur ce bloc.

  // Bornes du « jour courant » selon la date simulée.
  const debutJour = new Date(maintenant);
  debutJour.setHours(0, 0, 0, 0);
  const finJour = new Date(maintenant);
  finJour.setHours(23, 59, 59, 999);

  const [
    eleveStats,
    totalClasses,
    absencesAujourdhui,
    absencesNonJustifiees,
    notesRecentes,
    prochainExamen,
  ] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    prisma.eleve.groupBy({
      by: ["statut"],
      where: wheres.eleve,
      _count: true,
    }),
    // Inutile d'interroger la base pour un périmètre relationnel : le filtre
    // est de toute façon fail-closed (cf. `buildDashboardWheres`).
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    wheres.relationScoped ? Promise.resolve(0) : prisma.classe.count({ where: wheres.classe }),
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    prisma.absence.count({
      where: {
        ...wheres.absence,
        date: {
          gte: debutJour,
          lt: finJour,
        },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    prisma.absence.count({
      where: { ...wheres.absence, statut: "INJUSTIFIEE" },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    prisma.note.findMany({
      where: wheres.note,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        eleve: { select: { nom: true, prenom: true } },
        matiere: { select: { nom: true, couleur: true } },
      },
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
    wheres.relationScoped
      ? Promise.resolve(null)
      // eslint-disable-next-line ecolpro/require-site-filter -- filtre via buildDashboardWheres
      : prisma.examen.findFirst({
          where: { ...wheres.examen, statut: "PROGRAMME", dateDebut: { gte: maintenant } },
          orderBy: { dateDebut: "asc" },
        }),
  ]);

  const statutMap = Object.fromEntries(eleveStats.map((s) => [s.statut, s._count]));
  const totalEleves = Object.values(statutMap).reduce((a, b) => a + b, 0);

  return {
    totalEleves,
    totalElevesActifs: statutMap["ACTIF"] ?? 0,
    totalClasses,
    absencesAujourdhui,
    absencesNonJustifiees,
    notesRecentes,
    prochainExamen,
  };
}

const getCachedDashboardData = unstable_cache(
  // Le premier argument ne sert qu'à la clé de cache (cf. `dashboardCacheKey`).
  // `maintenant` est sérialisé dans la clé pour invalider le cache quand la
  // date simulée change (sinon la machine à remonter le temps afficherait des
  // données périmées).
  async (
    scopeKey: string,
    tenantId: string,
    claims: DashboardScopeClaims,
    maintenantKey: string
  ) => {
    void scopeKey;
    return fetchDashboardData(tenantId, claims, new Date(maintenantKey));
  },
  ["dashboard-data"],
  { revalidate: 30, tags: ["dashboard-data"] }
);

async function getDashboardData(
  tenantId: string,
  claims: DashboardScopeClaims,
  maintenant: Date
) {
  // Aucune mise en cache pour les périmètres personnels : les données sont
  // nominatives et propres à une famille, on refuse de les faire transiter par
  // un cache partagé (ceinture et bretelles, en plus de la clé explicite).
  if (isRelationScopedRole(claims.role)) {
    return fetchDashboardData(tenantId, claims, maintenant);
  }
  return getCachedDashboardData(
    dashboardCacheKey(tenantId, claims),
    tenantId,
    claims,
    maintenant.toISOString()
  );
}

export default async function DashboardPage() {
  const [session, t, tc, locale] = await Promise.all([
    auth(),
    getTranslations("dashboard"),
    getTranslations("common"),
    getLocale(),
  ]);

  // Aiguillage par rôle. L'ordre est important :
  //  1. `guardPage` d'abord : un visiteur non authentifié doit partir vers
  //     `/login` (et un compte sans tenant vers `/select-tenant`), pas vers un
  //     espace applicatif ;
  //  2. la redirection ensuite, AVANT toute requête Prisma : inutile de payer
  //     six requêtes pour une page qu'on ne rendra pas.
  // `redirect()` lève `NEXT_REDIRECT` : jamais dans un try/catch.
  await guardPage(session);
  // L'aiguillage précède le contrôle de `tenantId` : un SUPER_ADMIN n'a pas de
  // tenant actif et doit partir vers `/super-admin`, pas vers `/login`.
  const accueil = accueilPourRole(session?.user?.role);
  if (accueil) {
    redirect(accueil);
  }

  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const maintenant = await getDemoNow();
  const [data, sites, anneeCourante] = await Promise.all([
    getDashboardData(tenantId, session.user, maintenant),
    prisma.site.findMany({
      where: { tenantId, actif: true, deletedAt: null },
      select: { id: true, nom: true },
    }),
    getAnneeCouranteLibelle(tenantId),
  ]);

  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const currentSiteName = currentSiteId
    ? (sites.find((s) => s.id === currentSiteId)?.nom ?? tc("unknownSite"))
    : session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN"
      ? tc("allSites")
      : tc("noSite");

  const stats = [
    {
      label: t("totalStudents"),
      value: data.totalElevesActifs.toString(),
      total: data.totalEleves,
      icon: "users" as const,
      color: "violet" as const,
      change: "+3",
      changePositive: true,
    },
    {
      label: t("totalClasses"),
      value: data.totalClasses.toString(),
      icon: "school" as const,
      color: "blue" as const,
      change: anneeCourante ?? "—",
    },
    {
      label: t("absencesToday"),
      value: data.absencesAujourdhui.toString(),
      icon: "clipboard" as const,
      color: "orange" as const,
      change: `${data.absencesNonJustifiees}`,
      changePositive: data.absencesNonJustifiees === 0,
    },
    {
      label: t("nextExam"),
      value: data.prochainExamen
        ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" }).format(data.prochainExamen.dateDebut)
        : (locale === "en" ? "None" : "Aucun"),
      icon: "graduation" as const,
      color: "green" as const,
      change: data.prochainExamen?.intitule ?? "",
    },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={`${t("welcome")} ${session.user.name?.split(" ")[0]} 👋 — ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(maintenant)}`}
        site={currentSiteName}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {/* KPI Cards */}
        <DashboardStats stats={stats} />

        {/* Grille principale */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Graphique absences */}
          <div className="lg:col-span-2">
            <AbsenceChart tenantId={session.user.tenantId} />
          </div>

          {/* Actions rapides */}
          <QuickActions role={session.user.role} />
        </div>

        {/* Activité récente */}
        <RecentActivity notes={data.notesRecentes} />
      </div>
    </div>
  );
}
