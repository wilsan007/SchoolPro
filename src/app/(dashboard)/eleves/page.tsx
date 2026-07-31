import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ElevesTable } from "@/components/eleves/ElevesTable";
import { ElevesStats } from "@/components/eleves/ElevesStats";
import { ElevesActions } from "@/components/eleves/ElevesActions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { ImportElevesButton } from "@/components/eleves/ImportElevesButton";

const getElevesStats = unstable_cache(
  async (tenantId: string) => {
    const [byStatut, bySexe, byRegime, totalTenant] = await Promise.all([
      prisma.eleve.groupBy({
        by: ["statut"],
        where: { tenantId },
        _count: true,
      }),
      prisma.eleve.groupBy({
        by: ["sexe"],
        where: { tenantId },
        _count: true,
      }),
      prisma.eleve.groupBy({
        by: ["regime"],
        where: { tenantId },
        _count: true,
      }),
      prisma.eleve.count({ where: { tenantId } }),
    ]);

    const statutMap = Object.fromEntries(byStatut.map((s) => [s.statut, s._count]));
    const sexeMap = Object.fromEntries(bySexe.map((s) => [s.sexe, s._count]));
    const regimeMap = Object.fromEntries(byRegime.map((r) => [r.regime ?? "autre", r._count]));

    return {
      total: totalTenant,
      actifs: statutMap["ACTIF"] ?? 0,
      filles: sexeMap["F"] ?? 0,
      garcons: sexeMap["M"] ?? 0,
      internes: regimeMap["interne"] ?? 0,
    };
  },
  ["eleves-stats"],
  { revalidate: 60, tags: ["eleves-stats"] }
);

const getClassesList = unstable_cache(
  async (tenantId: string) => {
    const classes = await prisma.classe.findMany({
      where: { tenantId },
      select: { nom: true },
      orderBy: { nom: "asc" },
    });
    return Array.from(new Set(classes.map((c) => c.nom)));
  },
  ["classes-list"],
  { revalidate: 300, tags: ["classes-list"] }
);

async function getElevesData(
  tenantId: string,
  filters: { q?: string; classeId?: string; statut?: string }
) {
  const where = {
    tenantId,
    ...(filters.classeId && { classeId: filters.classeId }),
    ...(filters.statut && { statut: filters.statut as "ACTIF" }),
    ...(filters.q && {
      OR: [
        { nom: { contains: filters.q, mode: "insensitive" as const } },
        { prenom: { contains: filters.q, mode: "insensitive" as const } },
        { matricule: { contains: filters.q, mode: "insensitive" as const } },
      ],
    }),
  };

  const [eleves, total, stats, classeNoms] = await Promise.all([
    prisma.eleve.findMany({
      where,
      include: {
        classe: { select: { nom: true, niveau: true } },
        parents: {
          include: { parent: { select: { nom: true, prenom: true, phone: true } } },
          where: { isGardien: true },
          take: 1,
        },
      },
      orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
      take: 200,
    }),
    prisma.eleve.count({ where }),
    getElevesStats(tenantId),
    getClassesList(tenantId),
  ]);

  return { eleves, total, stats, classeNoms };
}

export default async function ElevesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classeId?: string; statut?: string }>;
}) {
  const [session, t, sp] = await Promise.all([
    auth(),
    getTranslations("eleves"),
    searchParams,
  ]);
  if (!session?.user?.tenantId) redirect("/login");

  const { q, classeId, statut } = sp;

  const { eleves, total, stats, classeNoms } = await getElevesData(session.user.tenantId, {
    q,
    classeId,
    statut,
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={`${stats.actifs} — 2025-2026`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <ElevesStats stats={stats} />
          <div className="flex gap-2">
            <ElevesActions q={q} classeId={classeId} statut={statut} />
            <ImportElevesButton />
            <Button asChild size="sm" className="gap-2">
              <Link href="/eleves/nouveau">
                <Plus className="h-4 w-4" />
                {t("register")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Tableau */}
        <ElevesTable
          eleves={eleves}
          total={total}
          classes={classeNoms}
          initialQuery={q ?? ""}
          initialClasse={classeId ?? ""}
          initialStatut={statut ?? ""}
        />
      </div>
    </div>
  );
}
