import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { IntelligenceDirection } from "@/components/intelligence/IntelligenceDirection";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

/**
 * Page « Intelligence du directeur ».
 *
 * Cinq niveaux d'analyse — détection, diagnostic, prédiction, prescription,
 * mesure — présentés en sections empilées. La page est un Server Component
 * mince : authentification, garde d'autorisation et en-tête. Toute la logique
 * de fetch et de rendu vit dans le composant client `IntelligenceDirection`,
 * qui interroge les routes `/api/learnos/*` dédiées.
 */
export default async function PageIntelligence() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("directionIntelligence"),
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
        <IntelligenceDirection />
      </div>
    </div>
  );
}
