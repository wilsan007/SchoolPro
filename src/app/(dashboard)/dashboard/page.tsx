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
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import type { Prisma } from "@prisma/client";

const getDashboardData = unstable_cache(
  async (tenantId: string, claims: SessionSiteClaims) => {
    const baseWhere = { tenantId, ...siteFilterForModel("eleve", claims), deletedAt: null } as Prisma.EleveWhereInput;
    const classeWhere = { tenantId, ...siteFilterForModel("classe", claims) } as Prisma.ClasseWhereInput;
    const absenceWhere = { tenantId, ...siteFilterForModel("absence", claims) } as Prisma.AbsenceWhereInput;
    const noteWhere = { tenantId, ...siteFilterForModel("note", claims) } as Prisma.NoteWhereInput;
    const examenWhere = { tenantId, ...siteFilterForModel("examen", claims) } as Prisma.ExamenWhereInput;

    const [
      eleveStats,
      totalClasses,
      absencesAujourdhui,
      absencesNonJustifiees,
      notesRecentes,
      prochainExamen,
    ] = await Promise.all([
      prisma.eleve.groupBy({
        by: ["statut"],
        where: baseWhere,
        _count: true,
      }),
      prisma.classe.count({ where: classeWhere }),
      prisma.absence.count({
        where: {
          ...absenceWhere,
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
      prisma.absence.count({
        where: { ...absenceWhere, statut: "INJUSTIFIEE" },
      }),
      prisma.note.findMany({
        where: noteWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          eleve: { select: { nom: true, prenom: true } },
          matiere: { select: { nom: true, couleur: true } },
        },
      }),
      prisma.examen.findFirst({
        where: { ...examenWhere, statut: "PROGRAMME", dateDebut: { gte: new Date() } },
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
  },
  ["dashboard-data"],
  { revalidate: 30, tags: ["dashboard-data"] }
);

export default async function DashboardPage() {
  const [session, t, locale] = await Promise.all([
    auth(),
    getTranslations("dashboard"),
    getLocale(),
  ]);

  if (session?.user?.role === "SUPER_ADMIN") {
    redirect("/super-admin");
  }

  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const [data, sites, anneeCourante] = await Promise.all([
    getDashboardData(tenantId, session.user),
    prisma.site.findMany({
      where: { tenantId, actif: true, deletedAt: null },
      select: { id: true, nom: true },
    }),
    getAnneeCouranteLibelle(tenantId),
  ]);

  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const currentSiteName = currentSiteId
    ? (sites.find((s) => s.id === currentSiteId)?.nom ?? "Site inconnu")
    : session.user.role === "TENANT_ADMIN" || (session.user.role as string) === "SUPER_ADMIN"
      ? "Tous les sites"
      : "Aucun site";

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
      label: t("title") === "Dashboard" ? "Absences today" : "Absences aujourd'hui",
      value: data.absencesAujourdhui.toString(),
      icon: "clipboard" as const,
      color: "orange" as const,
      change: `${data.absencesNonJustifiees}`,
      changePositive: data.absencesNonJustifiees === 0,
    },
    {
      label: t("title") === "Dashboard" ? "Next exam" : "Prochain examen",
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
        subtitle={`${t("welcome")} ${session.user.name?.split(" ")[0]} 👋 — ${new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}`}
        site={currentSiteName}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* KPI Cards */}
        <DashboardStats stats={stats} />

        {/* Grille principale */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Graphique absences */}
          <div className="lg:col-span-2">
            <AbsenceChart tenantId={session.user.tenantId} />
          </div>

          {/* Actions rapides */}
          <QuickActions />
        </div>

        {/* Activité récente */}
        <RecentActivity notes={data.notesRecentes} />
      </div>
    </div>
  );
}
