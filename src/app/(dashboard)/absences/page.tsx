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
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { guardPage } from "@/lib/guard-page";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

async function getAbsencesData(
  tenantId: string,
  claims: SessionSiteClaims,
  hierarchieClasseIds: string[],
  maintenant?: Date
) {
  const today = maintenant ?? (await getDemoNow());
  const sevenDaysAgo = subDays(today, 7);
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Le scope enseignant est déjà résolu via la hiérarchie : hierarchieClasseIds
  // contient exactement les classes accessibles (toutes pour un admin, les
  // classes affectées pour un enseignant).
  const absenceWhere = {
    tenantId,
    ...siteFilterForModel("absence", claims),
    ...(hierarchieClasseIds.length > 0
      ? { eleve: { classeId: { in: hierarchieClasseIds }, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) } }
      : { id: "__none__" }),
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

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const maintenant = await getDemoNow();

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));

  const data = await getAbsencesData(tenantId, claims, hierarchieClasseIds, maintenant);

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
            <Button asChild size="sm" variant="outline" className="gap-2 rounded-xl border-border hover:border-[#9b6fe0]/30 hover:bg-[#9b6fe0]/5 transition-all duration-200">
              <Link href="/absences/appel">
                <ClipboardCheck className="h-4 w-4" />
                {t("call")}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-2 bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#0284c7] hover:to-[#0369a1] rounded-xl shadow-[0_4px_12px_hsl(198_65%_46%/0.2)] hover:-translate-y-0.5 transition-all duration-200">
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
