import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RapportsView } from "@/components/rapports/RapportsView";

export default async function RapportsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Reporting & Rapports officiels"
        subtitle="Palmarès, statistiques annuelles, rapport d'inspection — export PDF"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <RapportsView />
      </div>
    </div>
  );
}
