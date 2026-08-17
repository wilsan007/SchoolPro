import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { RapportsView } from "@/components/rapports/RapportsView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function RapportsPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("rapports"),
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <RapportsView />
      </div>
    </div>
  );
}
