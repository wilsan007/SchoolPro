import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AbsenceChart } from "@/components/dashboard/AbsenceChart";

async function getDashboardData(tenantId: string) {
  const [
    totalEleves,
    totalElevesActifs,
    totalClasses,
    absencesAujourdhui,
    absencesNonJustifiees,
    notesRecentes,
    prochainExamen,
  ] = await Promise.all([
    prisma.eleve.count({ where: { tenantId } }),
    prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } }),
    prisma.classe.count({ where: { tenantId } }),
    prisma.absence.count({
      where: {
        tenantId,
        date: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    prisma.absence.count({
      where: { tenantId, statut: "INJUSTIFIEE" },
    }),
    prisma.note.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        eleve: { select: { nom: true, prenom: true } },
        matiere: { select: { nom: true, couleur: true } },
      },
    }),
    prisma.examen.findFirst({
      where: { tenantId, statut: "PROGRAMME", dateDebut: { gte: new Date() } },
      orderBy: { dateDebut: "asc" },
    }),
  ]);

  return {
    totalEleves,
    totalElevesActifs,
    totalClasses,
    absencesAujourdhui,
    absencesNonJustifiees,
    notesRecentes,
    prochainExamen,
  };
}

export default async function DashboardPage() {
  const session = await auth();

  if (session?.user?.role === "SUPER_ADMIN") {
    redirect("/super-admin");
  }

  if (!session?.user?.tenantId) redirect("/login");

  const data = await getDashboardData(session.user.tenantId);

  const stats = [
    {
      label: "Élèves inscrits",
      value: data.totalElevesActifs.toString(),
      total: data.totalEleves,
      icon: "users" as const,
      color: "violet" as const,
      change: "+3 ce mois",
      changePositive: true,
    },
    {
      label: "Classes actives",
      value: data.totalClasses.toString(),
      icon: "school" as const,
      color: "blue" as const,
      change: "Année 2025-2026",
    },
    {
      label: "Absences aujourd'hui",
      value: data.absencesAujourdhui.toString(),
      icon: "clipboard" as const,
      color: "orange" as const,
      change: `${data.absencesNonJustifiees} non justifiées`,
      changePositive: data.absencesNonJustifiees === 0,
    },
    {
      label: "Prochain examen",
      value: data.prochainExamen
        ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(data.prochainExamen.dateDebut)
        : "Aucun",
      icon: "graduation" as const,
      color: "green" as const,
      change: data.prochainExamen?.intitule ?? "Rien de planifié",
    },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Tableau de bord"
        subtitle={`Bonjour ${session.user.name?.split(" ")[0]} 👋 — ${new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}`}
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
