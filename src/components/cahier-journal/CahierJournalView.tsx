"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { toast } from "sonner";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import {
  BookOpen,
  Calendar,
  Clock,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Users2,
  FileText,
  TrendingUp,
  Paperclip,
  Download,
  Trash2,
  MessageSquare,
  Send,
  Link as LinkIcon,
  Target,
  ListChecks,
  Layers,
  Sparkles,
  PenSquare,
  BookMarked,
  ClipboardList,
  Rocket,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { MobileCard, MobileList, MobileEmptyState } from "@/components/mobile/MobileUI";
import { TableauBordPanel } from "@/components/cahier-journal/TableauBordPanel";

type Statut = "PLANIFIEE" | "EFFECTUEE" | "ANNULEE" | "REPORTEE";
type Rythme = "EN_AVANCE" | "A_TEMPS" | "EN_RETARD" | "NON_EVALUEE";
type DevoirType = "EXERCICE" | "LECTURE" | "REVISION" | "PROJET" | "AUTRE";
type DevoirStatut = "A_FAIRE" | "EN_COURS" | "RENDU" | "CORRIGE";

interface Activite {
  nom: string;
  duree: number;
  type: string;
}

interface Support {
  type: string;
  lien: string;
  description?: string;
}

interface Differentiation {
  eleve?: string;
  groupe?: string;
  adaptation: string;
}

interface PlanLecon {
  id: string;
  titre: string;
  objectifs: string;
  etapes: string;
  differentiation: string | null;
}

interface FichierJoint {
  name: string;
  type: string;
  size: number;
  data: string;
}

interface Commentaire {
  id: string;
  contenu: string;
  createdAt: string;
  auteurId: string | null;
  auteur: { id: string; name: string; avatarUrl?: string | null } | null;
}

interface Seance {
  id: string;
  classeId: string;
  matiereId: string;
  enseignantId: string | null;
  chapitreId: string | null;
  planificationId: string | null;
  planLeconId: string | null;
  date: string;
  dureePrevue: number;
  dureeReelle: number | null;
  statut: Statut;
  semaine: number;
  contenu: string | null;
  rythme: Rythme;
  presents: number | null;
  absents: number | null;
  objectifs?: string[] | null;
  activites?: Activite[] | null;
  supports?: Support[] | null;
  differentiation?: Differentiation[] | null;
  fichiers?: FichierJoint[] | null;
  commentaires?: Commentaire[];
  planLecon?: PlanLecon | null;
  matiere: { id: string; nom: string; code: string; couleur?: string | null };
  enseignant: { id: string; name: string } | null;
  chapitre: { id: string; nom: string } | null;
  classe: { id: string; nom: string; niveau: string };
  competences: {
    competenceId: string;
    niveau: string;
    competence: { id: string; code: string; libelle: string };
  }[];
  devoirs: {
    id: string;
    titre: string;
    dateRendu: string;
    statut: DevoirStatut;
    type: DevoirType;
  }[];
}

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface Matiere {
  id: string;
  nom: string;
  code: string;
  couleur?: string | null;
}

interface Enseignant {
  id: string;
  name: string;
}

interface Props {
  seances: Seance[];
  classes: Classe[];
  /** Hiérarchie catégorie → niveau → classe (scope enseignant appliqué). */
  hierarchie?: ClassesHierarchie;
  matieres: Matiere[];
  enseignants: Enseignant[];
  canWrite: boolean;
  currentUserId?: string;
}

const STATUT_LABELS: Record<Statut, string> = {
  PLANIFIEE: "Planifiée",
  EFFECTUEE: "Effectuée",
  ANNULEE: "Annulée",
  REPORTEE: "Reportée",
};

const STATUT_COLORS: Record<Statut, string> = {
  PLANIFIEE: "bg-slate-100 text-slate-700 border-slate-300",
  EFFECTUEE: "bg-emerald-100 text-emerald-700 border-emerald-300",
  ANNULEE: "bg-red-100 text-red-700 border-red-300",
  REPORTEE: "bg-amber-100 text-amber-700 border-amber-300",
};

const STATUT_DOT: Record<Statut, string> = {
  PLANIFIEE: "bg-slate-400",
  EFFECTUEE: "bg-emerald-500",
  ANNULEE: "bg-red-500",
  REPORTEE: "bg-amber-500",
};

const RYTHME_LABELS: Record<Rythme, string> = {
  EN_AVANCE: "En avance",
  A_TEMPS: "À temps",
  EN_RETARD: "En retard",
  NON_EVALUEE: "Non évaluée",
};

const RYTHME_COLORS: Record<Rythme, string> = {
  EN_AVANCE: "text-emerald-600",
  A_TEMPS: "text-blue-600",
  EN_RETARD: "text-red-600",
  NON_EVALUEE: "text-slate-400",
};

const CALENDAR_STATUT_COLORS: Record<Statut, string> = {
  PLANIFIEE: "bg-slate-100 border-slate-300",
  EFFECTUEE: "bg-green-50 border-green-300",
  ANNULEE: "bg-red-50 border-red-300",
  REPORTEE: "bg-blue-50 border-blue-300",
};

const DEVOIR_TYPE_ICONS: Record<DevoirType, React.ReactNode> = {
  EXERCICE: <PenSquare className="w-3.5 h-3.5" />,
  LECTURE: <BookMarked className="w-3.5 h-3.5" />,
  REVISION: <ClipboardList className="w-3.5 h-3.5" />,
  PROJET: <Rocket className="w-3.5 h-3.5" />,
  AUTRE: <HelpCircle className="w-3.5 h-3.5" />,
};

const DEVOIR_TYPE_COLORS: Record<DevoirType, string> = {
  EXERCICE: "bg-blue-100 text-blue-700 border-blue-200",
  LECTURE: "bg-amber-100 text-amber-700 border-amber-200",
  REVISION: "bg-violet-100 text-violet-700 border-violet-200",
  PROJET: "bg-emerald-100 text-emerald-700 border-emerald-200",
  AUTRE: "bg-slate-100 text-slate-700 border-slate-200",
};

