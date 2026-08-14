import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { RHView } from "@/components/rh/RHView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

async function getEnseignantsRH(tenantId: string, claims: SessionSiteClaims) {
  const [enseignants, absencesPersonnel, congesPersonnel] = await Promise.all([
    prisma.enseignant.findMany({
      where: { tenantId, ...siteFilterForModel("enseignant", claims) },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true,
            phone: true, isActive: true, lastLoginAt: true,
          },
        },
        ficheRH: {
          include: {
            bulletinsPaie: {
              where: siteFilterForModel("bulletinPaie", claims),
              orderBy: [{ annee: "desc" }, { mois: "desc" }],
              take: 3,
            },
          },
        },
        emploiTemps: {
          where: siteFilterForModel("emploiTemps", claims),
          select: {
            jour: true, heureDebut: true, heureFin: true,
            matiere: { select: { nom: true, couleur: true } },
            classe: { select: { nom: true } },
          },
        },
        classesPrincipales: {
          where: siteFilterForModel("classe", claims),
          select: { id: true, nom: true, niveau: true },
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.absencePersonnel.findMany({
      where: { tenantId, ...siteFilterForModel("absencePersonnel", claims) },
      include: {
        enseignant: { select: { id: true, user: { select: { name: true } } } },
        saisiePar: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 50,
    }),
    prisma.congePersonnel.findMany({
      where: { tenantId, ...siteFilterForModel("congePersonnel", claims) },
      include: {
        enseignant: { select: { id: true, user: { select: { name: true } } } },
        demandePar: { select: { name: true } },
        approuvePar: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return { enseignants, absencesPersonnel, congesPersonnel };
}

export default async function RHPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("rh"),
  ]);
  await guardPage(session);

  const { enseignants, absencesPersonnel, congesPersonnel } = await getEnseignantsRH(session!.user.tenantId!, session!.user);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <RHView
          enseignants={enseignants}
          absencesPersonnel={absencesPersonnel}
          congesPersonnel={congesPersonnel}
        />
      </div>
    </div>
  );
}
