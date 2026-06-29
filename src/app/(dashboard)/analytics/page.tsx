import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Analytics & Prédictif"
        subtitle="Tableau de bord de pilotage, taux de réussite, détection de décrochage"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <AnalyticsView />
      </div>
    </div>
  );
}
