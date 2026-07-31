import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { AbsencesStats } from "@/components/absences/AbsencesStats";
import { AbsencesList } from "@/components/absences/AbsencesList";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { getTranslations } from "next-intl/server";

async function getTeacherClassIds(tenantId: string, userId: string): Promise<{ classeIds: string[]; isRestricted: boolean }> {
  const enseignant = await prisma.enseignant.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!enseignant) return { classeIds: [], isRestricted: false };

  const [emploiClasses, principalClasses] = await Promise.all([
    prisma.emploiTemps.findMany({
      where: { enseignantId: enseignant.id, tenantId },
      select: { classeId: true },
      distinct: ["classeId"],
    }),
    prisma.classe.findMany({
      where: { profPrincipalId: enseignant.id, tenantId },
      select: { id: true },
    }),
  ]);

  const classeIds = Array.from(new Set([
    ...emploiClasses.map((e) => e.classeId),
    ...principalClasses.map((c) => c.id),
  ]));

  return { classeIds, isRestricted: true };
}

async function getAbsencesData(
  tenantId: string,
  classeFilter?: { classeIds: string[]; isRestricted: boolean }
) {
  const today = new Date();
  const sevenDaysAgo = subDays(today, 7);

  const absenceWhere = {
    tenantId,
    ...(classeFilter?.isRestricted && classeFilter.classeIds.length > 0
      ? { eleve: { classeId: { in: classeFilter.classeIds } } }
      : classeFilter?.isRestricted
        ? { id: "__none__" }
        : {}),
  };

  const [absenceStats, recentesAbsences] = await Promise.all([
    prisma.absence.groupBy({
      by: ["statut"],
      where: { ...absenceWhere, date: { gte: sevenDaysAgo } },
      _count: true,
    }),
    prisma.absence.findMany({
      where: absenceWhere,
      orderBy: { date: "desc" },
      take: 50,
      include: {
        eleve: {
          select: {
            nom: true,
            prenom: true,
            photoUrl: true,
            classe: { select: { nom: true, niveau: true } },
          },
        },
      },
    }),
  ]);

  const statutMap = Object.fromEntries(absenceStats.map((s) => [s.statut, s._count]));
  const absencesSemaine = Object.values(statutMap).reduce((a, b) => a + b, 0);

  const absencesAujourdhui = recentesAbsences.filter(
    (a) => a.date >= startOfDay(today) && a.date <= endOfDay(today)
  ).length;

  return {
    absencesAujourdhui,
    absencesSemaine,
    absencesNonJustifiees: statutMap["INJUSTIFIEE"] ?? 0,
    recentesAbsences,
  };
}

export default async function AbsencesPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("absences"),
  ]);
  if (!session?.user?.tenantId) redirect("/login");
  const isTeacher = session.user.role === "TEACHER" || session.user.role === "CLASS_TEACHER";
  const classeFilter = isTeacher
    ? await getTeacherClassIds(session.user.tenantId, session.user.id)
    : undefined;

  const data = await getAbsencesData(session.user.tenantId, classeFilter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* En-tête actions */}
        <div className="flex items-center justify-between">
          <AbsencesStats
            auJourdhui={data.absencesAujourdhui}
            semaine={data.absencesSemaine}
            nonJustifiees={data.absencesNonJustifiees}
          />
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href="/absences/appel">
                <ClipboardCheck className="h-4 w-4" />
                {t("call")}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link href="/absences">
                <Plus className="h-4 w-4" />
                {t("addAbsence")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Liste des absences */}
        <AbsencesList absences={data.recentesAbsences} />
      </div>
    </div>
  );
}
