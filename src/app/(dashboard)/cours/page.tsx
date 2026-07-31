import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { CoursView } from "@/components/cours/CoursView";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "Cours en ligne — LMS | EcolPro" };

export default async function CoursPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("cours"),
  ]);
  if (!session?.user?.tenantId) redirect("/login");
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <CoursView />
      </div>
    </div>
  );
}
