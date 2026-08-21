"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Target,
  Sparkles,
  Route,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useFormatter } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CompetenceProfil {
  competenceId: string;
  masteryScore: number;
  confidenceScore: number;
  masteryStatus: string;
  trend: string;
  evidenceCount: number;
  lastEvidenceAt: string | null;
  competence: {
    id: string;
    code: string;
    libelle: string;
    chapitre: { id: string; nom: string; matiere: { id: string; nom: string; code: string } } | null;
  };
}

interface Evidence {
  id: string;
  sourceType: string;
  evidenceType: string;
  rawScore: number | null;
  maxScore: number | null;
  masterySignal: number;
  confidence: number;
  weight: number;
  occurredAt: string;
  competence: { id: string; code: string; libelle: string } | null;
  matiere: { id: string; nom: string } | null;
}

interface Intervention {
  id: string;
  reason: string;
  interventionType: string;
  recommendedAction: string;
  status: string;
  startDate: string | null;
  reviewDate: string | null;
  outcome: string | null;
  masteryBefore: number | null;
  masteryAfter: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  competence: { id: string; code: string; libelle: string };
}

interface EtapePlan {
  id: string;
  action: string;
  responsable: string;
  statut: string;
  echeance: string | null;
  competence: { id: string; libelle: string };
}

interface Plan {
  id: string;
  type: string;
  origine: string;
  statut: string;
  motif: string;
  regleDeclenchee: string;
  motifParams: unknown;
  dateDebut: string | null;
  dateRevue: string | null;
  dateFin: string | null;
  valideParId: string | null;
  valideLe: string | null;
  matiere: { id: string; nom: string } | null;
  etapes: EtapePlan[];
}

interface Prediction {
  id: string;
  probaReussite: number;
  difficultePredite: string;
  masteryAvant: number | null;
  prerequisManquants: number | null;
  masteryApres: number | null;
  predictionCorrecte: boolean | null;
  ecart: number | null;
  emiseLe: string;
  verifieeLe: string | null;
  competence: { id: string; code: string; libelle: string };
  chapitre: { id: string; nom: string } | null;
}

interface Recommandation {
  id: string;
  niveau: string;
  statut: string;
  motif: string;
  actionProposee: string;
  regleDeclenchee: string;
  competencesBloquees: number;
  decideParId: string | null;
  decideeLe: string | null;
  resolueLe: string | null;
  createdAt: string;
  competence: { id: string; code: string; libelle: string };
}

interface JournalEntry {
  id: string;
  typeAnalyse: string;
  resume: string;
  echantillon: number;
  perimetre: string;
  createdAt: string;
}

interface Synthese {
  totalCompetences: number;
  maitrisees: number;
  fragiles: number;
  critiques: number;
  inconnues: number;
  totalEvidences: number;
  interventionsActives: number;
  interventionsTerminees: number;
  plansActifs: number;
  plansTermines: number;
  predictionsEnCours: number;
  predictionsVerifiees: number;
  predictionsCorrectes: number;
  recosActives: number;
  recosResolues: number;
}

interface DossierData {
  eleve: { id: string; nom: string; prenom: string; matricule: string; classe: { id: string; nom: string; niveau: string } | null };
  synthese: Synthese;
  profils: CompetenceProfil[];
  evidences: Evidence[];
  interventions: Intervention[];
  plans: Plan[];
  predictions: Prediction[];
  recommandations: Recommandation[];
  journal: JournalEntry[];
}

interface Props {
  eleveId: string;
}

function masteryColor(status: string): string {
  switch (status) {
    case "MASTERED": return "text-green-600";
    case "PROFICIENT": return "text-green-600";
    case "DEVELOPING": return "text-amber-600";
    case "EMERGING": return "text-orange-600";
    case "NEEDS_REVIEW": return "text-red-600";
    default: return "text-gray-400";
  }
}

function masteryLabel(status: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    MASTERED: t("statusMastered"),
    PROFICIENT: t("statusProficient"),
    DEVELOPING: t("statusDeveloping"),
    EMERGING: t("statusEmerging"),
    NEEDS_REVIEW: t("statusNeedsReview"),
    UNKNOWN: t("statusUnknown"),
  };
  return map[status] ?? status;
}

function trendIcon(trend: string) {
  switch (trend) {
    case "hausse": return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
    case "baisse": return <TrendingDown className="w-3.5 h-3.5 text-red-600" />;
    case "stable": return <Minus className="w-3.5 h-3.5 text-gray-400" />;
    default: return <Minus className="w-3.5 h-3.5 text-gray-300" />;
  }
}

