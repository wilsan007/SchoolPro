import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ElevesTable } from "@/components/eleves/ElevesTable";
import { ElevesStats } from "@/components/eleves/ElevesStats";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Download, Upload, UserPlus, Plus } from "lucide-react";

async function getElevesData(tenantId: string) {
  const eleves = await prisma.eleve.findMany({
    where: { tenantId },
    include: {
      classe: { select: { nom: true, niveau: true } },
      parents: {
        include: { parent: { select: { nom: true, prenom: true, phone: true } } },
        where: { isGardien: true },
        take: 1,
      },
    },
    orderBy: [{ classe: { nom: "asc" } }, { nom: "asc" }],
  });

  const stats = {
    total: eleves.length,
    actifs: eleves.filter((e) => e.statut === "ACTIF").length,
    filles: eleves.filter((e) => e.sexe === "F").length,
    garcons: eleves.filter((e) => e.sexe === "M").length,
    internes: eleves.filter((e) => e.regime === "interne").length,
  };

  return { eleves, stats };
}

export default async function ElevesPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { eleves, stats } = await getElevesData(session.user.tenantId);

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
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Exporter
            </Button>
            <Button asChild size="sm" className="gap-2">
              <Link href="/eleves/nouveau">
                <Plus className="h-4 w-4" />
                Inscrire un élève
              </Link>
            </Button>
          </div>
        </div>

        {/* Tableau */}
        <ElevesTable eleves={eleves} />
      </div>
    </div>
  );
}
