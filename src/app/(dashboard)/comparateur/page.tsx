import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { ComparateurView } from "@/components/comparateur/ComparateurView";

/**
 * Page de comparaison inter-sites et inter-années.
 *
 * Permet de comparer :
 * - Les sites du tenant entre eux (effectifs, moyennes, absences, factures,
 *   prédictions, exercices, maîtrise LEARNOS)
 * - Les années scolaires entre elles (évolution des mêmes KPI dans le temps)
 *
 * Accessible à TENANT_ADMIN, SUPER_ADMIN, PRINCIPAL, INSPECTOR.
 */
export default async function ComparateurPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("comparateur"),
  ]);
  await guardPage(session);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <ComparateurView />
      </div>
    </div>
  );
}
