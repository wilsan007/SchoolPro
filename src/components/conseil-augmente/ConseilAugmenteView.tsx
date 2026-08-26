"use client";

import { useState, useTransition, useMemo } from "react";
import {
  Award,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
  Save,
  Loader2,
  Star,
  ThumbsDown,
  Minus,
  Sparkles,
  Users,
  Calendar,
  ShieldAlert,
  Target,
  HeartHandshake,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { MobileCard, MobileList, MobileEmptyState } from "@/components/mobile/MobileUI";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

type Decision = "PASSAGE" | "REDOUBLEMENT" | "FELICITATIONS" | "ENCOURAGEMENTS" | "AVERTISSEMENT";

interface MatiereSignal {
  matiereId: string;
  matiere: { nom: string; code: string };
  moyenneEleve: number | null;
  rang: number | null;
  appreciation: string | null;
}

interface EleveAugmente {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  moyenneGenerale: number | null;
  rang: number | null;
  decision: Decision | null;
  appreciation: string;
  matieres: MatiereSignal[];
  assiduite: { absences: number; retards: number; injustifiees: number; heuresAbsence: number };
  discipline: { incidents: number; incidentsOuverts: number; incidentsGraves: number; sanctionsActives: number };
  learnos: {
    recommandations: number; recosCritiques: number; recosFragiles: number; recosConsolidees: number;
    competencesMaitrisees: number; competencesFragiles: number; competencesCritiques: number; competencesInconnues: number;
    interventionsProposees: number; interventionsEnCours: number;
    plansRemediation: number; plansApprofondissement: number;
    predictionsEnCours: number; predictionsCritiques: number;
  };
  mentorat: string | null;
}

interface ClasseOption {
  id: string;
  nom: string;
  niveau: string;
  annee: string;
  eleves: { id: string; nom: string; prenom: string; matricule: string }[];
}

interface PeriodeOption {
  id: string;
  nom: string;
  numero: number;
  annee: { id: string; libelle: string };
}

interface Props {
  classes: ClasseOption[];
  /** Hiérarchie catégorie → niveau → classe (scope enseignant appliqué). */
  hierarchie?: ClassesHierarchie;
  periodes: PeriodeOption[];
  periodeCouranteId: string | null;
  canWrite: boolean;
}

const DECISIONS: { value: Decision; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { value: "FELICITATIONS", label: "Félicitations", icon: <Star className="w-3 h-3" />, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  { value: "ENCOURAGEMENTS", label: "Encouragements", icon: <TrendingUp className="w-3 h-3" />, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  { value: "PASSAGE", label: "Passage", icon: <CheckCircle2 className="w-3 h-3" />, color: "text-green-700", bg: "bg-green-50 border-green-200" },
  { value: "AVERTISSEMENT", label: "Avertissement", icon: <AlertTriangle className="w-3 h-3" />, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  { value: "REDOUBLEMENT", label: "Redoublement", icon: <ThumbsDown className="w-3 h-3" />, color: "text-red-700", bg: "bg-red-50 border-red-200" },
];

function noteColor(n: number | null): string {
  if (n === null || n === undefined) return "text-gray-400";
  if (n >= 16) return "text-green-600 font-bold";
  if (n >= 14) return "text-blue-600 font-semibold";
  if (n >= 10) return "text-yellow-600";
  return "text-red-600 font-semibold";
}

function SignalBadge({
  count,
  label,
  icon,
  color,
  bg,
  showWhenZero = false,
}: {
  count: number;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  showWhenZero?: boolean;
}) {
  if (count === 0 && !showWhenZero) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${bg} ${color}`}
      title={label}
    >
      {icon}
      <span className="font-medium">{count}</span>
      <span className="hidden sm:inline opacity-70">{label}</span>
    </span>
  );
}

export function ConseilAugmenteView({ classes, hierarchie, periodes, periodeCouranteId, canWrite }: Props) {
  const t = useTranslations("conseilAugmente");
  const tBul = useTranslations("bulletins");

  const [selectedClasseId, setSelectedClasseId] = useState(classes[0]?.id ?? "");
  const [selectedPeriodeId, setSelectedPeriodeId] = useState(periodeCouranteId ?? periodes[0]?.id ?? "");
  const [eleves, setEleves] = useState<EleveAugmente[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  const selectedClasse = useMemo(
    () => classes.find((c) => c.id === selectedClasseId),
    [classes, selectedClasseId]
  );
  const selectedPeriode = useMemo(
    () => periodes.find((p) => p.id === selectedPeriodeId),
    [periodes, selectedPeriodeId]
  );

  async function loadConseil() {
    if (!selectedClasseId || !selectedPeriodeId) return;
    setLoading(true);
    setLoaded(false);
    try {
      const res = await fetch(
        `/api/conseil-augmente?classeId=${selectedClasseId}&periodeId=${selectedPeriodeId}`
      );
      if (!res.ok) throw new Error("Erreur serveur");
      const data = await res.json();
      setEleves(data.eleves ?? []);
      setSaved(false);
    } catch {
      toast.error(t("errLoad"));
      setEleves([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  function setDecision(eleveId: string, decision: Decision | null) {
    setEleves((prev) =>
      prev.map((e) => (e.id === eleveId ? { ...e, decision } : e))
    );
    setSaved(false);
  }

  function setAppreciation(eleveId: string, appreciation: string) {
    setEleves((prev) =>
      prev.map((e) => (e.id === eleveId ? { ...e, appreciation } : e))
    );
    setSaved(false);
  }

  async function suggererAppreciation(eleveId: string) {
    setAiLoadingId(eleveId);
    try {
      const res = await fetch("/api/ai/appreciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId, periodeId: selectedPeriodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tBul("errAi"));
      setAppreciation(eleveId, data.appreciation);
      toast.success(tBul("aiSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tBul("errAi"));
    } finally {
      setAiLoadingId(null);
    }
  }

  function applyAutoDecisions() {
    setEleves((prev) =>
      prev.map((e) => {
        if (e.moyenneGenerale === null) return e;
        let decision: Decision;
        if (e.moyenneGenerale >= 16) decision = "FELICITATIONS";
        else if (e.moyenneGenerale >= 14) decision = "ENCOURAGEMENTS";
        else if (e.moyenneGenerale >= 10) decision = "PASSAGE";
        else if (e.moyenneGenerale >= 8) decision = "AVERTISSEMENT";
        else decision = "REDOUBLEMENT";
        return { ...e, decision };
      })
    );
    setSaved(false);
    toast.info(tBul("autoApplied"));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const payload = eleves.map((e) => ({
          eleveId: e.id,
          decision: e.decision,
          appreciation: e.appreciation,
        }));
        const res = await fetch("/api/bulletins/conseil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classeId: selectedClasseId, periodeId: selectedPeriodeId, decisions: payload }),
        });
        if (!res.ok) throw new Error("Erreur serveur");
        setSaved(true);
        toast.success(tBul("decisionsSaved"));
      } catch {
        toast.error(tBul("errSaveDecisions"));
      }
    });
  }

  const stats = {
    felicitations: eleves.filter((e) => e.decision === "FELICITATIONS").length,
    encouragements: eleves.filter((e) => e.decision === "ENCOURAGEMENTS").length,
    avertissements: eleves.filter((e) => e.decision === "AVERTISSEMENT").length,
    redoublements: eleves.filter((e) => e.decision === "REDOUBLEMENT").length,
    passages: eleves.filter((e) => e.decision === "PASSAGE").length,
    nonRenseignes: eleves.filter((e) => !e.decision).length,
  };

  const hasSelection = selectedClasseId && selectedPeriodeId;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sélecteurs */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("selectClass")}</label>
          <select
            value={selectedClasseId}
            onChange={(e) => setSelectedClasseId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom} ({c.annee})</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">{t("selectPeriode")}</label>
          <select
            value={selectedPeriodeId}
            onChange={(e) => setSelectedPeriodeId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:border-green-500"
          >
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>{p.nom} — {p.annee.libelle}</option>
            ))}
          </select>
        </div>
        <Button onClick={loadConseil} disabled={!hasSelection || loading} size="sm">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
          {t("load")}
        </Button>
      </div>

      {!loaded && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("selectPrompt")}</p>
        </div>
      )}

      {loaded && eleves.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("noStudents")}</p>
        </div>
      )}

      {eleves.length > 0 && (
        <>
          {/* En-tête + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("classTitle", { classe: selectedClasse?.nom ?? "" })}
              </h2>
              <p className="text-sm text-gray-500">{selectedPeriode?.nom} · {tBul("students", { count: eleves.length })}</p>
            </div>
            {canWrite && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={applyAutoDecisions}>
                  <Award className="w-4 h-4 mr-2" />
                  {tBul("autoDecisions")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isPending || saved}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {saved ? tBul("saved") : tBul("save")}
                </Button>
              </div>
            )}
          </div>

          {/* Stats rapides */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            {[
              { label: tBul("felicite"), val: stats.felicitations, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", icon: <Star className="w-4 h-4" /> },
              { label: tBul("encourage"), val: stats.encouragements, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: <TrendingUp className="w-4 h-4" /> },
              { label: tBul("passage"), val: stats.passages, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", icon: <CheckCircle2 className="w-4 h-4" /> },
              { label: tBul("avert"), val: stats.avertissements, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", icon: <AlertTriangle className="w-4 h-4" /> },
              { label: tBul("redoub"), val: stats.redoublements, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: <ThumbsDown className="w-4 h-4" /> },
              { label: tBul("nonRenseigne"), val: stats.nonRenseignes, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800", icon: <Minus className="w-4 h-4" /> },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
                <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tableau augmenté */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Vue mobile — cartes élèves */}
            <div className="lg:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {eleves.length === 0 ? (
                <MobileEmptyState icon={<Users className="w-8 h-8" />} title={t("noStudents")} />
              ) : (
                eleves.map((eleve, idx) => {
                  const decisionInfo = DECISIONS.find((d) => d.value === eleve.decision);
                  const isExpanded = expandedId === eleve.id;
                  return (
                    <MobileCard
                      key={eleve.id}
                      accentColor={
                        eleve.moyenneGenerale !== null && eleve.moyenneGenerale >= 10 ? "#22c55e"
                        : eleve.moyenneGenerale !== null ? "#ef4444"
                        : "#6b7280"
                      }
                      onClick={() => setExpandedId(isExpanded ? null : eleve.id)}
                      className="space-y-3"
                    >
                      {/* En-tête carte */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                              {eleve.nom} {eleve.prenom}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono">{eleve.matricule}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-lg font-bold ${noteColor(eleve.moyenneGenerale)}`}>
                            {eleve.moyenneGenerale !== null ? eleve.moyenneGenerale.toFixed(1) : "—"}
                          </span>
                          <span className="text-[10px] text-gray-400">/20</span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {/* Rang + signaux compacts */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">
                          {tBul("rankLabel")}: <span className="font-semibold text-gray-700 dark:text-gray-300">{eleve.rang ?? "—"}</span>
                        </span>
                        {eleve.assiduite.absences > 0 && (
                          <span className="text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                            {eleve.assiduite.absences} {t("abs")}
                          </span>
                        )}
                        {eleve.assiduite.retards > 0 && (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            {eleve.assiduite.retards} {t("ret")}
                          </span>
                        )}
                        {eleve.assiduite.injustifiees > 0 && (
                          <span className="text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                            {eleve.assiduite.injustifiees} {t("injust")}
                          </span>
                        )}
                      </div>

                      {/* Détail expandu */}
                      {isExpanded && (
                        <div className="pt-3 border-t space-y-3">
                          {/* Décision */}
                          {decisionInfo && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{tBul("decisionLabel")}</p>
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${decisionInfo.color}`}>
                                {decisionInfo.icon}
                                {decisionInfo.label}
                              </span>
                            </div>
                          )}
                          {/* Signaux détaillés */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500">{t("discipline")}:</span>
                              <span className="font-medium">{eleve.discipline.incidents}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Brain className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500">{t("learnos")}:</span>
                              <span className="font-medium">{eleve.learnos.recommandations}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <HeartHandshake className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-500">{t("mentorat")}:</span>
                              <span className="font-medium">{eleve.mentorat ? "✓" : "—"}</span>
                            </div>
                          </div>
                          {/* Matières en signal */}
                          {eleve.matieres && eleve.matieres.length > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{t("subjectsInDifficulty")}</p>
                              <div className="flex flex-wrap gap-1">
                                {eleve.matieres.filter((m) => m.moyenneEleve !== null && m.moyenneEleve < 10).slice(0, 4).map((m) => (
                                  <span key={m.matiereId} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                                    {m.matiere.code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </MobileCard>
                  );
                })
              )}
            </div>

            {/* Vue desktop — table complète */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-3 py-3 font-medium text-gray-600 dark:text-gray-300 w-8">#</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 dark:text-gray-300">{tBul("student")}</th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300 w-16">{tBul("avgOver20")}</th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300 w-12">{tBul("rankLabel")}</th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300" title={t("assiduite")}>
                      <Calendar className="w-4 h-4 mx-auto" />
                    </th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300" title={t("discipline")}>
                      <ShieldAlert className="w-4 h-4 mx-auto" />
                    </th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300" title={t("learnos")}>
                      <Brain className="w-4 h-4 mx-auto" />
                    </th>
                    <th className="text-center px-2 py-3 font-medium text-gray-600 dark:text-gray-300" title={t("mentorat")}>
                      <HeartHandshake className="w-4 h-4 mx-auto" />
                    </th>
                    {canWrite && <th className="text-left px-2 py-3 font-medium text-gray-600 dark:text-gray-300 w-52">{tBul("decisionLabel")}</th>}
                    {canWrite && <th className="text-left px-2 py-3 font-medium text-gray-600 dark:text-gray-300">{tBul("appreciationCouncil")}</th>}
                    {!canWrite && <th className="text-left px-2 py-3 font-medium text-gray-600 dark:text-gray-300">{tBul("decisionLabel")}</th>}
                    {!canWrite && <th className="text-left px-2 py-3 font-medium text-gray-600 dark:text-gray-300">{tBul("appreciationCouncil")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {eleves.map((eleve, idx) => {
                    const decisionInfo = DECISIONS.find((d) => d.value === eleve.decision);
                    const isExpanded = expandedId === eleve.id;
                    return (
                      <>
                        <tr
                          key={eleve.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : eleve.id)}
                        >
                          <td className="px-3 py-3 text-gray-400 text-xs">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </td>
                          <td className="px-3 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {eleve.nom} {eleve.prenom}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">{eleve.matricule}</p>
                            </div>
                          </td>
                          <td className={`px-2 py-3 text-center text-base ${noteColor(eleve.moyenneGenerale)}`}>
                            {eleve.moyenneGenerale !== null ? eleve.moyenneGenerale.toFixed(2) : "—"}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <span className="text-gray-600 dark:text-gray-300 font-medium">
                              {eleve.rang ?? "—"}
                            </span>
                          </td>
                          {/* Assiduité */}
                          <td className="px-2 py-3">
                            <div className="flex flex-wrap gap-1 justify-center">
                              <SignalBadge
                                count={eleve.assiduite.absences}
                                label={t("abs")}
                                icon={<Calendar className="w-3 h-3" />}
                                color="text-orange-700"
                                bg="bg-orange-50 border-orange-200"
                              />
                              <SignalBadge
                                count={eleve.assiduite.retards}
                                label={t("ret")}
                                icon={<Clock className="w-3 h-3" />}
                                color="text-amber-700"
                                bg="bg-amber-50 border-amber-200"
                              />
                              <SignalBadge
                                count={eleve.assiduite.injustifiees}
                                label={t("injust")}
                                icon={<AlertTriangle className="w-3 h-3" />}
                                color="text-red-700"
                                bg="bg-red-50 border-red-200"
                              />
                            </div>
                          </td>
                          {/* Discipline */}
                          <td className="px-2 py-3">
                            <div className="flex flex-wrap gap-1 justify-center">
                              <SignalBadge
                                count={eleve.discipline.incidents}
                                label={t("inc")}
                                icon={<ShieldAlert className="w-3 h-3" />}
                                color="text-rose-700"
                                bg="bg-rose-50 border-rose-200"
                              />
                              <SignalBadge
                                count={eleve.discipline.sanctionsActives}
                                label={t("sanct")}
                                icon={<AlertTriangle className="w-3 h-3" />}
                                color="text-red-700"
                                bg="bg-red-50 border-red-200"
                              />
                            </div>
                          </td>
                          {/* LEARNOS */}
                          <td className="px-2 py-3">
                            <div className="flex flex-wrap gap-1 justify-center">
                              <SignalBadge
                                count={eleve.learnos.recommandations}
                                label={t("recos")}
                                icon={<Sparkles className="w-3 h-3" />}
                                color="text-purple-700"
                                bg="bg-purple-50 border-purple-200"
                              />
                              <SignalBadge
                                count={eleve.learnos.competencesFragiles}
                                label={t("frag")}
                                icon={<Target className="w-3 h-3" />}
                                color="text-amber-700"
                                bg="bg-amber-50 border-amber-200"
                              />
                              <SignalBadge
                                count={eleve.learnos.competencesCritiques}
                                label={t("crit")}
                                icon={<AlertTriangle className="w-3 h-3" />}
                                color="text-red-700"
                                bg="bg-red-50 border-red-200"
                              />
                              <SignalBadge
                                count={eleve.learnos.predictionsCritiques}
                                label={t("pred")}
                                icon={<Brain className="w-3 h-3" />}
                                color="text-fuchsia-700"
                                bg="bg-fuchsia-50 border-fuchsia-200"
                              />
                            </div>
                          </td>
                          {/* Mentorat */}
                          <td className="px-2 py-3 text-center">
                            {eleve.mentorat && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-teal-50 border-teal-200 text-teal-700">
                                <HeartHandshake className="w-3 h-3" />
                                {t(`mentoratType.${eleve.mentorat}`)}
                              </span>
                            )}
                          </td>
                          {/* Décision */}
                          {canWrite ? (
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-wrap gap-1">
                                {DECISIONS.map((d) => (
                                  <button
                                    key={d.value}
                                    onClick={() => setDecision(eleve.id, eleve.decision === d.value ? null : d.value)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all ${
                                      eleve.decision === d.value
                                        ? `${d.bg} ${d.color} border-current font-semibold`
                                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-400 hover:border-gray-400"
                                    }`}
                                  >
                                    {d.icon}
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                          ) : (
                            <td className="px-2 py-3">
                              {decisionInfo && (
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${decisionInfo.bg} ${decisionInfo.color} border-current font-semibold`}>
                                  {decisionInfo.icon}
                                  {decisionInfo.label}
                                </span>
                              )}
                            </td>
                          )}
                          {/* Appréciation */}
                          {canWrite ? (
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={eleve.appreciation}
                                  onChange={(e) => setAppreciation(eleve.id, e.target.value)}
                                  placeholder={tBul("appreciationPlaceholder")}
                                  className="w-full text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 focus:outline-none focus:border-green-500 text-gray-700 dark:text-gray-300 placeholder-gray-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => suggererAppreciation(eleve.id)}
                                  disabled={aiLoadingId === eleve.id}
                                  title={tBul("aiSuggestion")}
                                  className="shrink-0 p-1.5 rounded border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
                                >
                                  {aiLoadingId === eleve.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                          ) : (
                            <td className="px-2 py-3 text-xs text-gray-600 dark:text-gray-300">
                              {eleve.appreciation || "—"}
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr key={`${eleve.id}-detail`} className="bg-gray-50/50 dark:bg-gray-800/30">
                            <td colSpan={canWrite ? 10 : 10} className="px-6 py-4">
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* Détail matières */}
                                <div className="lg:col-span-2">
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("matieresDetail")}</h4>
                                  {eleve.matieres.length === 0 ? (
                                    <p className="text-xs text-gray-400">{t("noMatieres")}</p>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      {eleve.matieres.map((m) => (
                                        <div key={m.matiereId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{m.matiere.nom}</p>
                                          <div className="flex items-baseline gap-2 mt-1">
                                            <span className={`text-sm ${noteColor(m.moyenneEleve)}`}>
                                              {m.moyenneEleve !== null ? m.moyenneEleve.toFixed(2) : "—"}
                                            </span>
                                            {m.rang !== null && (
                                              <span className="text-xs text-gray-400">#{m.rang}</span>
                                            )}
                                          </div>
                                          {m.appreciation && (
                                            <p className="text-xs text-gray-400 mt-1 truncate">{m.appreciation}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Synthèse signaux */}
                                <div className="space-y-2">
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("signalsSynthesis")}</h4>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("absencesTotal")}</span>
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {eleve.assiduite.absences} ({eleve.assiduite.heuresAbsence}h)
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("incidentsTotal")}</span>
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {eleve.discipline.incidents} · {t("grave")}: {eleve.discipline.incidentsGraves}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("compMaitrisees")}</span>
                                      <span className="font-medium text-green-700">{eleve.learnos.competencesMaitrisees}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("compFragiles")}</span>
                                      <span className="font-medium text-amber-700">{eleve.learnos.competencesFragiles}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("compCritiques")}</span>
                                      <span className="font-medium text-red-700">{eleve.learnos.competencesCritiques}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("interventions")}</span>
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {eleve.learnos.interventionsProposees + eleve.learnos.interventionsEnCours}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("plans")}</span>
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {eleve.learnos.plansRemediation + eleve.learnos.plansApprofondissement}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500">{t("predictions")}</span>
                                      <span className="font-medium text-fuchsia-700">{eleve.learnos.predictionsEnCours}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {stats.nonRenseignes > 0 && canWrite && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{tBul("studentsWithoutDecision", { count: stats.nonRenseignes })}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
