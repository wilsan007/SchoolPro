import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ElevesTable } from "@/components/eleves/ElevesTable";
import { ElevesStats } from "@/components/eleves/ElevesStats";
import { ElevesActions } from "@/components/eleves/ElevesActions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

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

  const [eleves, total, stats, classes] = await Promise.all([
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
    }),
    prisma.eleve.count({ where }),
    // Stats globales du tenant — indépendantes de la recherche en cours
    Promise.all([
      prisma.eleve.count({ where: { tenantId, statut: "ACTIF" } }),
      prisma.eleve.count({ where: { tenantId, sexe: "F" } }),
      prisma.eleve.count({ where: { tenantId, sexe: "M" } }),
      prisma.eleve.count({ where: { tenantId, regime: "interne" } }),
      prisma.eleve.count({ where: { tenantId } }),
    ]).then(([actifs, filles, garcons, internes, totalTenant]) => ({
      total: totalTenant,
      actifs,
      filles,
      garcons,
      internes,
    })),
    prisma.classe.findMany({ where: { tenantId }, select: { nom: true }, orderBy: { nom: "asc" } }),
  ]);

  return { eleves, total, stats, classeNoms: Array.from(new Set(classes.map((c) => c.nom))) };
}

export default async function ElevesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classeId?: string; statut?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { q, classeId, statut } = await searchParams;

  const { eleves, total, stats, classeNoms } = await getElevesData(session.user.tenantId, {
    q,
    classeId,
    statut,
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Gestion des Élèves"
        subtitle={`${stats.actifs} élèves actifs — Année 2025-2026`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <ElevesStats stats={stats} />
          <div className="flex gap-2">
            <ElevesActions q={q} classeId={classeId} statut={statut} />
            <Button asChild size="sm" className="gap-2">
              <Link href="/eleves/nouveau">
                <Plus className="h-4 w-4" />
                Inscrire un élève
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
