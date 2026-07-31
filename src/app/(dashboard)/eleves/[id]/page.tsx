import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { EleveDetailView } from "@/components/eleves/EleveDetailView";

async function getEleveDetail(id: string, tenantId: string) {
  const eleve = await prisma.eleve.findFirst({
    where: { id, tenantId },
    include: {
      classe: { select: { id: true, nom: true, niveau: true } },
      parents: {
        include: {
          parent: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              phone: true,
              phone2: true,
              email: true,
              profession: true,
              adresse: true,
            },
          },
        },
      },
      notes: {
        include: {
          matiere: { select: { nom: true, code: true, couleur: true, coefficient: true } },
          periode: { select: { nom: true, numero: true } },
        },
        orderBy: { date: "desc" },
        take: 30,
      },
      absences: {
        orderBy: { date: "desc" },
        take: 20,
      },
      incidents: {
        include: { sanctions: true },
        orderBy: { date: "desc" },
        take: 10,
      },
      factures: {
        include: { paiements: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      parcours: {
        orderBy: { annee: "desc" },
      },
    },
  });

  return eleve;
}

export default async function EleveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { id } = await params;
  const eleve = await getEleveDetail(id, session.user.tenantId);

  if (!eleve) notFound();

  // Matières (pour le sélecteur de dispense) + dispenses existantes de l'élève
  const [matieres, dispensesRaw] = await Promise.all([
    prisma.matiere.findMany({
      where: { tenantId: session.user.tenantId },
      select: { id: true, nom: true, code: true },
      orderBy: { nom: "asc" },
    }),
    prisma.dispenseMatiere.findMany({
      where: { tenantId: session.user.tenantId, eleveId: id },
      include: { matiere: { select: { nom: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const dispenses = dispensesRaw.map((d) => ({
    id: d.id,
    matiereId: d.matiereId,
    matiereNom: d.matiere.nom,
    motif: d.motif,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={`${eleve.prenom} ${eleve.nom}`}
        subtitle={`${eleve.matricule} · ${eleve.classe?.nom ?? "Classe non affectée"}`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <EleveDetailView eleve={eleve} matieres={matieres} dispenses={dispenses} />
      </div>
    </div>
  );
}
