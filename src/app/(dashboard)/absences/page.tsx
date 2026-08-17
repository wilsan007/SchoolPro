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
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { siteFilterForModel } from "@/lib/site-scope";
import { guardPage } from "@/lib/guard-page";
import { getDemoNow } from "@/lib/demo-now";

async function getAbsencesData(
  tenantId: string,
  siteFilter: Record<string, unknown>,
  classeFilter?: { classeIds: string[]; isRestricted: boolean },
  maintenant?: Date
) {
  const today = maintenant ?? (await getDemoNow());
  const sevenDaysAgo = subDays(today, 7);

  const absenceWhere = {
    tenantId,
    ...siteFilter,
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
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const siteFilter = siteFilterForModel("absence", session.user);
  const classeFilter = isTeacherRole(session.user.role)
    ? await getTeacherScope(session.user.tenantId, session.user.id, session.user.role)
    : undefined;

  const data = await getAbsencesData(session.user.tenantId, siteFilter, classeFilter);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        {/* En-tête actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <AbsencesStats
            auJourdhui={data.absencesAujourdhui}
            semaine={data.absencesSemaine}
            nonJustifiees={data.absencesNonJustifiees}
          />
          <div className="flex gap-2 w-full sm:w-auto">
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
