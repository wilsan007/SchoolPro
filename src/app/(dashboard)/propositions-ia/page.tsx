import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { PropositionsIaValidation } from "@/components/learnos/PropositionsIaValidation";
import type { Role } from "@prisma/client";

/**
 * Liste et validation des propositions IA (plans de leçon + rubriques).
 *
 * Workflow :
 *   PROPOSE → l'enseignant ajuste → AJUSTE
 *   AJUSTE  → la direction valide → VALIDE
 *   N'importe quelle étape peut rejeter → REJETE
 *
 * ACCÈS : enseignants (curriculum:write) et direction (ai:*).
 */
export default async function PropositionsIaPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.propositionsIa"),
  ]);
  await guardPage(session);

  const role = session!.user.role as Role;
  const canValidate =
    role === "TENANT_ADMIN" || role === "PRINCIPAL" || role === "SUPER_ADMIN";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={canValidate ? t("sousTitreDirection") : t("sousTitreEnseignant")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
        <div className="mx-auto max-w-4xl">
          <PropositionsIaValidation canValidate={canValidate} />
        </div>
      </div>
    </div>
  );
}
