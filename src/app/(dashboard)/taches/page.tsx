import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { Header } from "@/components/layout/Header";
import { TaskTimeline, type TacheData } from "@/components/taches/TaskTimeline";
import { guardPage } from "@/lib/guard-page";
import { synchroniserTachesAuto } from "@/lib/tache-engine";
import { getDemoNow } from "@/lib/demo-now";
import { isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";

export default async function TachesPage() {
  const session = await auth();
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const role = session.user.role as Role;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const maintenant = await getDemoNow();

  // Auto-sync silencieux : régénère les tâches depuis l'état du système.
  // Erreurs non bloquantes — la page affiche les tâches existantes.
  try {
    await synchroniserTachesAuto(tenantId, session.user);
  } catch (e) {
    console.error("[Taches page] Auto-sync échoué:", e);
  }

  // Les enseignants voient leurs tâches ; la direction voit toutes les tâches.
  const voirMesTaches = isTeacherRole(role) || role === "PARENT" || role === "ACCOUNTANT";
  const filterAssignee = voirMesTaches ? session.user.id : undefined;

  const [taches, users] = await Promise.all([
    prisma.tache.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("tache", session.user),
        ...(filterAssignee ? { assigneeAId: filterAssignee } : {}),
        ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
      },
      include: {
        assigneeA: { select: { id: true, name: true, email: true } },
        creePar: { select: { id: true, name: true } },
        classe: { select: { id: true, nom: true } },
        matiere: { select: { id: true, nom: true } },
      },
      orderBy: [
        { statut: "asc" },
        { echeance: "asc" },
        { priorite: "desc" },
        { createdAt: "desc" },
      ],
      take: 300,
    }),
    prisma.user.findMany({
      where: { tenantId, ...siteFilterForModel("user", session.user) },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized: TacheData[] = taches.map((t) => ({
    id: t.id,
    titre: t.titre,
    description: t.description,
    type: t.type,
    priorite: t.priorite,
    statut: t.statut,
    echeance: t.echeance?.toISOString() ?? null,
    dateFaite: t.dateFaite?.toISOString() ?? null,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
    assigneeA: t.assigneeA,
    creePar: t.creePar,
    classe: t.classe,
    matiere: t.matiere,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Tâches"
        subtitle="Suivi des tâches assignées et à accomplir"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <div className="max-w-4xl mx-auto">
          <TaskTimeline
            taches={serialized}
            maintenant={maintenant.toISOString()}
            showSync
            showCreate={!isTeacherRole(role)}
            users={users}
          />
        </div>
      </div>
    </div>
  );
}
