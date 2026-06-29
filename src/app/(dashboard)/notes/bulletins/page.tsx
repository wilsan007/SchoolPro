import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { BulletinsManager } from "@/components/bulletins/BulletinsManager";
import { BulletinsList } from "@/components/bulletins/BulletinsList";
import { BilanAnnuelManager } from "@/components/bulletins/BilanAnnuelManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, List, Award } from "lucide-react";

async function getBulletinsData(tenantId: string) {
  const [classes, periodes] = await Promise.all([
    prisma.classe.findMany({
      where: { tenantId },
      include: {
        eleves: { where: { statut: "ACTIF" }, select: { id: true, nom: true, prenom: true, matricule: true } },
        profPrincipal: { include: { user: { select: { name: true } } } },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId } },
      orderBy: { numero: "asc" },
    }),
  ]);
  return { classes, periodes };
}

export default async function BulletinsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  const { classes, periodes } = await getBulletinsData(session.user.tenantId);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Bulletins de Notes"
        subtitle="Génération, validation et distribution des bulletins"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <Tabs defaultValue="generation" className="w-full">
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="generation" className="gap-2">
              <FileText className="h-4 w-4" />
              Génération
            </TabsTrigger>
            <TabsTrigger value="liste" className="gap-2">
              <List className="h-4 w-4" />
              Liste
            </TabsTrigger>
            <TabsTrigger value="annuel" className="gap-2">
              <Award className="h-4 w-4" />
              Bilan Annuel
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="generation" className="mt-0 outline-none">
            <BulletinsManager classes={classes} periodes={periodes} tenantId={session.user.tenantId} />
          </TabsContent>
          
          <TabsContent value="liste" className="mt-0 outline-none">
            <BulletinsList classes={classes} periodes={periodes} />
          </TabsContent>
          
          <TabsContent value="annuel" className="mt-0 outline-none">
            <BilanAnnuelManager classes={classes} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
