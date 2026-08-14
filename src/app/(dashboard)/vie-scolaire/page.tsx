import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { VieScolaireView } from "@/components/vie-scolaire/VieScolaireView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

async function getVieScolaireData(tenantId: string, claims: SessionSiteClaims) {
  const [incidents, eleves, classes] = await Promise.all([
    prisma.incident.findMany({
      where: { tenantId, ...siteFilterForModel("incident", claims) },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.eleve.findMany({
      where: { tenantId, statut: "ACTIF", ...siteFilterForModel("eleve", claims) },
      select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId, ...siteFilterForModel("classe", claims) },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return { incidents, eleves, classes };
}

export default async function VieScolairePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("vieScolaire"),
  ]);
  await guardPage(session);

  const { incidents, eleves, classes } = await getVieScolaireData(session!.user.tenantId!, session!.user);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <VieScolaireView
          incidents={incidents}
          eleves={eleves}
          classes={classes}
          currentUserId={session!.user.id}
          tenantId={session!.user.tenantId!}
        />
      </div>
    </div>
  );
}
