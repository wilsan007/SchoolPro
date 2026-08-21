import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { ActionRubricGrid, type RubricData } from "@/components/dashboard/ActionRubric";
import { ActivityTimeline, type ActivityItemData } from "@/components/dashboard/ActivityTimeline";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { getSecretariatCounts } from "@/lib/action-counts";
import { getActivityFeed, type ActivityItem, type Periode } from "@/lib/activity-feed";
import { getDemoNow } from "@/lib/demo-now";

/**
 * Espace du secrétariat — rubriques d'action + timeline d'activité.
 *
 * Le secrétariat traite des dossiers, pas des statistiques : chaque rubrique
 * est une file d'attente cliquable qui mène à l'écran où agir. La timeline
 * montre ce qui s'est passé récemment (aujourd'hui / semaine / mois) pour
 * donner du contexte sans noyer sous des chiffres.
 */
function serialiserItems(items: ActivityItem[]): ActivityItemData[] {
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    titre: i.titre,
    description: i.description,
    date: i.date.toISOString(),
    href: i.href,
  }));
}

export default async function SecretariatPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("secretariat"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user;
  const now = await getDemoNow();

  // Compteurs des rubriques + timeline pour les 4 périodes, en parallèle.
  const [rubrics, feedRecent, feedAujourdhui, feedSemaine, feedMois] = await Promise.all([
    getSecretariatCounts(tenantId, claims),
    getActivityFeed(tenantId, claims, "recent", now),
    getActivityFeed(tenantId, claims, "aujourdhui", now),
    getActivityFeed(tenantId, claims, "semaine", now),
    getActivityFeed(tenantId, claims, "mois", now),
  ]);

  const itemsParPeriode = {
    recent: serialiserItems(feedRecent),
    aujourdhui: serialiserItems(feedAujourdhui),
    semaine: serialiserItems(feedSemaine),
    mois: serialiserItems(feedMois),
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 scrollbar-thin">
        {/* Rubriques d'action — files d'attente cliquables */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("actionsATraiter")}</h2>
          <ActionRubricGrid rubrics={rubrics as RubricData[]} />
        </section>

        {/* Timeline d'activité */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("activiteRecente")}</h2>
          <ActivityTimeline itemsParPeriode={itemsParPeriode} />
        </section>
      </div>
    </div>
  );
}
