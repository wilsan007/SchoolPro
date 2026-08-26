"use client";

import { useState, useTransition, useEffect } from "react";
import { Award, AlertTriangle, TrendingUp, CheckCircle2, Save, Loader2, Star, ThumbsDown, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { GenerateurCommentairesBulletin } from "@/components/learnos/GenerateurCommentairesBulletin";

type Decision = "PASSAGE" | "REDOUBLEMENT" | "FELICITATIONS" | "ENCOURAGEMENTS" | "AVERTISSEMENT";

interface EleveConseil {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  moyenneGenerale: number | null;
  rang: number | null;
  decision: Decision | null;
  appreciation: string;
}

interface Props {
  classeId: string;
  periodeId: string;
  classeNom: string;
  periodeNom: string;
  eleves: EleveConseil[];
}

const DECISIONS: { value: Decision; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { value: "FELICITATIONS", label: "Félicitations", icon: <Star className="w-3 h-3" />, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  { value: "ENCOURAGEMENTS", label: "Encouragements", icon: <TrendingUp className="w-3 h-3" />, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  { value: "PASSAGE", label: "Passage", icon: <CheckCircle2 className="w-3 h-3" />, color: "text-green-700", bg: "bg-green-50 border-green-200" },
  { value: "AVERTISSEMENT", label: "Avertissement", icon: <AlertTriangle className="w-3 h-3" />, color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  { value: "REDOUBLEMENT", label: "Redoublement", icon: <ThumbsDown className="w-3 h-3" />, color: "text-red-700", bg: "bg-red-50 border-red-200" },
];

function noteColor(n: number | null): string {
  if (!n) return "text-gray-400";
  if (n >= 16) return "text-green-600 font-bold";
  if (n >= 14) return "text-blue-600 font-semibold";
  if (n >= 10) return "text-yellow-600";
  return "text-red-600 font-semibold";
}

export function ConseilDeClasse({ classeId, periodeId, classeNom, periodeNom, eleves: initial }: Props) {
  const t = useTranslations("bulletins");
  const [eleves, setEleves] = useState<EleveConseil[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  // — Générateur LEARNOS de commentaires par matière —
  const [matieres, setMatieres] = useState<{ id: string; nom: string }[]>([]);
  const [selectedEleveId, setSelectedEleveId] = useState<string | null>(null);
  const [selectedMatiereId, setSelectedMatiereId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchMatieres() {
      try {
        const res = await fetch(`/api/bulletins/matrice?classeId=${classeId}&periodeId=${periodeId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.matieres) {
          setMatieres(data.matieres.map((m: { id: string; nom: string }) => ({ id: m.id, nom: m.nom })));
        }
      } catch {
        // silent — la matrice n'est pas critique
      }
    }
    fetchMatieres();
    return () => { cancelled = true; };
  }, [classeId, periodeId]);

  const stats = {
    felicitations: eleves.filter((e) => e.decision === "FELICITATIONS").length,
    encouragements: eleves.filter((e) => e.decision === "ENCOURAGEMENTS").length,
    avertissements: eleves.filter((e) => e.decision === "AVERTISSEMENT").length,
    redoublements: eleves.filter((e) => e.decision === "REDOUBLEMENT").length,
    passages: eleves.filter((e) => e.decision === "PASSAGE").length,
    nonRenseignés: eleves.filter((e) => !e.decision).length,
  };

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
        body: JSON.stringify({ eleveId, periodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("errAi"));
      setAppreciation(eleveId, data.appreciation);
      toast.success(t("aiSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errAi"));
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
    toast.info(t("autoApplied"));
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
          body: JSON.stringify({ classeId, periodeId, decisions: payload }),
        });

        if (!res.ok) throw new Error("Erreur serveur");
        setSaved(true);
        toast.success(t("decisionsSaved"));
      } catch {
        toast.error(t("errSaveDecisions"));
      }
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("conseilClassTitle", { classe: classeNom })}
          </h2>
          <p className="text-sm text-gray-500">{periodeNom} · {t("students", { count: eleves.length })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={applyAutoDecisions}>
            <Award className="w-4 h-4 mr-2" />
            {t("autoDecisions")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || saved}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saved ? t("saved") : t("save")}
          </Button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: "Félicitations", val: stats.felicitations, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", icon: <Star className="w-4 h-4" /> },
          { label: "Encouragements", val: stats.encouragements, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: <TrendingUp className="w-4 h-4" /> },
          { label: "Passages", val: stats.passages, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: "Avertissements", val: stats.avertissements, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", icon: <AlertTriangle className="w-4 h-4" /> },
          { label: "Redoublements", val: stats.redoublements, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: <ThumbsDown className="w-4 h-4" /> },
          { label: "Non renseignés", val: stats.nonRenseignés, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-800", icon: <Minus className="w-4 h-4" /> },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
            <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 w-8">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("student")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300 w-20">{t("avgOver20")}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300 w-16">{t("rankLabel")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300 w-52">{t("decisionLabel")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("appreciationCouncil")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {eleves.map((eleve, idx) => {
                const decisionInfo = DECISIONS.find((d) => d.value === eleve.decision);
                return (
                  <tr
                    key={eleve.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {eleve.nom} {eleve.prenom}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">{eleve.matricule}</p>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-center text-base ${noteColor(eleve.moyenneGenerale)}`}>
                      {eleve.moyenneGenerale !== null ? eleve.moyenneGenerale.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-600 dark:text-gray-300 font-medium">
                        {eleve.rang ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={eleve.appreciation}
                          onChange={(e) => setAppreciation(eleve.id, e.target.value)}
                          placeholder={t("appreciationPlaceholder")}
                          className="w-full text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 focus:outline-none focus:border-green-500 text-gray-700 dark:text-gray-300 placeholder-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => suggererAppreciation(eleve.id)}
                          disabled={aiLoadingId === eleve.id}
                          title={t("aiSuggestion")}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {stats.nonRenseignés > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {t("studentsWithoutDecision", { count: stats.nonRenseignés })}
          </span>
        </div>
      )}

      {/* Générateur LEARNOS de commentaires par matière */}
      {matieres.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("learnosEleve")}</label>
              <select
                value={selectedEleveId ?? ""}
                onChange={(e) => setSelectedEleveId(e.target.value || null)}
                className="w-full text-sm border rounded px-2 py-1.5 bg-transparent border-gray-200 dark:border-gray-700"
              >
                <option value="">{t("learnosSelectEleve")}</option>
                {eleves.map((e) => (
                  <option key={e.id} value={e.id}>{e.nom} {e.prenom}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("learnosMatiere")}</label>
              <select
                value={selectedMatiereId ?? ""}
                onChange={(e) => setSelectedMatiereId(e.target.value || null)}
                className="w-full text-sm border rounded px-2 py-1.5 bg-transparent border-gray-200 dark:border-gray-700"
              >
                <option value="">{t("learnosSelectMatiere")}</option>
                {matieres.map((m) => (
                  <option key={m.id} value={m.id}>{m.nom}</option>
                ))}
              </select>
            </div>
          </div>
          {selectedEleveId && selectedMatiereId && (
            <GenerateurCommentairesBulletin
              eleveId={selectedEleveId}
              periodeId={periodeId}
              matiereId={selectedMatiereId}
              onSauvegarder={async (commentaire) => {
                setAppreciation(selectedEleveId, commentaire);
                toast.success(t("learnosCommentaireApplique"));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
