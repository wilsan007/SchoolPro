import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { SuperAdminView } from "@/components/super-admin/SuperAdminView";
import { getTranslations } from "next-intl/server";

export default async function SuperAdminPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("nav"),
  ]);

  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("superAdmin")}
        subtitle=""
        userName={session.user.name ?? undefined}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <SuperAdminView />
      </div>
    </div>
  );
}
