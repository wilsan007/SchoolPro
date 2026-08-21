import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { MentoratView } from "@/components/mentorat/MentoratView";
import { guardPage } from "@/lib/guard-page";

export default async function MentoratPage() {
  const session = await auth();
  await guardPage(session, "mentorat:read");
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const canWrite = session.user.role === "SUPER_ADMIN"
    || session.user.role === "TENANT_ADMIN"
    || session.user.role === "PRINCIPAL"
    || session.user.role === "CLASS_TEACHER"
    || session.user.role === "COUNSELOR";

  const mentorats = await prisma.mentorat.findMany({
    where: { tenantId },
    include: {
      mentor: { select: { id: true, name: true, email: true } },
      mentore: { select: { id: true, name: true, email: true } },
      objectifs: { orderBy: { priorite: "asc" } },
      seances: { orderBy: { date: "desc" }, take: 5 },
      _count: { select: { objectifs: true, seances: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = mentorats.map((m) => ({
    id: m.id,
    type: m.type,
    statut: m.statut,
    frequence: m.frequence,
    notes: m.notes,
    dateDebut: m.dateDebut.toISOString(),
    dateFin: m.dateFin?.toISOString() ?? null,
    mentor: m.mentor,
    mentore: m.mentore,
    objectifs: m.objectifs.map((o) => ({
      id: o.id,
      titre: o.titre,
      description: o.description,
      statut: o.statut,
      priorite: o.priorite,
      progression: o.progression,
      dateCible: o.dateCible?.toISOString() ?? null,
    })),
    seances: m.seances.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      duree: s.duree,
      statut: s.statut,
      compteRendu: s.compteRendu,
      lieu: s.lieu,
    })),
    _count: m._count,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Mentorat"
        subtitle="Accompagnement des élèves et du personnel"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <MentoratView mentorats={serialized} canWrite={canWrite} />
      </div>
    </div>
  );
}
