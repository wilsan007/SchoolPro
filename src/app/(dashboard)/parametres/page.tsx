import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { ParametresTabs } from "@/components/parametres/ParametresTabs";
import {
  getEtablissementData,
  getUsersForTenant,
  getClassesForSettings,
  getMatieresForSettings,
} from "@/lib/actions/parametres";

export default async function ParametresPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const canManage = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";

  const [etablissement, users, classes, matieres] = await Promise.all([
    getEtablissementData(),
    getUsersForTenant(),
    getClassesForSettings(),
    getMatieresForSettings(),
  ]);

  if (!etablissement) return redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Paramètres"
        subtitle="Configuration de votre établissement"
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <ParametresTabs
          etablissement={etablissement}
          users={users}
          classes={classes}
          matieres={matieres}
          canManage={canManage}
        />
      </div>
    </div>
  );
}

