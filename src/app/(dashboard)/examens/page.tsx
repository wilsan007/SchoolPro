import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { ExamensManager } from "@/components/examens/ExamensManager";
import { SiteTabs } from "@/components/sites/SiteTabs";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";
import { getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/guard-page";
import { anneeActive, getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

// Les fragments d'isolation sont construits ici, au plus près des requêtes :
// passés en paramètres, ils n'étaient plus rattachables à leur origine, ni par
// un relecteur ni par l'analyse statique.
async function getExamensData(
  tenantId: string,
  claims: SessionSiteClaims,
  hierarchieClasseIds: string[],
  hierarchieNiveaux: string[],
  anneeCourante?: { dateDebut: Date; dateFin: Date } | null,
  maintenant?: Date
) {
  // SessionExamen n'a pas de classeId mais un champ `niveau` (ex: "Terminale").
  // On filtre donc par niveau pour restreindre aux niveaux de la hiérarchie.
  const sessionScopeFilter = hierarchieNiveaux.length > 0
    ? { niveau: { in: hierarchieNiveaux } }
    : { id: "__none__" };

  const [examens, matieres] = await Promise.all([
    prisma.examen.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("examen", claims),
        ...(anneeCourante && { dateDebut: { gte: anneeCourante.dateDebut }, dateFin: { lte: anneeCourante.dateFin } }),
        ...(maintenant && { dateDebut: { lte: maintenant } }),
      },
      include: {
        sessions: {
          where: {
            ...siteFilterForModel("sessionExamen", claims),
            ...sessionScopeFilter,
          },
          orderBy: { date: "asc" },
        },
      },
      orderBy: { dateDebut: "desc" },
    }),
    prisma.matiere.findMany({
      where: {
        tenantId,
        ...siteFilterForModel("matiere", claims),
      },
      select: { id: true, nom: true, code: true, coefficient: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  // Ne garder que les examens qui ont au moins une session dans le périmètre.
  const filteredExamens = hierarchieNiveaux.length > 0
    ? examens.filter((e) => e.sessions.length > 0)
    : examens;

  return { examens: filteredExamens, matieres };
}

export default async function ExamensPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await auth();
  await guardPage(session);
  // Redondant à l'exécution — guardPage a déjà redirigé. Conservé pour
  // que TypeScript sache que `session` n'est plus nullable en dessous.
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

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  // On utilise examenClaims (site actif depuis l'URL) pour le filtrage par site,
  // et l'id/role de session.user pour la résolution du scope enseignant.
  const anneeCouranteLibelle = await getAnneeCouranteLibelle(session.user.tenantId);
  const hierarchie = await getClassesHierarchie(session.user.tenantId, { ...examenClaims, id: session.user.id }, { anneeCourante: anneeCouranteLibelle });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));
  const hierarchieNiveaux = Array.from(new Set(hierarchie.flatMap(c => c.niveaux.map(n => n.niveau))));

  // Classes aplaties depuis la hiérarchie (remplace l'ancien prisma.classe.findMany).
  const classes = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => ({
    id: cls.id,
    nom: cls.nom,
    niveau: cls.niveau,
    siteId: cls.siteId,
    site: { nom: cls.siteNom },
  }))));

  const anneeCourante = await anneeActive(session.user.tenantId);
  const anneeFenetre = anneeCourante ? { dateDebut: anneeCourante.dateDebut, dateFin: anneeCourante.dateFin } : null;
  const maintenant = await getDemoNow();

  const { examens, matieres } = await getExamensData(session.user.tenantId, examenClaims, hierarchieClasseIds, hierarchieNiveaux, anneeFenetre, maintenant);

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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        <SiteTabs
          sites={sites.map((s) => ({ id: s.id, nom: s.nom }))}
          siteColors={siteColors}
          activeSiteId={activeSite}
          className="mb-2"
        />
        <ExamensManager
          examens={examens}
          classes={classOptions}
          hierarchie={hierarchie}
          matieres={matieres}
          siteColors={siteColors}
          tenantId={session.user.tenantId}
        />
      </div>
    </div>
  );
}
