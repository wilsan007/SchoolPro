import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { VieScolaireView } from "@/components/vie-scolaire/VieScolaireView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { siteFilterForModel } from "@/lib/site-scope";

async function getVieScolaireData(tenantId: string, incFilter: Record<string, unknown>, eleveFilter: Record<string, unknown>, classeFilter: Record<string, unknown>) {
  const [incidents, eleves, classes] = await Promise.all([
    prisma.incident.findMany({
      where: { tenantId, ...incFilter },
      include: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } } },
        rapportePar: { select: { name: true } },
        sanctions: true,
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.eleve.findMany({
      where: { tenantId, statut: "ACTIF", ...eleveFilter },
      select: { id: true, nom: true, prenom: true, matricule: true, classe: { select: { nom: true } } },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.classe.findMany({
      where: { tenantId, ...classeFilter },
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
  guardPage(session, "vie-scolaire:read");

  const incFilter = siteFilterForModel("incident", session!.user);
  const eleveFilter = siteFilterForModel("eleve", session!.user);
  const classeFilter = siteFilterForModel("classe", session!.user);
  const { incidents, eleves, classes } = await getVieScolaireData(session!.user.tenantId!, incFilter, eleveFilter, classeFilter);

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
