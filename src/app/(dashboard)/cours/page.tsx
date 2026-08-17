import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { CoursView } from "@/components/cours/CoursView";
import { getTranslations } from "next-intl/server";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";
import { SiteTabs } from "@/components/sites/SiteTabs";
import { guardPage } from "@/lib/guard-page";

export const metadata = { title: "Cours en ligne — LMS | EcolPro" };

export default async function CoursPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
  if (!session?.user?.tenantId) redirect("/login");

  const [t, tCommon, sites, siteColors, sp] = await Promise.all([
    getTranslations("cours"),
    getTranslations("common"),
    getSitesForUser(),
    getSiteColorMap(session.user.tenantId),
    searchParams,
  ]);

  const sessionSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const { siteId } = sp;

  const activeSite = (() => {
    if (!siteId) return sessionSiteId ? sessionSiteId : "all";
    if (siteId === "all") {
      if (sessionSiteId) return sessionSiteId;
      return session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN" ? "all" : sessionSiteId ?? "all";
    }
    return sites.some((s) => s.id === siteId) ? siteId : (sessionSiteId ?? "all");
  })();

  const currentSiteName = activeSite === "all"
    ? tCommon("allSites")
    : (sites.find((s) => s.id === activeSite)?.nom ?? "Site inconnu");
  const currentSiteColor = activeSite === "all" ? undefined : siteColors[activeSite];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        site={currentSiteName}
        siteColor={currentSiteColor}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        <SiteTabs
          sites={sites.map((s) => ({ id: s.id, nom: s.nom }))}
          siteColors={siteColors}
          activeSiteId={activeSite}
          className="mb-2"
        />
        <CoursView siteColors={siteColors} activeSite={activeSite} />
      </div>
    </div>
  );
}
