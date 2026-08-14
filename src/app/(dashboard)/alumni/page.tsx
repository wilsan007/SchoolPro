import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AlumniView } from "@/components/alumni/AlumniView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export const metadata = { title: "Alumni — Anciens élèves | EcolPro" };

export default async function AlumniPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("alumni"),
  ]);
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
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
        <AlumniView />
      </div>
    </div>
  );
}
