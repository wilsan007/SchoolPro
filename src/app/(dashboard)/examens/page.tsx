import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ExamensManager } from "@/components/examens/ExamensManager";
import { siteFilterForModel } from "@/lib/site-scope";

async function getExamensData(
  tenantId: string,
  examenFilter: Record<string, unknown>,
  classeFilter: Record<string, unknown>,
  matiereFilter: Record<string, unknown>
) {
  const [examens, classes, matieres] = await Promise.all([
    prisma.examen.findMany({
      where: { tenantId, ...examenFilter },
      include: { sessions: { orderBy: { date: "asc" } } },
      orderBy: { dateDebut: "desc" },
    }),
    prisma.classe.findMany({
      where: { tenantId, ...classeFilter },
      select: { id: true, nom: true, niveau: true },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...matiereFilter },
      select: { id: true, nom: true, code: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
  ]);
  return { examens, classes, matieres };
}

export default async function ExamensPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const f = (m: string) => siteFilterForModel(m, session.user);
  const { examens, classes, matieres } = await getExamensData(session.user.tenantId, f("examen"), f("classe"), f("matiere"));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Examens & Délibérations"
        subtitle="Programmation, convocations, résultats et délibérations"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <ExamensManager
          examens={examens}
          classes={classes}
          matieres={matieres}
          tenantId={session.user.tenantId}
        />
      </div>
    </div>
  );
}
