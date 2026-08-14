import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MessagerieView } from "@/components/messages/MessagerieView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function MessagesPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("messages"),
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
      <div className="flex-1 overflow-hidden">
        <MessagerieView userRole={session.user.role} />
      </div>
    </div>
  );
}
