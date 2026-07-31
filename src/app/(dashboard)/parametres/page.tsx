import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { ParametresTabs } from "@/components/parametres/ParametresTabs";
import {
  getEtablissementData,
  getUsersForTenant,
  getClassesForSettings,
  getMatieresForSettings,
  getParentsForSettings,
  getElevesForLinking,
  getReglesAppreciation,
  getPeriodesForCloture,
  getSitesForSettings,
} from "@/lib/actions/parametres";

export default async function ParametresPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("parametres"),
  ]);
  if (!session?.user?.tenantId) redirect("/login");

  const canManage = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";

  const [etablissement, users, parents, eleves, classes, matieres, regles, periodes, sites] = await Promise.all([
    getEtablissementData(),
    getUsersForTenant(),
    getParentsForSettings(),
    getElevesForLinking(),
    getClassesForSettings(),
    getMatieresForSettings(),
    getReglesAppreciation(),
    getPeriodesForCloture(),
    getSitesForSettings(),
  ]);
  if (!etablissement) return redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <ParametresTabs
          etablissement={etablissement}
          users={users}
          parents={parents}
          eleves={eleves}
          classes={classes}
          matieres={matieres}
          regles={regles}
          periodes={periodes}
          sites={sites}
          canManage={canManage}
          availableTenants={session.user.availableTenants}
        />
      </div>
    </div>
  );
}

