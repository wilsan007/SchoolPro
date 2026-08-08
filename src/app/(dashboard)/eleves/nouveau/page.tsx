import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EleveForm } from "@/components/eleves/EleveForm";
import { getClassesForTenant, getSitesForUser, createEleve } from "@/lib/actions/eleve";

export default async function NouveauElevePage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const classes = await getClassesForTenant();
  const sites = await getSitesForUser();
  const currentSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const tenantHasSites = (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Inscrire un élève"
        subtitle="Créer une nouvelle fiche élève"
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
          submitLabel="Créer"
          title="Inscrire un élève"
          backHref="/eleves"
        />
      </div>
    </div>
  );
}
