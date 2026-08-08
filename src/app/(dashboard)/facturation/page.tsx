import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { FacturesTable } from "@/components/facturation/FacturesTable";
import { getFacturesForTenant } from "@/lib/actions/facture";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function FacturationPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("facturation"),
  ]);
  guardPage(session, "finance:read");

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
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <FacturesTable factures={factures} />
      </div>
    </div>
  );
}
