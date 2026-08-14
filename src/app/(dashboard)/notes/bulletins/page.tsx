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
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import type { Role } from "@prisma/client";

async function getBulletinsData(
  tenantId: string,
  claims: SessionSiteClaims,
  scope?: { classeIds: string[]; isRestricted: boolean }
) {
  const classeWhere = {
    tenantId,
    ...siteFilterForModel("classe", claims),
    ...(scope?.isRestricted && scope.classeIds.length > 0
      ? { id: { in: scope.classeIds } }
      : scope?.isRestricted
        ? { id: "__none__" }
        : {}),
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
  if (!session?.user?.tenantId) redirect("/login");

  // Filtrer par classes de l'enseignant si applicable
  const scope = isTeacherRole(session.user.role as Role)
    ? await getTeacherScope(session.user.tenantId, session.user.id, session.user.role as Role)
    : undefined;

  const { classes, periodes, anneeId } = await getBulletinsData(session.user.tenantId, session.user, scope);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
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
            <BulletinsManager classes={classes} periodes={periodes} tenantId={session.user.tenantId} />
          </TabsContent>
          
          <TabsContent value="liste" className="mt-0 outline-none">
            <BulletinsList classes={classes} periodes={periodes} />
          </TabsContent>
          
          <TabsContent value="annuel" className="mt-0 outline-none">
            <BilanAnnuelManager classes={classes} anneeId={anneeId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
