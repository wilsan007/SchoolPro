import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel, personalScopeFilter, mergeFilters } from "@/lib/site-scope";
import type { Prisma } from "@prisma/client";
import { getDemoNow } from "@/lib/demo-now";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  // Périmètre de site ET périmètre personnel. Le filtre de site employé seul
  // renvoie `{}` pour PARENT / STUDENT (`resolveSiteScope` → `RELATION`) : le
  // graphique agrégeait alors les absences de TOUT le tenant sur 8 semaines.
  // `mergeFilters` est obligatoire ici : les deux fragments encapsulent leurs
  // prédicats dans `AND`, un étalement écraserait le premier.
  const scopeFilter = mergeFilters(
    siteFilterForModel("absence", session.user),
    personalScopeFilter(session.user, "eleve")
  );

  // Filtre année scolaire courante pour ne pas mélanger les absences
  // de plusieurs années dans le graphique.
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const anneeEleve = anneeCourante ? { eleve: { classe: { annee: anneeCourante } } } : {};

  // Date simulée par la machine à remonter le temps (cookie demo-now).
  const now = await getDemoNow();
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const absences = await prisma.absence.findMany({
    where: mergeFilters({ tenantId, date: { gte: eightWeeksAgo, lte: now }, ...anneeEleve }, scopeFilter) as unknown as Prisma.AbsenceWhereInput,
    select: {
      date: true,
      statut: true,
      isRetard: true,
    },
  });

  // Grouper par semaine
  const semaines: Record<string, { justifiees: number; injustifiees: number; retards: number }> = {};
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `S${8 - i}`;
    semaines[key] = { justifiees: 0, injustifiees: 0, retards: 0 };
  }

  absences.forEach((a) => {
    const diffDays = Math.floor((now.getTime() - a.date.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = 7 - Math.floor(diffDays / 7);
    if (weekIndex >= 0 && weekIndex <= 7) {
      const key = `S${weekIndex + 1}`;
      if (!semaines[key]) semaines[key] = { justifiees: 0, injustifiees: 0, retards: 0 };

      if (a.isRetard) {
        semaines[key].retards++;
      } else if (a.statut === "JUSTIFIEE") {
        semaines[key].justifiees++;
      } else if (a.statut === "INJUSTIFIEE" || a.statut === "EN_ATTENTE") {
        semaines[key].injustifiees++;
      }
    }
  });

  const data = Object.entries(semaines).map(([semaine, vals]) => ({
    semaine,
    ...vals,
  }));

  return NextResponse.json({ data });
}