function difficulteColor(d: string): string {
  switch (d) {
    case "FACILE": return "bg-green-50 text-green-700 border-green-200";
    case "MODERE": return "bg-blue-50 text-blue-700 border-blue-200";
    case "DIFFICILE": return "bg-orange-50 text-orange-700 border-orange-200";
    case "CRITIQUE": return "bg-red-50 text-red-700 border-red-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function statutPlanColor(s: string): string {
  switch (s) {
    case "ACTIF": return "bg-green-50 text-green-700 border-green-200";
    case "PROPOSE": return "bg-blue-50 text-blue-700 border-blue-200";
    case "EN_REVUE": return "bg-amber-50 text-amber-700 border-amber-200";
    case "TERMINE": return "bg-gray-50 text-gray-600 border-gray-200";
    case "ABANDONNE": return "bg-red-50 text-red-700 border-red-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function statutInterventionColor(s: string): string {
  switch (s) {
    case "PROPOSED": return "bg-blue-50 text-blue-700 border-blue-200";
    case "APPROVED": return "bg-teal-50 text-teal-700 border-teal-200";
    case "ACTIVE": return "bg-green-50 text-green-700 border-green-200";
    case "UNDER_REVIEW": return "bg-amber-50 text-amber-700 border-amber-200";
    case "COMPLETED": return "bg-gray-50 text-gray-600 border-gray-200";
    case "REJECTED": return "bg-red-50 text-red-700 border-red-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function niveauRecoColor(n: string): string {
  switch (n) {
    case "CRITIQUE": return "bg-red-50 text-red-700 border-red-200";
    case "FRAGILE": return "bg-amber-50 text-amber-700 border-amber-200";
    case "CONSOLIDE": return "bg-green-50 text-green-700 border-green-200";
    case "AVANCE": return "bg-purple-50 text-purple-700 border-purple-200";
    case "EXCELLENCE": return "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export function DossierProgressionView({ eleveId }: Props) {
  const t = useTranslations("dossierProgression");
  const format = useFormatter();
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("profils");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dossier-progression?eleveId=${eleveId}`);
      if (!res.ok) throw new Error("Erreur serveur");
      const d = await res.json();
      setData(d);
    } catch {
      setError(t("errLoad"));
    } finally {
      setLoading(false);
    }
  }, [eleveId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { synthese: s } = data;

  function toggleSection(key: string) {
    setExpandedSection(expandedSection === key ? null : key);
  }

  function SectionHeader({ icon, title, count, sectionKey }: { icon: React.ReactNode; title: string; count: number; sectionKey: string }) {
    const isExpanded = expandedSection === sectionKey;
    return (
      <button
        onClick={() => toggleSection(sectionKey)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          {icon}
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {count > 0 && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Retour */}
      <Link href={`/eleves/${eleveId}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("backToStudent")}
        </Button>
      </Link>

      {/* Synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        {[
          { label: t("synthCompetences"), val: s.totalCompetences, icon: <Target className="w-4 h-4" />, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: t("synthMaitrisees"), val: s.maitrisees, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
          { label: t("synthFragiles"), val: s.fragiles, icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: t("synthCritiques"), val: s.critiques, icon: <AlertTriangle className="w-4 h-4" />, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: t("synthInterventions"), val: s.interventionsActives, icon: <Activity className="w-4 h-4" />, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
          { label: t("synthPlans"), val: s.plansActifs, icon: <Route className="w-4 h-4" />, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30" },
          { label: t("synthRecos"), val: s.recosActives, icon: <Sparkles className="w-4 h-4" />, color: "text-fuchsia-600", bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30" },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-lg p-3 text-center`}>
            <div className={`flex justify-center mb-1 ${stat.color}`}>{stat.icon}</div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.val}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Progression des compétences */}
      <Card>
        <SectionHeader icon={<Brain className="w-4 h-4 text-blue-600" />} title={t("competencesTitle")} count={data.profils.length} sectionKey="profils" />
        {expandedSection === "profils" && (
          <CardContent className="pt-0">
            {data.profils.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noCompetences")}</p>
            ) : (
              <div className="space-y-2">
                {data.profils.map((p) => (
                  <div key={p.competenceId} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {p.competence.libelle}
                      </p>
                      <p className="text-xs text-gray-400">
                        {p.competence.chapitre?.matiere?.nom ?? "—"} · {p.competence.chapitre?.nom ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {trendIcon(p.trend)}
                      <span className={`text-xs font-medium ${masteryColor(p.masteryStatus)}`}>
                        {masteryLabel(p.masteryStatus, t)}
                      </span>
                      <span className="text-xs text-gray-400" title={t("evidenceCount")}>
                        {p.evidenceCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Trail de preuves */}
      <Card>
        <SectionHeader icon={<FileText className="w-4 h-4 text-gray-600" />} title={t("evidencesTitle")} count={data.evidences.length} sectionKey="evidences" />
        {expandedSection === "evidences" && (
          <CardContent className="pt-0">
            {data.evidences.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noEvidences")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t("evidenceDate")}</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t("evidenceType")}</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">{t("evidenceCompetence")}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t("evidenceSignal")}</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">{t("evidenceConfidence")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {data.evidences.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 px-2 text-gray-600 dark:text-gray-300">
                          {format.dateTime(new Date(e.occurredAt), { dateStyle: "short" })}
                        </td>
                        <td className="py-2 px-2 text-gray-600 dark:text-gray-300">
                          <Badge variant="outline" className="text-xs">{e.evidenceType}</Badge>
                        </td>
                        <td className="py-2 px-2 text-gray-600 dark:text-gray-300 truncate max-w-[200px]">
                          {e.competence?.libelle ?? e.matiere?.nom ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`font-medium ${(e.masterySignal ?? 0) >= 0.8 ? "text-green-600" : (e.masterySignal ?? 0) >= 0.55 ? "text-amber-600" : "text-red-600"}`}>
                            {Math.round((e.masterySignal ?? 0) * 100)}%
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center text-gray-400">
                          {Math.round((e.confidence ?? 0) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Interventions pédagogiques */}
      <Card>
        <SectionHeader icon={<Activity className="w-4 h-4 text-teal-600" />} title={t("interventionsTitle")} count={data.interventions.length} sectionKey="interventions" />
        {expandedSection === "interventions" && (
          <CardContent className="pt-0">
            {data.interventions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noInterventions")}</p>
            ) : (
              <div className="space-y-3">
                {data.interventions.map((i) => (
                  <div key={i.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{i.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{i.competence.libelle}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statutInterventionColor(i.status)}`}>
                        {i.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">{i.recommendedAction}</p>
                    {i.masteryBefore !== null && i.masteryAfter !== null && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">{t("masteryBefore")}: {Math.round(i.masteryBefore * 100)}%</span>
                        <span className="text-gray-400">→</span>
                        <span className={`font-medium ${(i.masteryAfter ?? 0) >= 0.8 ? "text-green-600" : (i.masteryAfter ?? 0) >= 0.55 ? "text-amber-600" : "text-red-600"}`}>
                          {t("masteryAfter")}: {Math.round(i.masteryAfter * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Plans de progression */}
      <Card>
        <SectionHeader icon={<Route className="w-4 h-4 text-purple-600" />} title={t("plansTitle")} count={data.plans.length} sectionKey="plans" />
        {expandedSection === "plans" && (
          <CardContent className="pt-0">
            {data.plans.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noPlans")}</p>
            ) : (
              <div className="space-y-3">
                {data.plans.map((p) => (
                  <div key={p.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {p.type === "remediation" ? t("planRemediation") : t("planApprofondissement")}
                          {p.matiere && <span className="text-gray-400 font-normal"> · {p.matiere.nom}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.motif}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statutPlanColor(p.statut)}`}>
                        {p.statut}
                      </span>
                    </div>
                    {p.etapes.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {p.etapes.map((e) => (
                          <div key={e.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full ${e.statut === "FAIT" || e.statut === "VALIDE" ? "bg-green-500" : e.statut === "EN_COURS" ? "bg-amber-500" : "bg-gray-300"}`} />
                            <span className="flex-1 text-gray-600 dark:text-gray-300">{e.action}</span>
                            <span className="text-gray-400">{e.responsable}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Prédictions */}
      <Card>
        <SectionHeader icon={<Brain className="w-4 h-4 text-fuchsia-600" />} title={t("predictionsTitle")} count={data.predictions.length} sectionKey="predictions" />
        {expandedSection === "predictions" && (
          <CardContent className="pt-0">
            {data.predictions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noPredictions")}</p>
            ) : (
              <div className="space-y-2">
                {data.predictions.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {p.competence.libelle}
                      </p>
                      <p className="text-xs text-gray-400">
                        {p.chapitre?.nom ?? "—"} · {format.dateTime(new Date(p.emiseLe), { dateStyle: "short" })}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${difficulteColor(p.difficultePredite)}`}>
                      {p.difficultePredite}
                    </span>
                    {p.verifieeLe && (
                      <span className={`text-xs ${p.predictionCorrecte ? "text-green-600" : "text-red-600"}`} title={t("predictionVerified")}>
                        {p.predictionCorrecte ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Recommandations */}
      <Card>
        <SectionHeader icon={<Sparkles className="w-4 h-4 text-rose-600" />} title={t("recommandationsTitle")} count={data.recommandations.length} sectionKey="recommandations" />
        {expandedSection === "recommandations" && (
          <CardContent className="pt-0">
            {data.recommandations.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">{t("noRecommandations")}</p>
            ) : (
              <div className="space-y-2">
                {data.recommandations.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {r.competence.libelle}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.motif}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${niveauRecoColor(r.niveau)}`}>
                      {r.niveau}
                    </span>
                    {r.resolueLe && (
                      <span className="text-xs text-green-600" title={t("recoResolved")}>
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Journal d'apprentissage */}
      {data.journal.length > 0 && (
        <Card>
          <SectionHeader icon={<Clock className="w-4 h-4 text-gray-600" />} title={t("journalTitle")} count={data.journal.length} sectionKey="journal" />
          {expandedSection === "journal" && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                {data.journal.map((j) => (
                  <div key={j.id} className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{j.typeAnalyse}</Badge>
                      <span className="text-xs text-gray-400">
                        {format.dateTime(new Date(j.createdAt), { dateStyle: "short" })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{j.resume}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
