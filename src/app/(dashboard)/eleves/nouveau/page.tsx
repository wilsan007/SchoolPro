import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EleveForm } from "@/components/eleves/EleveForm";
import { getClassesForTenant, getSitesForUser, createEleve } from "@/lib/actions/eleve";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";

export default async function NouveauElevePage() {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const [te, tc] = await Promise.all([
    getTranslations("eleves"),
    getTranslations("common"),
  ]);

  const classes = await getClassesForTenant();
  const sites = await getSitesForUser();
  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const tenantHasSites = (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={te("registerStudent")}
        subtitle={te("registerStudentSubtitle")}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <EleveForm
          classes={classes}
          sites={sites}
          currentSiteId={currentSiteId}
          tenantHasSites={tenantHasSites}
          submitAction={createEleve}
          submitLabel={tc("create")}
          title={te("registerStudent")}
          backHref="/eleves"
        />
      </div>
    </div>
  );
}
