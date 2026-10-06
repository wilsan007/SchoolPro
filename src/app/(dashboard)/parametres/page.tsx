import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { ParametresTabs } from "@/components/parametres/ParametresTabs";
import { getSiteColorMap } from "@/lib/site-colors";
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
  getAnneesScolaires,
} from "@/lib/actions/parametres";

export default async function ParametresPage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("parametres"),
  ]);
  if (!session?.user) redirect("/login");
  if (!session.user.tenantId) {
    redirect(session.user.role === "SUPER_ADMIN" ? "/super-admin" : "/select-tenant");
  }
  // Réservé à la direction et au super-admin : les paramètres exposent
  // utilisateurs, classes, matières, périodes — pas le périmètre d'un enseignant.
  await guardPage(session);

  // PRINCIPAL a `parametres:read` mais pas `parametres:write` dans la
  // matrice : il consulte la configuration de l'établissement sans la
  // modifier. `canManage` contrôle tous les boutons de création/édition/
  // suppression (utilisateurs, classes, matières, périodes, sites…).
  //
  // Les onglets dont l'ÉCRITURE est refusée ne sont pas rendus du tout
  // (`ParametresTabs` les filtre par `roleKey`) : on ne montre pas un onglet
  // dont le formulaire répondra 403.
  const canManage = session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN";

  // Les dix lectures partent ensemble, mais seule celle de l'établissement est
  // ATTENDUE : c'est la seule dont dépend l'onglet affiché à l'ouverture. Les
  // autres sont transmises telles quelles (promesses) à `ParametresTabs`, qui
  // les lit onglet par onglet — la page s'affiche après une requête au lieu
  // d'attendre trois listes de plusieurs milliers de lignes.
  const etablissementPromise = getEtablissementData();
  const users = getUsersForTenant();
  const parents = getParentsForSettings();
  const eleves = getElevesForLinking();
  const classes = getClassesForSettings();
  const matieres = getMatieresForSettings();
  const regles = getReglesAppreciation();
  const periodes = getPeriodesForCloture();
  const sites = getSitesForSettings();
  const annees = getAnneesScolaires();
  const siteColors = getSiteColorMap(session.user.tenantId);
  // Une lecture qui échoue ne doit faire tomber que l'onglet qui l'affiche :
  // sans ce gestionnaire, une promesse rejetée et jamais lue interromprait le
  // processus. L'erreur reste portée par la promesse transmise au client.
  for (const lecture of [users, parents, eleves, classes, matieres, regles, periodes, sites, annees, siteColors]) {
    lecture.catch(() => undefined);
  }

  const etablissement = await etablissementPromise;
  if (!etablissement) return redirect("/login");

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
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
          annees={annees}
          siteColors={siteColors}
          canManage={canManage}
          roleKey={session.user.role}
          availableTenants={session.user.availableTenants}
        />
      </div>
    </div>
  );
}

