import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function AnalyticsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("analytics"),
  ]);
  await guardPage(session);
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AnalyticsView />
      </div>
    </div>
  );
}
