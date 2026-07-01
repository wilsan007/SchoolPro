import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { FacturesTable } from "@/components/facturation/FacturesTable";
import { getFacturesForTenant } from "@/lib/actions/facture";

export default async function FacturationPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const factures = await getFacturesForTenant();

  const stats = {
    total: factures.length,
    enAttente: factures.filter((f) => f.statut === "EN_ATTENTE").length,
    payees: factures.filter((f) => f.statut === "PAYEE").length,
    enRetard: factures.filter((f) => f.statut === "EN_RETARD").length,
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Facturation"
        subtitle={`${stats.total} factures — ${stats.payees} payées, ${stats.enAttente} en attente, ${stats.enRetard} en retard`}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <FacturesTable factures={factures} />
      </div>
    </div>
  );
}
