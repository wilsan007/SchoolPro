import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { LienEnfantForm } from "./LienEnfantForm";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function ProfilPage() {
  const session = await auth();
  await guardPage(session);
  if (!session?.user?.tenantId) redirect("/login");

  const t = await getTranslations("profil");
  const mustChange = session.user.mustChangePassword ?? false;
  const isParent = session.user.role === "PARENT";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-2xl mx-auto space-y-6">
          <ChangePasswordForm mustChange={mustChange} />
          {isParent && <LienEnfantForm />}
        </div>
      </div>
    </div>
  );
}
