import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { SuperAdminView } from "@/components/super-admin/SuperAdminView";

export default async function SuperAdminPage() {
  const session = await auth();

  // Redirection si l'utilisateur n'est pas connecté ou n'est pas un SUPER_ADMIN
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Administration Globale (Super Admin)"
        subtitle="Gestion des locataires (tenants), licences et statistiques globales du SaaS EcolPro."
        userName={session.user.name ?? undefined}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <SuperAdminView />
      </div>
    </div>
  );
}
