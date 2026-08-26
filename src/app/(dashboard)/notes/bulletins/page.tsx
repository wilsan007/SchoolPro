import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { BulletinsManager } from "@/components/bulletins/BulletinsManager";
import { BulletinsList } from "@/components/bulletins/BulletinsList";
import { BilanAnnuelManager } from "@/components/bulletins/BilanAnnuelManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, List, Award } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { guardPage } from "@/lib/guard-page";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

async function getBulletinsData(
  tenantId: string,
  claims: SessionSiteClaims,
  hierarchieClasseIds: string[],
  anneeCourante?: string | null
) {
  const classeWhere = {
    tenantId,
    ...siteFilterForModel("classe", claims),
    ...(anneeCourante ? { annee: anneeCourante } : {}),
    ...(hierarchieClasseIds.length > 0
      ? { id: { in: hierarchieClasseIds } }
      : { id: "__none__" }),
  };

  const [classes, periodes] = await Promise.all([
    prisma.classe.findMany({
      where: classeWhere,
      include: {
        eleves: {
          where: { statut: "ACTIF", ...siteFilterForModel("eleve", claims) },
          select: { id: true, nom: true, prenom: true, matricule: true },
          orderBy: { prenom: "asc" },
        },
        profPrincipal: { include: { user: { select: { name: true } } } },
      },
      orderBy: { nom: "asc" },
    }),
    prisma.periode.findMany({
      where: { annee: { tenantId } },
      orderBy: { numero: "asc" },
      include: { annee: { select: { id: true, libelle: true } } },
    }),
  ]);
  const anneeId = periodes.find(p => p.isCurrent)?.anneeId ?? periodes[0]?.anneeId;
  return { classes, periodes, anneeId };
}

export default async function BulletinsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("bulletins"),
  ]);
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const tenantId = session.user.tenantId;
  const claims = session.user as SessionSiteClaims;
  const anneeCourante = await getAnneeCouranteLibelle(tenantId);

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  const hierarchie = await getClassesHierarchie(tenantId, session.user, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));

  const { classes, periodes, anneeId } = await getBulletinsData(tenantId, claims, hierarchieClasseIds, anneeCourante);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <Tabs defaultValue="generation" className="w-full">
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="generation" className="gap-2">
              <FileText className="h-4 w-4" />
              {t("generation")}
            </TabsTrigger>
            <TabsTrigger value="liste" className="gap-2">
              <List className="h-4 w-4" />
              {t("list")}
            </TabsTrigger>
            <TabsTrigger value="annuel" className="gap-2">
              <Award className="h-4 w-4" />
              {t("annualSummary")}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="generation" className="mt-0 outline-none">
            <BulletinsManager classes={classes} hierarchie={hierarchie} periodes={periodes} tenantId={session.user.tenantId} userRole={session.user.role} />
          </TabsContent>
          
          <TabsContent value="liste" className="mt-0 outline-none">
            <BulletinsList classes={classes} hierarchie={hierarchie} periodes={periodes} userRole={session.user.role} />
          </TabsContent>
          
          <TabsContent value="annuel" className="mt-0 outline-none">
            <BilanAnnuelManager classes={classes} hierarchie={hierarchie} anneeId={anneeId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
