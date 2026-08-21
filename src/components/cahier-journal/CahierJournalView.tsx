"use client";

import { useState, useMemo } from "react";
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
  GraduationCap,
  Users2,
  FileText,
  TrendingUp,
} from "lucide-react";
import { MobileCard, MobileList, MobileEmptyState } from "@/components/mobile/MobileUI";

type Statut = "PLANIFIEE" | "EFFECTUEE" | "ANNULEE" | "REPORTEE";
type Rythme = "EN_AVANCE" | "A_TEMPS" | "EN_RETARD" | "NON_EVALUEE";

interface Seance {
  id: string;
  classeId: string;
  matiereId: string;
  enseignantId: string | null;
  chapitreId: string | null;
  planificationId: string | null;
  date: string;
  dureePrevue: number;
  dureeReelle: number | null;
  statut: Statut;
  semaine: number;
  contenu: string | null;
  rythme: Rythme;
  presents: number | null;
  absents: number | null;
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
    statut: string;
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
  matieres: Matiere[];
  enseignants: Enseignant[];
  canWrite: boolean;
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

export function CahierJournalView({
  seances,
  classes,
  matieres,
  enseignants,
  canWrite,
}: Props) {
  const [filterClasse, setFilterClasse] = useState<string>("");
  const [filterMatiere, setFilterMatiere] = useState<string>("");
  const [filterStatut, setFilterStatut] = useState<string>("");
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");
  const [expandedSeance, setExpandedSeance] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

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

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={filterClasse}
          onChange={(e) => setFilterClasse(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom} ({c.niveau})
            </option>
          ))}
        </select>
        <select
          value={filterMatiere}
          onChange={(e) => setFilterMatiere(e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
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
          className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
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
                            {s.competences && s.competences.length > 0 && (
                              <p className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {s.competences.length} compétence(s)
                              </p>
                            )}
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
                    seance={seancesList.find((s) => s.id === expandedSeance)!}
                  />
                )}
            </div>
          ))}
        </div>
      )}

      {/* Vue Liste */}
      {viewMode === "list" && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
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

function SeanceDetail({ seance }: { seance: Seance }) {
  return (
    <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
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
                <span className="text-slate-400 ml-1">({sc.niveau})</span>
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

      {seance.devoirs.length > 0 && (
        <div className="text-sm">
          <div className="flex items-center gap-1.5 text-slate-500 mb-1">
            <FileText className="w-3.5 h-3.5" />
            <span className="font-medium">Devoirs rattachés</span>
          </div>
          <ul className="pl-5 space-y-0.5">
            {seance.devoirs.map((d) => (
              <li key={d.id} className="text-slate-600">
                {d.titre} — à rendre le{" "}
                {new Date(d.dateRendu).toLocaleDateString("fr-FR")} ({d.statut})
              </li>
            ))}
          </ul>
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
                {c.nom} ({c.niveau})
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
