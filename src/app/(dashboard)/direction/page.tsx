import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { GrilleKpi } from "@/components/learnos/GrilleKpi";
import { AlertesAnticipees } from "@/components/curriculum/PlanificationView";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { kpisDirection } from "@/lib/learnos/kpi";
import { alertesAnticipees } from "@/lib/learnos/planification";

/**
 * Espace de pilotage — direction et chef d'établissement.
 *
 * Répond à trois questions, dans cet ordre : qu'est-ce qui ne va pas, sur quoi
 * agir avant qu'il ne soit trop tard, où en sommes-nous. Un chiffre qui
 * n'appelle aucune décision n'a pas sa place ici.
 */
export default async function DirectionPage() {
  const [session, t] = await Promise.all([auth(), getTranslations("learnos.kpi")]);
  await guardPage(session, "analytics:read");

  const tenantId = session!.user.tenantId!;
  const annee = await prisma.anneesScolaires.findFirst({
    where: { tenantId, isCurrent: true },
    select: { id: true },
  });

  const [kpis, alertes] = await Promise.all([
    kpisDirection(tenantId, session!.user),
    annee ? alertesAnticipees(tenantId, annee.id, session!.user) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titreDirection")}
        subtitle={t("sousTitreDirection")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-6 scrollbar-thin">
        <GrilleKpi kpis={kpis} />
        {/* Les alertes anticipatives valent surtout pour la direction : c'est
            elle qui peut réorganiser un emploi du temps trois semaines avant. */}
        <AlertesAnticipees alertes={alertes} />
      </div>
    </div>
  );
}
