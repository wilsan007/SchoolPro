import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { FacturesTable } from "@/components/facturation/FacturesTable";
import { FacturesMensuelles } from "@/components/facturation/FacturesMensuelles";
import { FacturationActions } from "@/components/facturation/FacturationActions";
import { getFacturesForTenant } from "@/lib/actions/facture";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { getContexteAnnees } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

export default async function FacturationPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("facturation"),
  ]);
  await guardPage(session);

  const [factures, ctx, params] = await Promise.all([
    getFacturesForTenant(),
    getContexteAnnees(session!.user.tenantId!),
    searchParams,
  ]);

  const currentYear = ctx.anneeActive?.libelle ?? (await getDemoNow()).getFullYear().toString();
  const vue = params.vue ?? "tableau";

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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin space-y-4">
        {ctx.phase !== "normale" && ctx.anneeEcoulee && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Période estivale</strong> — Préparation de la rentrée {ctx.anneeAVenir?.libelle}.
            Les factures impayées de {ctx.anneeEcoulee.libelle} sont affichées ci-dessous pour encaissement.
            {ctx.phase === "pre_rentree" && ctx.joursAvantRentree !== null && (
              <span className="ml-2 font-semibold">— Rentrée dans {ctx.joursAvantRentree} jours.</span>
            )}
          </div>
        )}
        <FacturationActions currentYear={currentYear} userRole={session!.user.role as string} />

        {/* Toggle entre vue tableau et vue mensuelle */}
        <div className="flex gap-2">
          <Link
            href="/facturation?vue=tableau"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              vue === "tableau"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:border-primary/30"
            }`}
          >
            {t("viewTable")}
          </Link>
          <Link
            href="/facturation?vue=mensuel"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              vue === "mensuel"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:border-primary/30"
            }`}
          >
            {t("viewMonthly")}
          </Link>
        </div>

        {vue === "mensuel" ? (
          <FacturesMensuelles factures={factures} />
        ) : (
          <FacturesTable factures={factures} />
        )}
      </div>
    </div>
  );
}
