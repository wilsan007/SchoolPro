import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard-page";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { NotesOverview } from "@/components/notes/NotesOverview";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PenLine, FileText, Plus, ArrowLeft } from "lucide-react";
import { SaisieNotesSelectors } from "@/components/notes/SaisieNotesSelectors";
import { GrilleSaisie } from "@/components/evaluations/GrilleSaisie";
import { SiteTabs } from "@/components/sites/SiteTabs";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import type { Role } from "@prisma/client";
import { siteFilterForModel, mergeFilters, type SessionSiteClaims } from "@/lib/site-scope";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";

const getNotesData = unstable_cache(
  async (
    tenantId: string,
    // Revendications de site réduites au strict nécessaire : elles entrent dans
    // la clé de cache, on n'y met donc rien d'identifiant (ni id, ni e-mail).
    claims: SessionSiteClaims,
    classeId?: string,
    scope?: { classeIds: string[]; matiereIds: string[]; isRestricted: boolean }
  ) => {
    const classeWhere = { tenantId, ...siteFilterForModel("classe", claims), ...(scope?.isRestricted && scope.classeIds.length > 0 ? { id: { in: scope.classeIds } } : scope?.isRestricted ? { id: "__none__" } : {}) };
    const matiereWhere = { tenantId, ...siteFilterForModel("matiere", claims), ...(scope?.isRestricted && scope.matiereIds.length > 0 ? { id: { in: scope.matiereIds } } : scope?.isRestricted ? { id: "__none__" } : {}) };
    // Le filtre de site s'applique dans tous les cas : auparavant il sautait dès
    // qu'une `classeId` était fournie dans l'URL, ce qui laissait lire les
    // statistiques de notes d'une classe d'un autre site.
    const noteWhere = mergeFilters(
      { tenantId, ...(classeId ? { classeId } : {}) },
      siteFilterForModel("note", claims),
      scope?.isRestricted && scope.classeIds.length > 0
        ? { eleve: { classeId: { in: scope.classeIds } } }
        : scope?.isRestricted
          ? { id: "__none__" }
          : {}
    );

    const [classes, matieres, statsNotes] = await Promise.all([
      prisma.classe.findMany({
        where: classeWhere,
        select: { id: true, nom: true, niveau: true, siteId: true, site: { select: { nom: true } } },
        orderBy: { nom: "asc" },
      }),
      prisma.matiere.findMany({
        where: matiereWhere,
        select: { id: true, nom: true, code: true, couleur: true, coefficient: true },
        orderBy: { nom: "asc" },
      }),
      prisma.note.groupBy({
        by: ["matiereId"],
        where: noteWhere,
        _avg: { valeur: true },
        _count: true,
      }),
    ]);

    return { classes, matieres, statsNotes };
  },
  ["notes-data"],
  { revalidate: 60, tags: ["notes-data"] }
);

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ classeId?: string; matiereId?: string; evaluationId?: string; siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  await guardPage(session, "notes:read");

  const [t, tCommon, sp, sites, siteColors] = await Promise.all([
    getTranslations("notes"),
    getTranslations("common"),
    searchParams,
    getSitesForUser(),
    getSiteColorMap(session.user.tenantId),
  ]);

  const tenantId = session.user.tenantId;
  const sessionSiteId = (session.user as { siteId?: string | null }).siteId ?? null;
  const { classeId, matiereId, evaluationId, siteId } = sp;

  const activeSite = (() => {
    if (!siteId) return sessionSiteId ? sessionSiteId : "all";
    if (siteId === "all") {
      if (sessionSiteId) return sessionSiteId;
      return session.user.role === "TENANT_ADMIN" || session.user.role === "SUPER_ADMIN" ? "all" : sessionSiteId ?? "all";
    }
    return sites.some((s) => s.id === siteId) ? siteId : (sessionSiteId ?? "all");
  })();

  const noteClaims: SessionSiteClaims = {
    role: session.user.role,
    siteId: activeSite === "all" ? null : activeSite,
    siteIds: (session.user as { siteIds?: string[] | null }).siteIds ?? null,
    tenantHasSites: (session.user as { tenantHasSites?: boolean }).tenantHasSites ?? false,
  };

  const currentSiteName = activeSite === "all"
    ? tCommon("allSites")
    : (sites.find((s) => s.id === activeSite)?.nom ?? "Site inconnu");
  const currentSiteColor = activeSite === "all" ? undefined : siteColors[activeSite];
  const siteFilter = siteFilterForModel("classe", noteClaims);
  const eleveFilter = siteFilterForModel("note", noteClaims);
  const evalFilter = siteFilterForModel("evaluation", noteClaims);

  // Filtrer par classes/matières de l'enseignant si applicable
  const scope = isTeacherRole(session.user.role as Role)
    ? await getTeacherScope(tenantId, session.user.id, session.user.role as Role)
    : undefined;

  // Récupérer les classes et matières (filtrées pour les enseignants)
  const { classes, matieres, statsNotes } = await getNotesData(tenantId, noteClaims, classeId, scope);

  // Si classe et matière sont sélectionnées, on récupère les évaluations correspondantes
  let evaluations: any[] = [];
  if (classeId && matiereId) {
    // Vérifier que l'enseignant a accès à cette classe/matière
    if (scope?.isRestricted && !scope.classeIds.includes(classeId)) {
      redirect("/notes");
    }
    evaluations = await prisma.evaluation.findMany({
      where: { tenantId, ...evalFilter, classeId, matiereId },
      select: { id: true, titre: true, type: true },
      orderBy: { date: "desc" },
    });
  }

  // Si tout est sélectionné, on récupère l'évaluation avec sa grille
  let evaluation: any = null;
  let grille: any[] = [];
  if (classeId && matiereId && evaluationId) {
    evaluation = await prisma.evaluation.findFirst({
      where: { id: evaluationId, tenantId, ...evalFilter },
      include: {
        classe: {
          include: {
            eleves: { where: siteFilterForModel("eleve", noteClaims), orderBy: { prenom: 'asc' } },
          },
        },
        matiere: true,
        notes: true,
      }
    });

    if (evaluation) {
      grille = evaluation.classe.eleves.map((eleve: any) => {
        const existingNote = evaluation.notes.find((n: any) => n.eleveId === eleve.id);
        return {
          eleveId: eleve.id,
          matricule: eleve.matricule,
          nom: eleve.nom,
          prenom: eleve.prenom,
          noteId: existingNote?.id ?? null,
          valeur: existingNote?.valeur ?? null,
          commentaire: existingNote?.commentaire ?? "",
        };
      });
    }
  }

  const matieresWithStats = matieres.map((m) => {
    const stat = statsNotes.find((s) => s.matiereId === m.id);
    return {
      ...m,
      moyenneClasse: stat?._avg.valeur ?? null,
      totalNotes: stat?._count ?? 0,
    };
  });

  const selectedMatiere = matieres.find(m => m.id === matiereId);
  const selectedClasse = classes.find(c => c.id === classeId);
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
        title={t("title")}
        subtitle={t("subtitle")}
        site={currentSiteName}
        siteColor={currentSiteColor}
        userName={session.user.name}
        userAvatar={session.user.image ?? undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {/* Sélecteur de site coloré */}
        <SiteTabs
          sites={sites.map((s) => ({ id: s.id, nom: s.nom }))}
          siteColors={siteColors}
          activeSiteId={activeSite}
          className="mb-2"
        />

        {/* Filtres de sélection en haut */}
        <SaisieNotesSelectors
          classes={classes.map((c) => ({ id: c.id, nom: c.nom }))}
          matieres={matieres}
          evaluations={evaluations}
          selectedClasseId={classeId}
          selectedMatiereId={matiereId}
          selectedEvaluationId={evaluationId}
        />

        {/* Affichage conditionnel de la Grille de Saisie, du Wizard ou de la Vue d'ensemble */}
        {evaluation ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-blue-600" />
                  {t("enterForExam", { title: evaluation.titre })}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t("examForClass", {
                    classe: evaluation.classe.nom,
                    matiere: evaluation.matiere.nom.toUpperCase(),
                  })}
                </p>
              </div>
              <Link href="/notes">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {tCommon("back")}
                </Button>
              </Link>
            </div>
            
            <GrilleSaisie evaluation={evaluation} initialGrille={grille} />
          </div>
        ) : (
          <>
            {/* Étape 1 : Si matière sélectionnée, mais pas de classe */}
            {matiereId && !classeId && (
              <div className="bg-card p-6 rounded-xl border shadow-sm space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{t("enterForSubject", { matiere: selectedMatiere?.nom ?? "" })}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("selectClassPrompt")}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {classes.map((c) => (
                    <Link key={c.id} href={`/notes?matiereId=${matiereId}&classeId=${c.id}`}>
                      <div className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all cursor-pointer flex flex-col justify-between h-28 shadow-sm">
                        <span className="font-bold text-gray-800 dark:text-gray-100 text-base">{c.nom}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">{c.niveau ?? "Collège"}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Link href="/notes">
                    <Button variant="outline">{tCommon("cancel")}</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Étape 2 : Si classe sélectionnée, mais pas de matière — l'overview reste visible avec le filtre classe actif */}

            {/* Étape 3 : Si classe + matière sélectionnés, mais pas d'évaluation */}
            {classeId && matiereId && !evaluationId && (
              <div className="bg-card p-6 rounded-xl border shadow-sm space-y-6">
                <div className="border-b pb-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                    {t("enterForSubjectInClass", { matiere: selectedMatiere?.nom ?? "", classe: selectedClasse?.nom ?? "" })}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("selectExamPrompt")}</p>
                </div>
                
                {evaluations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {evaluations.map((ev) => (
                      <Link key={ev.id} href={`/notes?classeId=${classeId}&matiereId=${matiereId}&evaluationId=${ev.id}`}>
                        <div className="p-4 border rounded-xl hover:border-green-500 hover:bg-green-50/30 dark:hover:bg-green-950/20 transition-all cursor-pointer flex flex-col justify-between h-28 shadow-sm">
                          <div>
                            <span className="font-bold text-gray-800 dark:text-gray-100 text-base block">{ev.titre}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">{t("type")}: {ev.type}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-green-600 font-semibold uppercase">{t("select")}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 p-6 rounded-xl text-center space-y-4">
                    <p className="text-yellow-800 dark:text-yellow-400 font-medium">
                      {t("noExamPlanned")}
                    </p>
                    <Link href="/evaluations">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                        <Plus className="h-4 w-4" />
                        {t("scheduleExamShort")}
                      </Button>
                    </Link>
                  </div>
                )}
                
                <div className="flex justify-end pt-4 border-t">
                  <Link href="/notes">
                    <Button variant="outline">{tCommon("cancel")}</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Vue d'ensemble par matière — visible quand pas de matière sélectionnée */}
            {!matiereId && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-2xl font-bold">{matieres.length}</p>
                      <p className="text-xs text-muted-foreground">{t("subjectsLabel")}</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-2xl font-bold">{classes.length}</p>
                      <p className="text-xs text-muted-foreground">{t("classesLabel")}</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-2xl font-bold">
                        {statsNotes.reduce((sum, s) => sum + s._count, 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("gradesEntered")}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="gap-2">
                      <Link href="/notes/bulletins">
                        <FileText className="h-4 w-4" />
                        {t("bulletinsBtn")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="gap-2">
                      <Link href="/evaluations">
                        <Plus className="h-4 w-4" />
                        {t("scheduleExamShort")}
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Vue d'ensemble par matière */}
                <NotesOverview
                  matieres={matieresWithStats}
                  classes={classOptions}
                  siteColors={siteColors}
                  selectedClasseId={classeId ?? ""}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
