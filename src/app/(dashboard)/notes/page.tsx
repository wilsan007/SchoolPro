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
import { siteFilterForModel, mergeFilters, type SessionSiteClaims } from "@/lib/site-scope";
import { getClassesHierarchie } from "@/lib/classes-hierarchie";
import { getSitesForUser } from "@/lib/actions/eleve";
import { getSiteColorMap } from "@/lib/site-colors";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

const getNotesData = unstable_cache(
  async (
    tenantId: string,
    // Revendications de site réduites au strict nécessaire : elles entrent dans
    // la clé de cache, on n'y met donc rien d'identifiant (ni id, ni e-mail).
    claims: SessionSiteClaims,
    hierarchieClasseIds: string[],
    classeId?: string,
    anneeCourante?: string | null
  ) => {
    const matiereWhere = { tenantId, ...siteFilterForModel("matiere", claims) };
    // Le filtre de site s'applique dans tous les cas : auparavant il sautait dès
    // qu'une `classeId` était fournie dans l'URL, ce qui laissait lire les
    // statistiques de notes d'une classe d'un autre site.
    // Le scope enseignant est déjà résolu via la hiérarchie : hierarchieClasseIds
    // contient exactement les classes accessibles (toutes pour un admin, les
    // classes affectées pour un enseignant).
    const noteWhere = mergeFilters(
      { tenantId, ...(classeId ? { classeId } : {}), ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) },
      siteFilterForModel("note", claims),
      hierarchieClasseIds.length > 0
        ? { eleve: { classeId: { in: hierarchieClasseIds } } }
        : { id: "__none__" }
    );

    const [matieres, statsNotes] = await Promise.all([
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

    return { matieres, statsNotes };
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
  await guardPage(session);

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
    : (sites.find((s) => s.id === activeSite)?.nom ?? tCommon("unknownSite"));
  const currentSiteColor = activeSite === "all" ? undefined : siteColors[activeSite];
  const siteFilter = siteFilterForModel("classe", noteClaims);
  const eleveFilter = siteFilterForModel("note", noteClaims);
  const evalFilter = siteFilterForModel("evaluation", noteClaims);

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const maintenant = await getDemoNow();

  // Hiérarchie des classes avec scope enseignant + année + site intégrés.
  // On utilise noteClaims (site actif depuis l'URL) pour le filtrage par site,
  // et l'id de session.user pour la résolution du scope enseignant.
  const hierarchie = await getClassesHierarchie(tenantId, { ...noteClaims, id: session.user.id }, { anneeCourante });
  const hierarchieClasseIds = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => cls.id)));

  // Classes aplaties depuis la hiérarchie (remplace l'ancien prisma.classe.findMany).
  const classes = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes.map(cls => ({
    id: cls.id,
    nom: cls.nom,
    niveau: cls.niveau,
    siteId: cls.siteId,
    site: { nom: cls.siteNom },
  }))));

  // Récupérer les matières et statistiques notes (filtrées par hiérarchie)
  const { matieres, statsNotes } = await getNotesData(tenantId, noteClaims, hierarchieClasseIds, classeId, anneeCourante);

  // Si classe et matière sont sélectionnées, on récupère les évaluations correspondantes
  let evaluations: any[] = [];
  if (classeId && matiereId) {
    // Vérifier que l'utilisateur a accès à cette classe (via la hiérarchie)
    if (hierarchieClasseIds.length > 0 && !hierarchieClasseIds.includes(classeId)) {
      redirect("/notes");
    }
    evaluations = await prisma.evaluation.findMany({
      where: { tenantId, ...evalFilter, classeId, matiereId, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}), date: { lte: maintenant } },
      select: { id: true, titre: true, type: true },
      orderBy: { date: "desc" },
    });
  }

  // Si tout est sélectionné, on récupère l'évaluation avec sa grille
  let evaluation: any = null;
  let grille: any[] = [];
  if (classeId && matiereId && evaluationId) {
    evaluation = await prisma.evaluation.findFirst({
      where: { id: evaluationId, tenantId, ...evalFilter, ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) },
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

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
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
          hierarchie={hierarchie}
          matieres={matieres}
          evaluations={evaluations}
          selectedClasseId={classeId}
          selectedMatiereId={matiereId}
          selectedEvaluationId={evaluationId}
        />

        {/* Affichage conditionnel de la Grille de Saisie, du Wizard ou de la Vue d'ensemble */}
        {evaluation ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-bloom-header p-4 rounded-[18px] border border-[#0ea5e9]/15 halo-azure">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-[#0ea5e9]" />
                  {t("enterForExam", { title: evaluation.titre })}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("examForClass", {
                    classe: evaluation.classe.nom,
                    matiere: evaluation.matiere.nom.toUpperCase(),
                  })}
                </p>
              </div>
              <Link href="/notes" className="w-full sm:w-auto">
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto rounded-xl border-border hover:border-primary/30 hover:bg-[#0ea5e9]/5">
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
              <div className="card-bloom p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="border-b border-border/60 pb-4">
                  <h2 className="text-lg font-bold text-foreground font-display">{t("enterForSubject", { matiere: selectedMatiere?.nom ?? "" })}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("selectClassPrompt")}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {classes.map((c) => (
                    <Link key={c.id} href={`/notes?matiereId=${matiereId}&classeId=${c.id}`}>
                      <div className="halo-hover p-4 rounded-[18px] border border-border bg-azure-mist cursor-pointer flex flex-col justify-between h-28 shadow-sm hover:border-[#0ea5e9]/40">
                        <span className="font-bold text-foreground text-base">{c.nom}</span>
                        <span className="text-xs text-[#9b6fe0] uppercase font-semibold">{c.niveau ?? tCommon("defaultLevel")}</span>
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
              <div className="card-bloom p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="border-b border-border/60 pb-4">
                  <h2 className="text-lg font-bold text-foreground font-display">
                    {t("enterForSubjectInClass", { matiere: selectedMatiere?.nom ?? "", classe: selectedClasse?.nom ?? "" })}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">{t("selectExamPrompt")}</p>
                </div>

                {evaluations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {evaluations.map((ev) => (
                      <Link key={ev.id} href={`/notes?classeId=${classeId}&matiereId=${matiereId}&evaluationId=${ev.id}`}>
                        <div className="halo-hover p-4 rounded-[18px] border border-border bg-teal-tint cursor-pointer flex flex-col justify-between h-28 shadow-sm hover:border-[#14b8a6]/40">
                          <div>
                            <span className="font-bold text-foreground text-base block">{ev.titre}</span>
                            <span className="text-xs text-muted-foreground block mt-1">{t("type")}: {ev.type}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-[#14b8a6] font-semibold uppercase">{t("select")}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#9b6fe0]/5 border border-[#9b6fe0]/15 p-6 rounded-[18px] text-center space-y-4 halo-accent">
                    <p className="text-[#7c3aed] font-medium">
                      {t("noExamPlanned")}
                    </p>
                    <Link href="/evaluations">
                      <Button className="bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#0284c7] hover:to-[#0369a1] text-white gap-2 rounded-xl shadow-[0_4px_12px_hsl(198_65%_46%/0.2)] hover:-translate-y-0.5 transition-all duration-200">
                        <Plus className="h-4 w-4" />
                        {t("scheduleExamShort")}
                      </Button>
                    </Link>
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-border/60">
                  <Link href="/notes">
                    <Button variant="outline" className="rounded-xl border-border hover:border-primary/30 hover:bg-[#0ea5e9]/5">{tCommon("cancel")}</Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Vue d'ensemble par matière — visible quand pas de matière sélectionnée */}
            {!matiereId && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 card-bloom p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-xl sm:text-2xl font-bold font-data text-[#0369a1]">{matieres.length}</p>
                      <p className="text-xs text-muted-foreground">{t("subjectsLabel")}</p>
                    </div>
                    <div className="w-px h-8 bg-border/60" />
                    <div>
                      <p className="text-xl sm:text-2xl font-bold font-data text-[#7c3aed]">{classes.length}</p>
                      <p className="text-xs text-muted-foreground">{t("classesLabel")}</p>
                    </div>
                    <div className="w-px h-8 bg-border/60" />
                    <div>
                      <p className="text-xl sm:text-2xl font-bold font-data text-[#0d9488]">
                        {statsNotes.reduce((sum, s) => sum + s._count, 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("gradesEntered")}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button asChild size="sm" variant="outline" className="gap-2 w-full sm:w-auto rounded-xl border-border hover:border-[#9b6fe0]/30 hover:bg-[#9b6fe0]/5">
                      <Link href="/notes/bulletins">
                        <FileText className="h-4 w-4" />
                        {t("bulletinsBtn")}
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="gap-2 w-full sm:w-auto bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#0284c7] hover:to-[#0369a1] rounded-xl shadow-[0_4px_12px_hsl(198_65%_46%/0.2)] hover:-translate-y-0.5 transition-all duration-200">
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
                  hierarchie={hierarchie}
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