const JOURS_SEMAINE = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export function CahierJournalView({
  seances,
  classes,
  hierarchie,
  matieres,
  enseignants,
  canWrite,
  currentUserId,
}: Props) {
  const t = useTranslations("cahierJournal");
  const libelleNiveau = useLibelleNiveau();
  const [filterClasse, setFilterClasse] = useState<string>("");
  const [filterMatiere, setFilterMatiere] = useState<string>("");
  const [filterStatut, setFilterStatut] = useState<string>("");
  const [viewMode, setViewMode] = useState<"timeline" | "list" | "calendar">("timeline");
  const [expandedSeance, setExpandedSeance] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number>(() => {
    // Default to the week of the first seance, or week 1
    const minSem = seances.length > 0 ? Math.min(...seances.map((s) => s.semaine)) : 1;
    return minSem;
  });
  const [generating, setGenerating] = useState(false);

  // ── Lazy-loading des détails d'une séance ──────────────────────
  // Les séances sont chargées avec des includes légers (matiere, classe,
  // enseignant, chapitre). Les détails (compétences, devoirs, plan leçon,
  // commentaires) sont fetchés à la demande quand l'utilisateur déplie
  // une séance, via l'API GET /api/cahier-journal/seances/[id].
  const [seanceDetails, setSeanceDetails] = useState<Record<string, Partial<Seance>>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!expandedSeance) return;
    // Skip if already loaded
    if (seanceDetails[expandedSeance]) return;
    let cancelled = false;
    setLoadingDetail(true);
    fetch(`/api/cahier-journal/seances/${expandedSeance}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSeanceDetails((prev) => ({
          ...prev,
          [expandedSeance]: {
            competences: (data.competences ?? []).map((sc: any) => ({
              competenceId: sc.competenceId,
              niveau: sc.niveau,
              competence: sc.competence,
            })),
            devoirs: (data.devoirs ?? []).map((d: any) => ({
              id: d.id,
              titre: d.titre,
              dateRendu: d.dateRendu ? new Date(d.dateRendu).toISOString() : "",
              statut: d.statut,
              type: d.type,
            })),
            planLecon: data.planLecon
              ? {
                  id: data.planLecon.id,
                  titre: data.planLecon.titre,
                  objectifs: data.planLecon.objectifs,
                  etapes: data.planLecon.etapes,
                  differentiation: data.planLecon.differentiation,
                }
              : null,
            commentaires: (data.commentaires ?? []).map((c: any) => ({
              id: c.id,
              contenu: c.contenu,
              createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "",
              auteurId: c.auteurId,
              auteur: c.auteur
                ? { id: c.auteur.id, name: c.auteur.name, avatarUrl: c.auteur.avatarUrl }
                : null,
            })),
            fichiers: data.fichiers ?? null,
          },
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedSeance, seanceDetails]);

  /** Fusionne une séance avec ses détails chargés à la demande. */
  const getSeanceWithDetails = useCallback(
    (s: Seance): Seance => {
      const details = seanceDetails[s.id];
      if (!details) return s;
      return { ...s, ...details };
    },
    [seanceDetails],
  );

  const filtered = useMemo(() => {
    return seances.filter((s) => {
      if (filterClasse && s.classeId !== filterClasse) return false;
      if (filterMatiere && s.matiereId !== filterMatiere) return false;
      if (filterStatut && s.statut !== filterStatut) return false;
      return true;
    });
  }, [seances, filterClasse, filterMatiere, filterStatut]);

  // Grouper par matière pour la timeline métro.
  const parMatiere = useMemo(() => {
    const map = new Map<string, Seance[]>();
    for (const s of filtered) {
      const arr = map.get(s.matiereId) ?? [];
      arr.push(s);
      map.set(s.matiereId, arr);
    }
    return Array.from(map.entries()).map(([matiereId, seancesList]) => ({
      matiere: matieres.find((m) => m.id === matiereId),
      seances: seancesList.sort((a, b) => a.semaine - b.semaine),
    }));
  }, [filtered, matieres]);

  // KPIs.
  const kpis = useMemo(() => {
    const total = filtered.length;
    const effectuees = filtered.filter((s) => s.statut === "EFFECTUEE").length;
    const planifiees = filtered.filter((s) => s.statut === "PLANIFIEE").length;
    const annulees = filtered.filter((s) => s.statut === "ANNULEE").length;
    const enRetard = filtered.filter((s) => s.rythme === "EN_RETARD").length;
    const tauxRealisation = total > 0 ? Math.round((effectuees / total) * 100) : 0;
    return { total, effectuees, planifiees, annulees, enRetard, tauxRealisation };
  }, [filtered]);

  // Séances de la semaine courante pour la vue calendrier.
  const seancesSemaineCourante = useMemo(() => {
    return filtered.filter((s) => s.semaine === currentWeek);
  }, [filtered, currentWeek]);

  // Grouper par jour de la semaine (0=Lundi … 6=Dimanche).
  const seancesParJour = useMemo(() => {
    const jours: Seance[][] = [[], [], [], [], [], [], []];
    for (const s of seancesSemaineCourante) {
      const js = new Date(s.date).getDay(); // 0=Dim … 6=Sam
      const idx = js === 0 ? 6 : js - 1; // 0=Lun … 6=Dim
      jours[idx].push(s);
    }
    // Trier par heure de début dans chaque jour.
    for (const arr of jours) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return jours;
  }, [seancesSemaineCourante]);

  const handleGenererSemaine = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/cahier-journal/generer-semaine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semaine: currentWeek }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t("genererErreur"));
        return;
      }
      const count = data.crees ?? 0;
      toast.success(t("genererSuccess", { count }));
      if (count > 0) {
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch {
      toast.error(t("genererErreur"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<BookOpen className="w-4 h-4" />}
          label="Total séances"
          value={kpis.total}
          color="bg-slate-50 text-slate-700"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Effectuées"
          value={kpis.effectuees}
          color="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Planifiées"
          value={kpis.planifiees}
          color="bg-blue-50 text-blue-700"
        />
        <KpiCard
          icon={<XCircle className="w-4 h-4" />}
          label="Annulées"
          value={kpis.annulees}
          color="bg-red-50 text-red-700"
        />
        <KpiCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="En retard"
          value={kpis.enRetard}
          color="bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Taux réalisation"
          value={`${kpis.tauxRealisation}%`}
          color="bg-violet-50 text-violet-700"
        />
      </div>

      {/* Widget Travail à faire — séances non renseignées avec deadline */}
      {canWrite && <TravailAFaire seances={seances} />}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={filterClasse}
          onChange={(e) => setFilterClasse(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white min-w-0 flex-1 sm:flex-none sm:max-w-[200px]"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} ({libelleNiveau(c.niveau)})
            </option>
          ))}
        </select>
        <select
          value={filterMatiere}
          onChange={(e) => setFilterMatiere(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white min-w-0 flex-1 sm:flex-none sm:max-w-[200px]"
        >
          <option value="">Toutes les matières</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white min-w-0 flex-1 sm:flex-none sm:max-w-[200px]"
        >
          <option value="">Tous les statuts</option>
          <option value="PLANIFIEE">Planifiée</option>
          <option value="EFFECTUEE">Effectuée</option>
          <option value="ANNULEE">Annulée</option>
          <option value="REPORTEE">Reportée</option>
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setViewMode("timeline")}
            className={`text-sm px-3 py-1.5 rounded-md ${
              viewMode === "timeline"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`text-sm px-3 py-1.5 rounded-md ${
              viewMode === "list"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Liste
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md ${
              viewMode === "calendar"
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            {t("calendar")}
          </button>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Nouvelle séance
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      {showCreateForm && canWrite && (
        <CreateSeanceForm
          classes={classes}
          matieres={matieres}
          enseignants={enseignants}
          onClose={() => setShowCreateForm(false)}
        />
      )}

      {/* Vue Timeline métro */}
      {viewMode === "timeline" && (
        <div className="space-y-4">
          {parMatiere.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              Aucune séance à afficher avec ces filtres.
            </div>
          )}
          {parMatiere.map(({ matiere, seances: seancesList }) => (
            <div
              key={matiere?.id}
              className="bg-white rounded-lg border border-slate-200 p-4"
            >
              {/* En-tête ligne métro */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: matiere?.couleur ?? "#64748b" }}
                />
                <h3 className="font-semibold text-slate-800">
                  {matiere?.nom ?? "Matière inconnue"}
                </h3>
                <span className="text-xs text-slate-400">
                  {seancesList.length} séance{seancesList.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Vue mobile — liste verticale de séances */}
              <div className="lg:hidden space-y-3">
                {seancesList.length === 0 ? (
                  <MobileEmptyState
                    icon={<BookOpen className="w-8 h-8" />}
                    title="Aucune séance"
                  />
                ) : (
                  <MobileList>
                    {seancesList.map((s) => (
                      <MobileCard
                        key={s.id}
                        accentColor={
                          s.statut === "EFFECTUEE" ? "#22c55e"
                          : s.statut === "ANNULEE" ? "#ef4444"
                          : s.statut === "REPORTEE" ? "#f59e0b"
                          : "#6b7280"
                        }
                        onClick={() => setExpandedSeance(expandedSeance === s.id ? null : s.id)}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${STATUT_DOT[s.statut]}`}>
                              {s.semaine}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                              </p>
                              <p className={`text-[10px] ${RYTHME_COLORS[s.rythme]}`}>
                                {STATUT_LABELS[s.statut]}
                              </p>
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedSeance === s.id ? "rotate-180" : ""}`} />
                        </div>
                        {s.chapitre && (
                          <p className="text-xs text-muted-foreground pl-10 truncate">
                            {s.chapitre.nom}
                          </p>
                        )}
                        {expandedSeance === s.id && (
                          <div className="pt-2 border-t space-y-1.5 text-xs text-muted-foreground">
                            {s.contenu && <p>{s.contenu}</p>}
                            {(() => {
                              const sd = getSeanceWithDetails(s);
                              return sd.competences && sd.competences.length > 0 ? (
                                <p className="flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3" />
                                  {sd.competences.length} compétence(s)
                                </p>
                              ) : loadingDetail ? (
                                <p className="flex items-center gap-1 text-slate-300">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  …
                                </p>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </MobileCard>
                    ))}
                  </MobileList>
                )}
              </div>

              {/* Vue desktop — ligne métro horizontale */}
              <div className="hidden lg:block relative overflow-x-auto scrollbar-thin">
                <div className="flex items-start gap-0 min-w-max pb-2">
                  {/* Ligne horizontale */}
                  <div
                    className="absolute top-4 left-0 right-0 h-0.5"
                    style={{ backgroundColor: matiere?.couleur ?? "#cbd5e1" }}
                  />
                  {seancesList.map((s) => (
                    <div
                      key={s.id}
                      className="relative flex flex-col items-center group cursor-pointer"
                      style={{ minWidth: "80px" }}
                      onClick={() =>
                        setExpandedSeance(
                          expandedSeance === s.id ? null : s.id
                        )
                      }
                    >
                      {/* Station */}
                      <div
                        className={`relative z-10 w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${STATUT_DOT[s.statut]}`}
                        title={`Semaine ${s.semaine} — ${STATUT_LABELS[s.statut]}`}
                      >
                        <span className="text-[10px] font-bold text-white">
                          {s.semaine}
                        </span>
                      </div>
                      {/* Label */}
                      <div className="mt-2 text-center">
                        <div className="text-[10px] text-slate-500">
                          {new Date(s.date).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </div>
                        <div
                          className={`text-[9px] mt-0.5 ${RYTHME_COLORS[s.rythme]}`}
                        >
                          {RYTHME_LABELS[s.rythme]}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Détail séance expandée */}
              {expandedSeance &&
                seancesList.find((s) => s.id === expandedSeance) && (
                  <SeanceDetail
                    seance={getSeanceWithDetails(seancesList.find((s) => s.id === expandedSeance)!)}
                    canWrite={canWrite}
                    currentUserId={currentUserId}
                    loadingDetail={loadingDetail}
                  />
                )}
            </div>
          ))}
        </div>
      )}

      {/* Vue Liste */}
      {viewMode === "list" && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {/* Mobile — cartes tactiles : 8 colonnes ne tiennent pas sous 768px */}
          <div className="md:hidden p-3">
            {filtered.length === 0 ? (
              <MobileEmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="Aucune séance à afficher."
              />
            ) : (
              <MobileList>
                {filtered.map((s) => (
                  <MobileCard
                    key={s.id}
                    accentColor={s.matiere.couleur ?? undefined}
                    onClick={() =>
                      setExpandedSeance(expandedSeance === s.id ? null : s.id)
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">
                          {s.matiere.nom}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {s.classe.nom} · {s.enseignant?.name ?? "—"}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${STATUT_COLORS[s.statut]}`}
                      >
                        {STATUT_LABELS[s.statut]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{new Date(s.date).toLocaleDateString("fr-FR")}</span>
                      <span>S{s.semaine}</span>
                      <span>{s.dureeReelle ?? s.dureePrevue} min</span>
                      <span className={RYTHME_COLORS[s.rythme]}>
                        {RYTHME_LABELS[s.rythme]}
                      </span>
                    </div>
                  </MobileCard>
                ))}
              </MobileList>
            )}
          </div>

          {/* Desktop — tableau défilable horizontalement si la fenêtre est étroite
              (le workspace peut réduire une fenêtre à un quart de l'écran) */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Semaine</th>
                <th className="text-left px-4 py-2 font-medium">Matière</th>
                <th className="text-left px-4 py-2 font-medium">Classe</th>
                <th className="text-left px-4 py-2 font-medium">Enseignant</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
                <th className="text-left px-4 py-2 font-medium">Rythme</th>
                <th className="text-left px-4 py-2 font-medium">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() =>
                    setExpandedSeance(expandedSeance === s.id ? null : s.id)
                  }
                >
                  <td className="px-4 py-2 text-slate-700">
                    {new Date(s.date).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-2 text-slate-500">S{s.semaine}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: s.matiere.couleur ?? "#64748b",
                        }}
                      />
                      <span className="text-slate-700">{s.matiere.nom}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.classe.nom}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {s.enseignant?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${STATUT_COLORS[s.statut]}`}
                    >
                      {STATUT_LABELS[s.statut]}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2 text-xs ${RYTHME_COLORS[s.rythme]}`}
                  >
                    {RYTHME_LABELS[s.rythme]}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {s.dureeReelle ?? s.dureePrevue} min
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    Aucune séance à afficher.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Vue Calendrier */}
      {viewMode === "calendar" && (
        <div className="space-y-3">
          {/* Navigation semaine + génération */}
          <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
            <button
              onClick={() => setCurrentWeek((w) => Math.max(1, w - 1))}
              disabled={currentWeek <= 1}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("semainePrecedente")}
            </button>
            <span className="text-sm font-semibold text-slate-700">
              S{currentWeek}
            </span>
            <button
              onClick={() => setCurrentWeek((w) => Math.min(36, w + 1))}
              disabled={currentWeek >= 36}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
            >
              {t("semaineSuivante")}
              <ChevronRight className="w-4 h-4" />
            </button>
            {canWrite && (
              <button
                onClick={handleGenererSemaine}
                disabled={generating}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 ml-auto"
              >
                <Sparkles className="w-4 h-4" />
                {generating ? "…" : t("genererSemaine")}
              </button>
            )}
          </div>

          {/* Grille des jours — progressive : 7 colonnes seulement quand la
              largeur le permet réellement (xl), sinon on empile par paliers. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            {JOURS_SEMAINE.map((jourLabel, idx) => (
              <div
                key={jourLabel}
                className="bg-white rounded-lg border border-slate-200 min-h-[120px]"
              >
                <div className="text-xs font-semibold text-slate-600 text-center py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
                  {jourLabel}
                </div>
                <div className="p-1.5 space-y-1.5">
                  {seancesParJour[idx].length === 0 ? (
                    <p className="text-[10px] text-slate-300 text-center py-4">—</p>
                  ) : (
                    seancesParJour[idx].map((s) => (
                      <div
                        key={s.id}
                        onClick={() =>
                          setExpandedSeance(expandedSeance === s.id ? null : s.id)
                        }
                        className={`cursor-pointer rounded-md border p-2 text-xs space-y-1 transition-shadow hover:shadow-sm ${CALENDAR_STATUT_COLORS[s.statut]}`}
                      >
                        <div className="flex items-center gap-1 text-slate-700">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span className="font-medium">
                            {new Date(s.date).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="font-medium text-slate-800 truncate">
                          {s.classe.nom}
                        </div>
                        <div className="text-slate-600 truncate">
                          {s.matiere.nom}
                        </div>
                        <span
                          className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border ${STATUT_COLORS[s.statut]}`}
                        >
                          {STATUT_LABELS[s.statut]}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Détail séance sélectionnée dans le calendrier */}
          {expandedSeance &&
            seancesSemaineCourante.find((s) => s.id === expandedSeance) && (
              <SeanceDetail
                seance={getSeanceWithDetails(seancesSemaineCourante.find((s) => s.id === expandedSeance)!)}
                canWrite={canWrite}
                currentUserId={currentUserId}
                loadingDetail={loadingDetail}
              />
            )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-200 p-3 ${color}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function SeanceDetail({ seance, canWrite, currentUserId, loadingDetail }: { seance: Seance; canWrite: boolean; currentUserId?: string; loadingDetail?: boolean }) {
  const t = useTranslations("cahierJournal");
  const libelleNiveau = useLibelleNiveau();
  return (
    <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
      {loadingDetail && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Chargement des détails…</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="text-slate-700">
          {new Date(seance.date).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
        <span className="text-slate-400">•</span>
        <Clock className="w-4 h-4 text-slate-400" />
        <span className="text-slate-600">
          {seance.dureeReelle ?? seance.dureePrevue} min
          {seance.dureeReelle && seance.dureeReelle !== seance.dureePrevue && (
            <span className="text-slate-400">
              {" "}
              (prévu: {seance.dureePrevue} min)
            </span>
          )}
        </span>
      </div>

      {seance.chapitre && (
        <div className="flex items-center gap-2 text-sm">
          <GraduationCap className="w-4 h-4 text-slate-400" />
          <span className="text-slate-700">{seance.chapitre.nom}</span>
        </div>
      )}

      {/* Tableau de bord avant-séance (prédictions, plan de leçon, exercices) */}
      {canWrite && seance.statut === "PLANIFIEE" && (
        <TableauBordPanel seanceId={seance.id} />
      )}

      {seance.contenu && (
        <div className="text-sm">
          <div className="flex items-center gap-1.5 text-slate-500 mb-1">
            <FileText className="w-3.5 h-3.5" />
            <span className="font-medium">Contenu traité</span>
          </div>
          <p className="text-slate-700 whitespace-pre-wrap pl-5">
            {seance.contenu}
          </p>
        </div>
      )}

      {/* Sections structurées */}
      <ObjectifsSection seance={seance} canWrite={canWrite} t={t} />
      <ActivitesSection seance={seance} canWrite={canWrite} t={t} />
      <SupportsSection seance={seance} canWrite={canWrite} t={t} />
      <DifferentiationSection seance={seance} canWrite={canWrite} t={t} />
      <PlanLeconSection seance={seance} t={t} />

      {seance.competences.length > 0 && (
        <div className="text-sm">
          <div className="flex items-center gap-1.5 text-slate-500 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-medium">Compétences abordées</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-5">
            {seance.competences.map((sc) => (
              <span
                key={sc.competenceId}
                className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600"
              >
                {sc.competence.code} — {sc.competence.libelle}
                <span className="text-slate-400 ml-1">({libelleNiveau(sc.niveau)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(seance.presents !== null || seance.absents !== null) && (
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <Users2 className="w-4 h-4 text-slate-400" />
          {seance.presents !== null && (
            <span>{seance.presents} présents</span>
          )}
          {seance.absents !== null && <span>{seance.absents} absents</span>}
        </div>
      )}

      <DevoirsSection seance={seance} canWrite={canWrite} t={t} />

      <FichiersSection seance={seance} canWrite={canWrite} t={t} />
      <CommentairesSection seance={seance} canWrite={canWrite} currentUserId={currentUserId} t={t} />
    </div>
  );
}

/* ---------- Section Objectifs ---------- */

function ObjectifsSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const objectifs = seance.objectifs ?? [];
  const [items, setItems] = useState<string[]>(objectifs);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      await fetch(`/api/cahier-journal/seances/${seance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectifs: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    if (!input.trim()) return;
    const next = [...items, input.trim()];
    setItems(next);
    setInput("");
    save(next);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save(next);
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <Target className="w-3.5 h-3.5" />
        <span className="font-medium">{t("objectifs")}</span>
      </div>
      <div className="pl-5 space-y-1">
        {items.length === 0 && !canWrite && (
          <p className="text-slate-400 text-xs">—</p>
        )}
        {items.map((obj, i) => (
          <div key={i} className="flex items-center gap-2 text-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span className="flex-1">{obj}</span>
            {canWrite && (
              <button
                onClick={() => remove(i)}
                className="text-red-400 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
              placeholder={t("ajouterObjectif")}
              className="flex-1 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <button
              onClick={add}
              disabled={!input.trim() || saving}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Section Activités ---------- */

function ActivitesSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const activites = seance.activites ?? [];
  const [items, setItems] = useState<Activite[]>(activites);
  const [nom, setNom] = useState("");
  const [duree, setDuree] = useState(15);
  const [type, setType] = useState("magistral");
  const [saving, setSaving] = useState(false);

  const save = async (next: Activite[]) => {
    setSaving(true);
    try {
      await fetch(`/api/cahier-journal/seances/${seance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activites: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    if (!nom.trim()) return;
    const next = [...items, { nom: nom.trim(), duree, type }];
    setItems(next);
    setNom("");
    setDuree(15);
    setType("magistral");
    save(next);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save(next);
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <ListChecks className="w-3.5 h-3.5" />
        <span className="font-medium">{t("activites")}</span>
      </div>
      <div className="pl-5 space-y-1">
        {items.length === 0 && !canWrite && (
          <p className="text-slate-400 text-xs">—</p>
        )}
        {items.map((act, i) => (
          <div key={i} className="flex items-center gap-2 text-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="flex-1">{act.nom}</span>
            <span className="text-xs text-slate-500">
              {act.duree} {t("dureeMin")}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
              {act.type}
            </span>
            {canWrite && (
              <button
                onClick={() => remove(i)}
                className="text-red-400 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom"
              className="flex-1 min-w-[120px] text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="number"
              value={duree}
              onChange={(e) => setDuree(Number(e.target.value))}
              min={1}
              className="w-16 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Type"
              className="w-24 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <button
              onClick={add}
              disabled={!nom.trim() || saving}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              {t("ajouterActivite")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Section Supports ---------- */

function SupportsSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const supports = seance.supports ?? [];
  const [items, setItems] = useState<Support[]>(supports);
  const [type, setType] = useState("lien");
  const [lien, setLien] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: Support[]) => {
    setSaving(true);
    try {
      await fetch(`/api/cahier-journal/seances/${seance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supports: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    if (!lien.trim()) return;
    const next = [...items, { type, lien: lien.trim(), description: description.trim() || undefined }];
    setItems(next);
    setType("lien");
    setLien("");
    setDescription("");
    save(next);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save(next);
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <LinkIcon className="w-3.5 h-3.5" />
        <span className="font-medium">{t("supports")}</span>
      </div>
      <div className="pl-5 space-y-1">
        {items.length === 0 && !canWrite && (
          <p className="text-slate-400 text-xs">—</p>
        )}
        {items.map((sup, i) => (
          <div key={i} className="flex items-center gap-2 text-slate-700">
            <LinkIcon className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
              {sup.type}
            </span>
            <a
              href={sup.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline truncate flex-1"
            >
              {sup.lien}
            </a>
            {sup.description && (
              <span className="text-xs text-slate-500 truncate max-w-[200px]">
                {sup.description}
              </span>
            )}
            {canWrite && (
              <button
                onClick={() => remove(i)}
                className="text-red-400 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Type"
              className="w-20 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="text"
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              placeholder="Lien"
              className="flex-1 min-w-[120px] text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optionnel)"
              className="flex-1 min-w-[120px] text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <button
              onClick={add}
              disabled={!lien.trim() || saving}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              {t("ajouterSupport")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Section Différenciation ---------- */

function DifferentiationSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const differentiation = seance.differentiation ?? [];
  const [items, setItems] = useState<Differentiation[]>(differentiation);
  const [eleve, setEleve] = useState("");
  const [groupe, setGroupe] = useState("");
  const [adaptation, setAdaptation] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: Differentiation[]) => {
    setSaving(true);
    try {
      await fetch(`/api/cahier-journal/seances/${seance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ differentiation: next }),
      });
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    if (!adaptation.trim()) return;
    const next = [...items, {
      eleve: eleve.trim() || undefined,
      groupe: groupe.trim() || undefined,
      adaptation: adaptation.trim(),
    }];
    setItems(next);
    setEleve("");
    setGroupe("");
    setAdaptation("");
    save(next);
  };

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save(next);
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <Layers className="w-3.5 h-3.5" />
        <span className="font-medium">{t("differentiation")}</span>
      </div>
      <div className="pl-5 space-y-1">
        {items.length === 0 && !canWrite && (
          <p className="text-slate-400 text-xs">—</p>
        )}
        {items.map((diff, i) => (
          <div key={i} className="flex items-center gap-2 text-slate-700">
            <Users2 className="w-3 h-3 text-slate-400" />
            {diff.eleve && (
              <span className="text-xs font-medium text-slate-600">
                {diff.eleve}
              </span>
            )}
            {diff.groupe && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                {diff.groupe}
              </span>
            )}
            <span className="flex-1 text-slate-700">{diff.adaptation}</span>
            {canWrite && (
              <button
                onClick={() => remove(i)}
                className="text-red-400 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input
              type="text"
              value={eleve}
              onChange={(e) => setEleve(e.target.value)}
              placeholder="Élève (optionnel)"
              className="w-32 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="text"
              value={groupe}
              onChange={(e) => setGroupe(e.target.value)}
              placeholder="Groupe (optionnel)"
              className="w-32 text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <input
              type="text"
              value={adaptation}
              onChange={(e) => setAdaptation(e.target.value)}
              placeholder="Adaptation"
              className="flex-1 min-w-[120px] text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            />
            <button
              onClick={add}
              disabled={!adaptation.trim() || saving}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              {t("ajouterDifferentiation")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Section Plan de leçon ---------- */

function PlanLeconSection({
  seance,
  t,
}: {
  seance: Seance;
  t: ReturnType<typeof useTranslations>;
}) {
  const plan = seance.planLecon;
  if (!plan) return null;

  let objectifs: string[] = [];
  try {
    objectifs = JSON.parse(plan.objectifs);
  } catch {
    objectifs = [];
  }

  let etapes: { nom: string; duree?: number; description?: string; support?: string }[] = [];
  try {
    etapes = JSON.parse(plan.etapes);
  } catch {
    etapes = [];
  }

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <Sparkles className="w-3.5 h-3.5" />
        <span className="font-medium">{t("planLecon")}</span>
      </div>
      <div className="pl-5 space-y-2">
        <p className="text-xs font-medium text-slate-700">{plan.titre}</p>
        {objectifs.length > 0 && (
          <div>
            <span className="text-xs text-slate-500">{t("objectifs")}:</span>
            <ul className="ml-3 mt-0.5 space-y-0.5">
              {objectifs.map((o, i) => (
                <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-slate-400" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        )}
        {etapes.length > 0 && (
          <div>
            <span className="text-xs text-slate-500">{t("activites")}:</span>
            <ul className="ml-3 mt-0.5 space-y-0.5">
              {etapes.map((e, i) => (
                <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                  <span>{e.nom}</span>
                  {e.duree && (
                    <span className="text-slate-400">
                      ({e.duree} {t("dureeMin")})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.differentiation && (
          <p className="text-xs text-slate-600">
            <span className="text-slate-500">{t("differentiation")}:</span>{" "}
            {plan.differentiation}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- Section Devoirs (avec type + alerte retard) ---------- */

function DevoirsSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const devoirs = seance.devoirs;
  const [showForm, setShowForm] = useState(false);
  const [titre, setTitre] = useState("");
  const [dateRendu, setDateRendu] = useState("");
  const [type, setType] = useState<DevoirType>("EXERCICE");
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();

  const isEnRetard = (d: { dateRendu: string; statut: string }) => {
    return (
      new Date(d.dateRendu) < now &&
      (d.statut === "A_FAIRE" || d.statut === "EN_COURS")
    );
  };

  const joursRetard = (dateRendu: string) => {
    const diff = Math.floor(
      (now.getTime() - new Date(dateRendu).getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(0, diff);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim() || !dateRendu) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/devoirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId: seance.classeId,
          matiereId: seance.matiereId,
          titre: titre.trim(),
          dateRendu,
          type,
        }),
      });
      if (res.ok) {
        setTitre("");
        setDateRendu("");
        setType("EXERCICE");
        setShowForm(false);
        window.location.reload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <FileText className="w-3.5 h-3.5" />
        <span className="font-medium">Devoirs rattachés</span>
      </div>
      <ul className="pl-5 space-y-1">
        {devoirs.length === 0 && !canWrite && (
          <p className="text-slate-400 text-xs">—</p>
        )}
        {devoirs.map((d) => {
          const retard = isEnRetard(d);
          const jours = joursRetard(d.dateRendu);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-slate-600">
              <span className="flex items-center gap-1">
                {DEVOIR_TYPE_ICONS[d.type]}
                {d.titre}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${DEVOIR_TYPE_COLORS[d.type]}`}
              >
                {t(d.type as any)}
              </span>
              <span className="text-xs text-slate-500">
                — {new Date(d.dateRendu).toLocaleDateString("fr-FR")} ({d.statut})
              </span>
              {retard && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-600 text-white">
                  <AlertCircle className="w-3 h-3" />
                  {t("enRetard")}
                  <span className="ml-0.5">
                    ({t("joursRetard", { days: jours })})
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <div className="pl-5 mt-2">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Devoir
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Titre"
                required
                className="flex-1 min-w-[120px] text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
              />
              <input
                type="date"
                value={dateRendu}
                onChange={(e) => setDateRendu(e.target.value)}
                required
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DevoirType)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
              >
                <option value="EXERCICE">{t("EXERCICE")}</option>
                <option value="LECTURE">{t("LECTURE")}</option>
                <option value="REVISION">{t("REVISION")}</option>
                <option value="PROJET">{t("PROJET")}</option>
                <option value="AUTRE">{t("AUTRE")}</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "…" : "OK"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function FichiersSection({
  seance,
  canWrite,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fichiers = seance.fichiers ?? [];

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);

      if (file.size > 10 * 1024 * 1024) {
        setError(t("fichierTropVolumineux"));
        e.target.value = "";
        return;
      }
      if (fichiers.length >= 5) {
        setError(t("tropDeFichiers"));
        e.target.value = "";
        return;
      }

      const allowed = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text",
        "image/jpeg",
        "image/png",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ];
      if (!allowed.includes(file.type)) {
        setError(t("typeFichierNonAutorise"));
        e.target.value = "";
        return;
      }

      setUploading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const res = await fetch(
              `/api/cahier-journal/seances/${seance.id}/fichiers`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  data: base64,
                }),
              },
            );
            if (!res.ok) {
              setError(t("uploadError"));
              return;
            }
            window.location.reload();
          } catch {
            setError(t("uploadError"));
          } finally {
            setUploading(false);
          }
        };
        reader.readAsDataURL(file);
      } catch {
        setError(t("uploadError"));
        setUploading(false);
      }
      e.target.value = "";
    },
    [fichiers.length, seance.id, t],
  );

  const handleDelete = async (index: number) => {
    try {
      const res = await fetch(
        `/api/cahier-journal/seances/${seance.id}/fichiers`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index }),
        },
      );
      if (!res.ok) {
        setError(t("deleteError"));
        return;
      }
      window.location.reload();
    } catch {
      setError(t("deleteError"));
    }
  };

  const handleDownload = (f: FichierJoint) => {
    const link = document.createElement("a");
    link.href = `data:${f.type};base64,${f.data}`;
    link.download = f.name;
    link.click();
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <Paperclip className="w-3.5 h-3.5" />
        <span className="font-medium">{t("fichiers")}</span>
      </div>
      {fichiers.length === 0 ? (
        <p className="text-slate-400 text-xs pl-5">{t("aucunFichier")}</p>
      ) : (
        <ul className="pl-5 space-y-1">
          {fichiers.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-slate-600">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-slate-400">
                {(f.size / 1024).toFixed(0)} Ko
              </span>
              <button
                onClick={() => handleDownload(f)}
                className="text-blue-600 hover:text-blue-700"
                title={t("telechargerFichier")}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              {canWrite && (
                <button
                  onClick={() => handleDelete(i)}
                  className="text-red-500 hover:text-red-600"
                  title={t("supprimerFichier")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="pl-5 mt-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png,.xlsx,.pptx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || fichiers.length >= 5}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
          >
            <Paperclip className="w-3.5 h-3.5" />
            {uploading ? "..." : t("joindreFichier")}
          </button>
        </div>
      )}
      {error && (
        <p className="pl-5 mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function CommentairesSection({
  seance,
  canWrite,
  currentUserId,
  t,
}: {
  seance: Seance;
  canWrite: boolean;
  currentUserId?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [contenu, setContenu] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentaires = seance.commentaires ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contenu.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cahier-journal/seances/${seance.id}/commentaires`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contenu }),
        },
      );
      if (!res.ok) {
        setError(t("commentaireError"));
        return;
      }
      setContenu("");
      window.location.reload();
    } catch {
      setError(t("commentaireError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentaireId: string) => {
    if (!confirm(t("confirmSupprimerCommentaire"))) return;
    try {
      const res = await fetch(
        `/api/cahier-journal/seances/${seance.id}/commentaires`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentaireId }),
        },
      );
      if (!res.ok) {
        setError(t("commentaireError"));
        return;
      }
      window.location.reload();
    } catch {
      setError(t("commentaireError"));
    }
  };

  return (
    <div className="text-sm border-t border-slate-200 pt-3">
      <div className="flex items-center gap-1.5 text-slate-500 mb-2">
        <MessageSquare className="w-3.5 h-3.5" />
        <span className="font-medium">{t("commentaires")}</span>
      </div>
      {commentaires.length === 0 ? (
        <p className="text-slate-400 text-xs pl-5">{t("aucunCommentaire")}</p>
      ) : (
        <div className="pl-5 space-y-2">
          {commentaires.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-md border border-slate-200 p-2.5"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {c.auteur?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small avatar, not worth Image optimization
                    <img
                      src={c.auteur.avatarUrl}
                      alt=""
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[10px] text-white font-bold">
                      {(c.auteur?.name ?? "?")[0]}
                    </div>
                  )}
                  <span className="text-xs font-medium text-slate-700">
                    {c.auteur?.name ?? "—"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {c.auteurId && (c.auteurId === currentUserId || canWrite) && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-red-400 hover:text-red-500"
                    title={t("supprimerCommentaire")}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">
                {c.contenu}
              </p>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="pl-5 mt-2 flex gap-2">
          <input
            type="text"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder={t("commentairePlaceholder")}
            maxLength={2000}
            className="flex-1 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white"
          />
          <button
            type="submit"
            disabled={submitting || !contenu.trim()}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            {submitting ? "..." : t("ajouterCommentaire")}
          </button>
      </form>
      {error && (
        <p className="pl-5 mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Widget Travail à faire — séances non renseignées avec deadline
// ──────────────────────────────────────────────────────────────

function TravailAFaire({ seances }: { seances: Seance[] }) {
  const t = useTranslations("cahierJournal");
  const libelleNiveau = useLibelleNiveau();
  const now = new Date();

  // Séances PLANIFIEE dont la date est passée ou aujourd'hui → à remplir.
  const aRemplir = useMemo(() => {
    return seances
      .filter((s) => s.statut === "PLANIFIEE")
      .filter((s) => new Date(s.date) <= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now is stable per render
  }, [seances]);

  // Séances de cette semaine (tous statuts) pour le progress.
  const semaineActuelle = useMemo(() => {
    const debutSemaine = new Date(now);
    debutSemaine.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Lundi
    debutSemaine.setHours(0, 0, 0, 0);
    const finSemaine = new Date(debutSemaine);
    finSemaine.setDate(debutSemaine.getDate() + 7);
    return seances.filter((s) => {
      const d = new Date(s.date);
      return d >= debutSemaine && d < finSemaine;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- now is stable per render
  }, [seances]);

  const totalSemaine = semaineActuelle.length;
  const rempliesSemaine = semaineActuelle.filter(
    (s) => s.statut === "EFFECTUEE" || s.statut === "ANNULEE" || s.statut === "REPORTEE"
  ).length;
  const tauxSemaine = totalSemaine > 0 ? Math.round((rempliesSemaine / totalSemaine) * 100) : 100;

  if (aRemplir.length === 0 && tauxSemaine === 100) return null;

  function joursEcart(dateStr: string): number {
    const d = new Date(dateStr);
    return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-slate-800">
          {t("travailAFaire")}
        </h3>
      </div>

      {/* Progress de la semaine */}
      {totalSemaine > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t("progressionSemaine")}</span>
            <span className="font-medium">
              {rempliesSemaine}/{totalSemaine} ({tauxSemaine}%)
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                tauxSemaine >= 80
                  ? "bg-emerald-500"
                  : tauxSemaine >= 50
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${tauxSemaine}%` }}
            />
          </div>
        </div>
      )}

      {/* Liste des séances en retard de renseignement */}
      {aRemplir.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium">
            {t("seancesARemplir")} ({aRemplir.length})
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {aRemplir.slice(0, 10).map((s) => {
              const jours = joursEcart(s.date);
              const enRetard = jours > 0;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 border ${
                    enRetard
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <Clock
                    className={`w-3 h-3 flex-shrink-0 ${
                      enRetard ? "text-red-500" : "text-amber-500"
                    }`}
                  />
                  <span className="text-slate-700 font-medium">
                    {new Date(s.date).toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  <span className="text-slate-500 truncate">
                    {s.classe.nom} — {s.matiere.nom}
                  </span>
                  {enRetard && (
                    <span className="ml-auto text-red-600 font-medium flex-shrink-0">
                      {t("joursRetard", { days: jours })}
                    </span>
                  )}
                  {!enRetard && (
                    <span className="ml-auto text-amber-600 font-medium flex-shrink-0">
                      {t("aujourdhui")}
                    </span>
                  )}
                </div>
              );
            })}
            {aRemplir.length > 10 && (
              <p className="text-[10px] text-slate-400 text-center pt-1">
                +{aRemplir.length - 10} {t("autres")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSeanceForm({
  classes,
  matieres,
  enseignants,
  onClose,
}: {
  classes: Classe[];
  matieres: Matiere[];
  enseignants: Enseignant[];
  onClose: () => void;
}) {
  const libelleNiveau = useLibelleNiveau();
  const [classeId, setClasseId] = useState("");
  const [matiereId, setMatiereId] = useState("");
  const [enseignantId, setEnseignantId] = useState("");
  const [date, setDate] = useState("");
  const [dureePrevue, setDureePrevue] = useState(60);
  const [semaine, setSemaine] = useState(1);
  const [contenu, setContenu] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cahier-journal/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId,
          matiereId,
          enseignantId: enseignantId || null,
          date,
          dureePrevue: Number(dureePrevue),
          semaine: Number(semaine),
          contenu: contenu || null,
          statut: "PLANIFIEE",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.fr || "Erreur lors de la création");
        return;
      }
      onClose();
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-lg border border-slate-200 p-4 space-y-3"
    >
      <h3 className="font-semibold text-slate-800">Nouvelle séance</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="text-slate-600">Classe</span>
          <select
            value={classeId}
            onChange={(e) => setClasseId(e.target.value)}
            required
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Sélectionner…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({libelleNiveau(c.niveau)})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Matière</span>
          <select
            value={matiereId}
            onChange={(e) => setMatiereId(e.target.value)}
            required
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Sélectionner…</option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Enseignant</span>
          <select
            value={enseignantId}
            onChange={(e) => setEnseignantId(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Non assigné</option>
            {enseignants.map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Date</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Durée (min)</span>
          <input
            type="number"
            value={dureePrevue}
            onChange={(e) => setDureePrevue(Number(e.target.value))}
            min={15}
            max={480}
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">Semaine (1-36)</span>
          <input
            type="number"
            value={semaine}
            onChange={(e) => setSemaine(Number(e.target.value))}
            min={1}
            max={36}
            className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="text-sm block">
        <span className="text-slate-600">Contenu (optionnel)</span>
        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          rows={3}
          className="mt-1 w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm"
          placeholder="Description du contenu traité pendant la séance…"
        />
      </label>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Création…" : "Créer la séance"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm px-4 py-2 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
