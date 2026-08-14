import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ExamensManager } from "@/components/examens/ExamensManager";
import { SiteTabs } from "@/components/sites/SiteTabs";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";
import { getTranslations } from "next-intl/server";

// Les fragments d'isolation sont construits ici, au plus près des requêtes :
// passés en paramètres, ils n'étaient plus rattachables à leur origine, ni par
// un relecteur ni par l'analyse statique.
async function getExamensData(tenantId: string, claims: SessionSiteClaims) {
  const [examens, classes, matieres] = await Promise.all([
    prisma.examen.findMany({
      where: { tenantId, ...siteFilterForModel("examen", claims) },
      include: {
        sessions: {
          where: siteFilterForModel("sessionExamen", claims),
          orderBy: { date: "asc" },
        },
      },
      orderBy: { dateDebut: "desc" },
    }),
    prisma.classe.findMany({
      where: { tenantId, ...siteFilterForModel("classe", claims) },
      select: { id: true, nom: true, niveau: true, siteId: true, site: { select: { nom: true } } },
      orderBy: { nom: "asc" },
    }),
    prisma.matiere.findMany({
      where: { tenantId, ...siteFilterForModel("matiere", claims) },
      select: { id: true, nom: true, code: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
  ]);
  return { examens, classes, matieres };
}

export default async function ExamensPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const [tCommon, sites, siteColors, sp] = await Promise.all([
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

  const examenClaims: SessionSiteClaims = {
    role: session.user.role,
    siteId: activeSite === "all" ? null : activeSite,
    siteIds: (session.user as { siteIds?: string[] | null }).siteIds ?? null,
    tenantHasSites: (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false,
  };

  const { examens, classes, matieres } = await getExamensData(session.user.tenantId, examenClaims);

  const currentSiteName = activeSite === "all"
    ? tCommon("allSites")
    : (sites.find((s) => s.id === activeSite)?.nom ?? "Site inconnu");
  const currentSiteColor = activeSite === "all" ? undefined : siteColors[activeSite];

  const classOptions = classes.map((c) => ({
    id: c.id,
    nom: c.nom,
    niveau: c.niveau,
    siteId: c.siteId,
    siteNom: c.site?.nom ?? null,
  }));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Examens & Délibérations"
        subtitle="Programmation, convocations, résultats et délibérations"
        site={currentSiteName}
        siteColor={currentSiteColor}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        <SiteTabs
          sites={sites.map((s) => ({ id: s.id, nom: s.nom }))}
          siteColors={siteColors}
          activeSiteId={activeSite}
          className="mb-2"
        />
        <ExamensManager
          examens={examens}
          classes={classOptions}
          matieres={matieres}
          siteColors={siteColors}
          tenantId={session.user.tenantId}
        />
      </div>
    </div>
  );
}
