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
import { siteFilterForModel } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import type { Prisma } from "@prisma/client";

const getElevesStats = unstable_cache(
  async (tenantId: string, siteFilter: Record<string, unknown>) => {
    const where = { tenantId, ...siteFilter, deletedAt: null } as Prisma.EleveWhereInput;
    const [byStatut, bySexe, byRegime, totalTenant] = await Promise.all([
      // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } inside unstable_cache
      prisma.eleve.groupBy({
        by: ["statut"],
        where,
        _count: true,
      }),
      // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } inside unstable_cache
      prisma.eleve.groupBy({
        by: ["sexe"],
        where,
        _count: true,
      }),
      // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } inside unstable_cache
      prisma.eleve.groupBy({
        by: ["regime"],
        where,
        _count: true,
      }),
      // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } inside unstable_cache
      prisma.eleve.count({ where }),
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
  async (tenantId: string, siteFilter: Record<string, unknown>) => {
    // eslint-disable-next-line ecolpro/require-site-filter -- where includes ...siteFilter spread, not detectable inside unstable_cache
    const classes = await prisma.classe.findMany({
      where: { tenantId, ...siteFilter } as Prisma.ClasseWhereInput,
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
  siteFilter: Record<string, unknown>,
  classeSiteFilter: Record<string, unknown>,
  filters: { q?: string; classeId?: string; statut?: string },
  userRole?: string,
) {
  const where = {
    tenantId,
    ...siteFilter,
    deletedAt: null, // Exclure les élèves supprimés (soft delete)
    // Pour les parents: masquer les enfants exclus de la liste
    ...(userRole === "PARENT" && { statut: { not: "EXCLU" } }),
    ...(filters.classeId && { classeId: filters.classeId }),
    ...(filters.statut && { statut: filters.statut as "ACTIF" }),
    ...(filters.q && {
      OR: [
        { nom: { contains: filters.q, mode: "insensitive" as const } },
        { prenom: { contains: filters.q, mode: "insensitive" as const } },
        { matricule: { contains: filters.q, mode: "insensitive" as const } },
      ],
    }),
  } as Prisma.EleveWhereInput;

  const [eleves, total, stats, classeNoms] = await Promise.all([
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.findMany({
      where,
      include: {
        // eslint-disable-next-line ecolpro/require-site-filter -- classe is a 1:1 relation, site filter applied at parent query level
        classe: { select: { nom: true, niveau: true } },
        parents: {
          // eslint-disable-next-line ecolpro/require-site-filter -- parent site filter applied via eleve-level where
          include: { parent: { select: { nom: true, prenom: true, phone: true } } },
          where: { isGardien: true },
          take: 1,
        },
      },
      orderBy: [{ classe: { nom: "asc" } }, { prenom: "asc" }],
      take: 500,
    }),
    // eslint-disable-next-line ecolpro/require-site-filter -- where is built from { tenantId, ...siteFilter } in getElevesData
    prisma.eleve.count({ where }),
    getElevesStats(tenantId, siteFilter),
    getClassesList(tenantId, classeSiteFilter),
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

  const siteFilter = siteFilterForModel("eleve", session.user);
  const classeSiteFilter = siteFilterForModel("classe", session.user);
  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const tenantHasSites = (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false;
  const [sites, { eleves, total, stats, classeNoms }] = await Promise.all([
    getSitesForUser(),
    getElevesData(session.user.tenantId, siteFilter, classeSiteFilter, {
      q,
      classeId,
      statut,
    }, session.user.role),
  ]);

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
            <ImportElevesButton sites={sites} currentSiteId={currentSiteId} tenantHasSites={tenantHasSites} />
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
