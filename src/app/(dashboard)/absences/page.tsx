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

async function getAbsencesData(tenantId: string) {
  const today = new Date();
  const sevenDaysAgo = subDays(today, 7);

  const [absencesAujourdhui, absencesSemaine, absencesNonJustifiees, recentesAbsences] =
    await Promise.all([
      prisma.absence.count({
        where: {
          tenantId,
          date: { gte: startOfDay(today), lte: endOfDay(today) },
        },
      }),
      prisma.absence.count({
        where: { tenantId, date: { gte: sevenDaysAgo } },
      }),
      prisma.absence.count({
        where: { tenantId, statut: "INJUSTIFIEE" },
      }),
      prisma.absence.findMany({
        where: { tenantId },
        orderBy: { date: "desc" },
        take: 30,
        include: {
          eleve: {
            select: {
              nom: true,
              prenom: true,
              photoUrl: true,
              classe: { select: { nom: true } },
            },
          },
        },
      }),
    ]);

  return { absencesAujourdhui, absencesSemaine, absencesNonJustifiees, recentesAbsences };
}

export default async function AbsencesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const data = await getAbsencesData(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Gestion des Absences"
        subtitle="Suivi et justification des absences élèves"
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
                Faire l'appel
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link href="/absences">
                <Plus className="h-4 w-4" />
                Saisir absence
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
