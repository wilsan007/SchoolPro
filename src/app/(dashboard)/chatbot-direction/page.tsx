import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { ChatbotDirection } from "@/components/learnos/ChatbotDirection";

/**
 * Chatbot d'analyse de données en langage naturel pour la direction.
 *
 * L'IA ne peut qu'appeler des outils fermés — jamais de SQL libre.
 * Hors périmètre → réponse bornée qui le signale.
 *
 * ACCÈS : TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN uniquement.
 * La garde de page vérifie le rôle via la règle de route.
 */
export default async function ChatbotDirectionPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.chatbotDirection"),
  ]);
  await guardPage(session);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("introduction")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        <div className="mx-auto max-w-3xl">
          <ChatbotDirection />
        </div>
      </div>
    </div>
  );
}
