import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { GestionCaisse } from "@/components/caisse/GestionCaisse";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";

/**
 * Page « Caisse » — saisie des recettes, remise de caisse.
 *
 * Le caissier y déclare les remises de caisse journalières (montant, date,
 * destinataire). Le comptable ou le directeur y confirme la réception.
 * Une remise n'est validée que si les montants, dates et noms concordent
 * des deux côtés.
 */
export default async function PageCaisse() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("caisse"),
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
        <GestionCaisse
          user={{
            id: session!.user.id,
            role: session!.user.role,
            name: session!.user.name,
          }}
        />
      </div>
    </div>
  );
}
