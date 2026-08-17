import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { OrientationView } from "@/components/orientation/OrientationView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function OrientationPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("orientation"),
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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <OrientationView />
      </div>
    </div>
  );
}
