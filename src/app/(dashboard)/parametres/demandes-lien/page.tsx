import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DemandesLienAdmin } from "./DemandesLienAdmin";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function DemandesLienPage() {
  const session = await auth();
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const t = await getTranslations("admin");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("demandesLienTitle")}
        subtitle={t("demandesLienSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <div className="max-w-3xl mx-auto">
          <DemandesLienAdmin />
        </div>
      </div>
    </div>
  );
}
