import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { GouvernanceView } from "@/components/gouvernance/GouvernanceView";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

export default async function GouvernancePage() {
  const session = await auth();
  await guardPage(session, "gouvernance:read");
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims;
  const canWrite = session.user.role === "SUPER_ADMIN"
    || session.user.role === "TENANT_ADMIN"
    || session.user.role === "PRINCIPAL";

  const conseils = await prisma.conseil.findMany({
    where: { tenantId, ...siteFilterForModel("conseil", claims) },
    include: {
      membres: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { role: "asc" },
      },
      reunions: {
        orderBy: { date: "desc" },
      },
      resolutions: {
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { reunions: true, resolutions: true },
      },
    },
    orderBy: { nom: "asc" },
  });

  // Sérialisation : les dates DateTime de Prisma doivent devenir des chaînes
  // ISO pour traverser la frontière server → client.
  const serialized = conseils.map((c) => ({
    id: c.id,
    nom: c.nom,
    type: c.type,
    description: c.description,
    frequence: c.frequence,
    membres: c.membres.map((m) => ({
      id: m.id,
      role: m.role,
      nomExterne: m.nomExterne,
      debutMandat: m.debutMandat?.toISOString() ?? null,
      finMandat: m.finMandat?.toISOString() ?? null,
      user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
    })),
    reunions: c.reunions.map((r) => ({
      id: r.id,
      titre: r.titre,
      date: r.date.toISOString(),
      lieu: r.lieu,
      ordreDuJour: r.ordreDuJour,
      statut: r.statut,
      compteRendu: r.compteRendu,
    })),
    resolutions: c.resolutions.map((res) => ({
      id: res.id,
      titre: res.titre,
      description: res.description,
      statut: res.statut,
      dateVote: res.dateVote?.toISOString() ?? null,
      resultats: res.resultats as { pour: number; contre: number; abstentions: number } | null,
      dateEffet: res.dateEffet?.toISOString() ?? null,
    })),
    _count: c._count,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Gouvernance"
        subtitle="Conseils, réunions et résolutions"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <GouvernanceView conseils={serialized} canWrite={canWrite} />
      </div>
    </div>
  );
}
