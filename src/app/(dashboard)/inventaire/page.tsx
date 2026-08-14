import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { InventaireView } from "@/components/inventaire/InventaireView";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export const metadata = { title: "Inventaire — Matériel scolaire | EcolPro" };

export default async function InventairePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("inventaire"),
  ]);
  await guardPage(session, "inventaire:read");
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <InventaireView />
      </div>
    </div>
  );
}
