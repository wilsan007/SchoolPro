"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  Users, GraduationCap, AlertTriangle, FileText, Brain, Target,
  Loader2, TrendingUp, TrendingDown, Minus, Activity, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteData {
  siteId: string;
  siteNom: string;
  siteCode: string | null;
  effectif: number;
  moyenneGenerale: number;
  nbNotes: number;
  absencesInjust: number;
  facturesRetard: number;
  facturesPayees: number;
  exclusions: number;
  recommandations: number;
  nbPredictions: number;
  probaReussiteMoy: number;
  precisionPredictions: number;
  ecartMoyen: number;
  masteryMoy: number;
  confidenceMoy: number;
  exercicesAssignes: number;
  exercicesReponses: number;
  tauxExercices: number;
}

interface AnneeData {
  anneeId: string;
  libelle: string;
  isCurrent: boolean;
  effectif: number;
  moyenneGenerale: number;
  nbNotes: number;
  absencesInjust: number;
  facturesRetard: number;
  exclusions: number;
  nbPredictions: number;
  probaReussiteMoy: number;
  precisionPredictions: number;
  ecartMoyen: number;
  masteryMoy: number;
  confidenceMoy: number;
  exercicesAssignes: number;
  exercicesReponses: number;
  tauxExercices: number;
  kpiSnapshots: Record<string, { valeur: number; cible: number | null; periode: string }[]>;
}

interface SitesResponse {
  mode: "sites";
  anneeId: string;
  annees: { id: string; libelle: string; isCurrent: boolean }[];
  sites: SiteData[];
}

interface AnneesResponse {
  mode: "annees";
  siteId: string | null;
  sites: { id: string; nom: string; code: string | null }[];
  annees: AnneeData[];
}

// ─── Types : intelligence LEARNOS (direction-intelligence) ────────────────────

interface IndiceComposite {
  code: string;
  nom: string;
  valeur: number;
  composantes: Record<string, number>;
  donneesInsuffisantes: boolean;
  explication: string;
}

interface DirectionIntelligenceData {
  isp: IndiceComposite;
  ieis: IndiceComposite;
  ivf: IndiceComposite;
  ics: IndiceComposite;
  roiPedagogique: IndiceComposite | null;
  iro: IndiceComposite;
  santeGlobale: number;
}

/** Un site + ses indices d'intelligence associés. */
interface SiteIntelligence {
  siteId: string;
  siteNom: string;
  intelligence: DirectionIntelligenceData | null;
}

// ─── Composant carte KPI ──────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, icon, color, trend,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1 truncate">{label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {value}{unit && <span className="text-sm ml-0.5 text-gray-400">{unit}</span>}
            </p>
          </div>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-1.5 flex items-center gap-1">
            {trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
            {trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
            {trend === "neutral" && <Minus className="w-3 h-3 text-gray-400" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function trendIcon(a: number, b: number): "up" | "down" | "neutral" {
  if (a > b + 0.01) return "up";
  if (a < b - 0.01) return "down";
  return "neutral";
}

// ─── Onglets ──────────────────────────────────────────────────────────────────

type TabMode = "sites" | "annees";
type Dimension = "default" | "indices_intelligence";

export function ComparateurView() {
  const t = useTranslations("comparateur");
  const [mode, setMode] = useState<TabMode>("sites");
  const [anneeId, setAnneeId] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("");
  const [dimension, setDimension] = useState<Dimension>("default");
  const [data, setData] = useState<SitesResponse | AnneesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Construire l'URL selon le mode
  const apiUrl = (() => {
    const params = new URLSearchParams({ mode });
    if (mode === "sites" && anneeId) params.set("anneeId", anneeId);
    if (mode === "annees" && siteId) params.set("siteId", siteId);
    return `/api/comparateur?${params.toString()}`;
  })();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(apiUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => {
        console.error("[Comparateur] Erreur:", e);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [apiUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Onglets et sélecteurs ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setMode("sites")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              mode === "sites"
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            {t("tabSites")}
          </button>
          <button
            onClick={() => setMode("annees")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-700",
              mode === "annees"
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            {t("tabAnnees")}
          </button>
        </div>

        {mode === "sites" && (data as SitesResponse).annees && (
          <select
            value={anneeId}
            onChange={(e) => setAnneeId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          >
            {(data as SitesResponse).annees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.libelle}{a.isCurrent ? " ★" : ""}
              </option>
            ))}
          </select>
        )}

        {mode === "annees" && (data as AnneesResponse).sites && (
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          >
            <option value="">{t("allSites")}</option>
            {(data as AnneesResponse).sites.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Sélecteur de dimension (uniquement en mode sites) ────── */}
      {mode === "sites" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t("dimension")}</span>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as Dimension)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          >
            <option value="default">{t("dimDefault")}</option>
            <option value="indices_intelligence">{t("dimIndicesIntelligence")}</option>
          </select>
        </div>
      )}

      {/* ── Contenu ──────────────────────────────────────────────── */}
      {mode === "sites" ? (
        <SitesComparison
          data={data as SitesResponse}
          t={t}
          dimension={dimension}
          anneeId={anneeId}
        />
      ) : (
        <AnneesComparison data={data as AnneesResponse} t={t} />
      )}
    </div>
  );
}

// ─── Comparaison inter-sites ──────────────────────────────────────────────────

function SitesComparison({
  data,
  t,
  dimension,
  anneeId,
}: {
  data: SitesResponse;
  t: (k: string) => string;
  dimension: Dimension;
  anneeId: string;
}) {
  const { sites } = data;
  const [intelData, setIntelData] = useState<SiteIntelligence[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);

  // Fetch des indices d'intelligence par site quand la dimension est sélectionnée
  useEffect(() => {
    if (dimension !== "indices_intelligence") return;
    setIntelLoading(true);
    setIntelError(null);
    Promise.all(
      sites.map(async (s) => {
        const params = new URLSearchParams({ siteId: s.siteId });
        if (anneeId) params.set("anneeId", anneeId);
        try {
          const r = await fetch(`/api/learnos/direction-intelligence?${params.toString()}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const intelligence: DirectionIntelligenceData = await r.json();
          return { siteId: s.siteId, siteNom: s.siteNom, intelligence };
        } catch {
          return { siteId: s.siteId, siteNom: s.siteNom, intelligence: null };
        }
      })
    )
      .then((results) => setIntelData(results))
      .catch((e) => setIntelError(e.message))
      .finally(() => setIntelLoading(false));
  }, [dimension, sites, anneeId]);

  if (sites.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t("noSites")}
        </CardContent>
      </Card>
    );
  }

  // Données pour les graphiques
  const barData = sites.map((s) => ({
    name: s.siteNom,
    Effectif: s.effectif,
    Absences: s.absencesInjust,
    "Factures retard": s.facturesRetard,
  }));

  const masteryData = sites.map((s) => ({
    name: s.siteNom,
    "Maîtrise %": s.masteryMoy,
    "Confiance %": s.confidenceMoy,
    "Précision prédictions %": s.precisionPredictions,
    "Taux exercices %": s.tauxExercices,
  }));

  const radarData = sites[0] && sites[1] ? [
    { subject: "Maîtrise", [sites[0].siteNom]: sites[0].masteryMoy, [sites[1].siteNom]: sites[1].masteryMoy },
    { subject: "Confiance", [sites[0].siteNom]: sites[0].confidenceMoy, [sites[1].siteNom]: sites[1].confidenceMoy },
    { subject: "Précision", [sites[0].siteNom]: sites[0].precisionPredictions, [sites[1].siteNom]: sites[1].precisionPredictions },
    { subject: "Exercices", [sites[0].siteNom]: sites[0].tauxExercices, [sites[1].siteNom]: sites[1].tauxExercices },
    { subject: "Moyenne", [sites[0].siteNom]: sites[0].moyenneGenerale * 5, [sites[1].siteNom]: sites[1].moyenneGenerale * 5 },
  ] : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tableau comparatif */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sitesTable")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("site")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("effectif")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("moyenne")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("absencesInjust")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("facturesRetard")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("exclusions")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("recommandations")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("masteryMoy")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("precisionPred")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("tauxExercices")}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.siteId} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium">
                      {s.siteNom}
                      {s.siteCode && <span className="ml-2 text-xs text-muted-foreground">{s.siteCode}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.effectif}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.moyenneGenerale}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{s.absencesInjust}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{s.facturesRetard}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{s.exclusions}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{s.recommandations}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{s.masteryMoy}%</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{s.precisionPredictions}%</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{s.tauxExercices}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards par site */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((s) => (
          <Card key={s.siteId} className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{s.siteNom}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard label={t("effectif")} value={s.effectif} icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-100 dark:bg-blue-900/30" />
                <KpiCard label={t("moyenne")} value={s.moyenneGenerale} icon={<GraduationCap className="w-4 h-4 text-green-600" />} color="bg-green-100 dark:bg-green-900/30" />
                <KpiCard label={t("masteryMoy")} value={s.masteryMoy} unit="%" icon={<Brain className="w-4 h-4 text-purple-600" />} color="bg-purple-100 dark:bg-purple-900/30" />
                <KpiCard label={t("precisionPred")} value={s.precisionPredictions} unit="%" icon={<Target className="w-4 h-4 text-indigo-600" />} color="bg-indigo-100 dark:bg-indigo-900/30" />
                <KpiCard label={t("tauxExercices")} value={s.tauxExercices} unit="%" icon={<Activity className="w-4 h-4 text-teal-600" />} color="bg-teal-100 dark:bg-teal-900/30" />
                <KpiCard label={t("exclusions")} value={s.exclusions} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-100 dark:bg-red-900/30" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Graphique barres — effectifs et alertes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartEffectifsAlertes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Effectif" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Absences" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Factures retard" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Graphique barres — LEARNOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartLearnos")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={masteryData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Maîtrise %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Confiance %" fill="#ec4899" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Précision prédictions %" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Taux exercices %" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Radar — comparaison 2 sites */}
      {radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("radarComparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                {sites.map((s, i) => (
                  <Radar
                    key={s.siteId}
                    name={s.siteNom}
                    dataKey={s.siteNom}
                    stroke={i === 0 ? "#6366f1" : "#ec4899"}
                    fill={i === 0 ? "#6366f1" : "#ec4899"}
                    fillOpacity={0.15}
                  />
                ))}
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          NOUVEAU : Dimension "Indices d'intelligence"
          Tableau comparatif + radar des indices composites
          ═══════════════════════════════════════════════════════════════ */}
      {dimension === "indices_intelligence" && (
        <>
          {/* Tableau comparatif des indices par site */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600" />
                {t("indicesIntelligenceTable")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {intelLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : intelError ? (
                <div className="p-6 text-sm text-red-500 text-center">{intelError}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm sm:text-base min-w-[560px]">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 font-medium">{t("site")}</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">ISP</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">IEIS</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">IVF</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">ICS</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">IRO</th>
                        <th className="px-4 sm:px-5 py-3 sm:py-3.5 text-right font-medium">{t("santeGlobale")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelData.map((s) => {
                        const intel = s.intelligence;
                        const pct = (v: number) => intel ? `${Math.round(v * 100)}%` : "—";
                        const color = (v: number) => {
                          if (!intel) return "text-gray-400";
                          if (v >= 0.7) return "text-green-600";
                          if (v >= 0.4) return "text-orange-500";
                          return "text-red-600";
                        };
                        return (
                          <tr key={s.siteId} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="px-4 py-3 font-medium">{s.siteNom}</td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", color(intel?.isp.valeur ?? 0))}>
                              {pct(intel?.isp.valeur ?? 0)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", color(intel?.ieis.valeur ?? 0))}>
                              {pct(intel?.ieis.valeur ?? 0)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", color(intel?.ivf.valeur ?? 0))}>
                              {pct(intel?.ivf.valeur ?? 0)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", color(intel?.ics.valeur ?? 0))}>
                              {pct(intel?.ics.valeur ?? 0)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-semibold", color(intel?.iro.valeur ?? 0))}>
                              {pct(intel?.iro.valeur ?? 0)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums font-bold", color(intel?.santeGlobale ?? 0))}>
                              {pct(intel?.santeGlobale ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Radar des indices composites (ISP, IEIS, IVF, ICS, IRO) */}
          {!intelLoading && intelData.some((s) => s.intelligence) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-600" />
                  {t("radarIndicesComposites")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] sm:h-[350px] lg:h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { subject: "ISP", ...Object.fromEntries(intelData.map((s) => [s.siteNom, s.intelligence ? Math.round(s.intelligence.isp.valeur * 100) : 0])) },
                      { subject: "IEIS", ...Object.fromEntries(intelData.map((s) => [s.siteNom, s.intelligence ? Math.round(s.intelligence.ieis.valeur * 100) : 0])) },
                      { subject: "IVF", ...Object.fromEntries(intelData.map((s) => [s.siteNom, s.intelligence ? Math.round(s.intelligence.ivf.valeur * 100) : 0])) },
                      { subject: "ICS", ...Object.fromEntries(intelData.map((s) => [s.siteNom, s.intelligence ? Math.round(s.intelligence.ics.valeur * 100) : 0])) },
                      { subject: "IRO", ...Object.fromEntries(intelData.map((s) => [s.siteNom, s.intelligence ? Math.round(s.intelligence.iro.valeur * 100) : 0])) },
                    ]}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      {intelData.map((s, i) => {
                        const colors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#3b82f6"];
                        return (
                          <Radar
                            key={s.siteId}
                            name={s.siteNom}
                            dataKey={s.siteNom}
                            stroke={colors[i % colors.length]}
                            fill={colors[i % colors.length]}
                            fillOpacity={0.1}
                          />
                        );
                      })}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Comparaison inter-années ─────────────────────────────────────────────────

function AnneesComparison({ data, t }: { data: AnneesResponse; t: (k: string) => string }) {
  const { annees } = data;
  if (annees.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t("noAnnees")}
        </CardContent>
      </Card>
    );
  }

  // Données pour graphiques d'évolution
  const evolutionData = annees.map((a) => ({
    name: a.libelle,
    "Moyenne générale": a.moyenneGenerale,
    "Maîtrise %": a.masteryMoy,
    "Précision %": a.precisionPredictions,
    "Taux exercices %": a.tauxExercices,
    Effectif: a.effectif,
  }));

  const predictionData = annees.map((a) => ({
    name: a.libelle,
    "Probabilité réussite %": a.probaReussiteMoy,
    "Précision %": a.precisionPredictions,
    "Écart moyen": a.ecartMoyen,
  }));

  const exerciceData = annees.map((a) => ({
    name: a.libelle,
    "Assignés": a.exercicesAssignes,
    "Répondus": a.exercicesReponses,
    "Taux %": a.tauxExercices,
  }));

  // Calcul des tendances (dernière année vs première)
  const first = annees[0];
  const last = annees[annees.length - 1];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cartes de tendance globale */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label={t("effectif")}
          value={last.effectif}
          icon={<Users className="w-4 h-4 text-blue-600" />}
          color="bg-blue-100 dark:bg-blue-900/30"
          trend={trendIcon(last.effectif, first.effectif)}
        />
        <KpiCard
          label={t("moyenne")}
          value={last.moyenneGenerale}
          icon={<GraduationCap className="w-4 h-4 text-green-600" />}
          color="bg-green-100 dark:bg-green-900/30"
          trend={trendIcon(last.moyenneGenerale, first.moyenneGenerale)}
        />
        <KpiCard
          label={t("masteryMoy")}
          value={last.masteryMoy}
          unit="%"
          icon={<Brain className="w-4 h-4 text-purple-600" />}
          color="bg-purple-100 dark:bg-purple-900/30"
          trend={trendIcon(last.masteryMoy, first.masteryMoy)}
        />
        <KpiCard
          label={t("precisionPred")}
          value={last.precisionPredictions}
          unit="%"
          icon={<Target className="w-4 h-4 text-indigo-600" />}
          color="bg-indigo-100 dark:bg-indigo-900/30"
          trend={trendIcon(last.precisionPredictions, first.precisionPredictions)}
        />
        <KpiCard
          label={t("tauxExercices")}
          value={last.tauxExercices}
          unit="%"
          icon={<Activity className="w-4 h-4 text-teal-600" />}
          color="bg-teal-100 dark:bg-teal-900/30"
          trend={trendIcon(last.tauxExercices, first.tauxExercices)}
        />
        <KpiCard
          label={t("absencesInjust")}
          value={last.absencesInjust}
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
          color="bg-red-100 dark:bg-red-900/30"
          trend={trendIcon(first.absencesInjust, last.absencesInjust)}
        />
      </div>

      {/* Tableau comparatif */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("anneesTable")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("annee")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("effectif")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("moyenne")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("absencesInjust")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("facturesRetard")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden sm:table-cell">{t("exclusions")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("nbPredictions")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("precisionPred")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("ecartMoyen")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("masteryMoy")}</th>
                  <th className="px-4 py-3 text-right font-medium hidden md:table-cell">{t("tauxExercices")}</th>
                </tr>
              </thead>
              <tbody>
                {annees.map((a) => (
                  <tr key={a.anneeId} className={cn("border-b last:border-0 hover:bg-muted/50", a.isCurrent && "bg-indigo-50 dark:bg-indigo-900/10")}>
                    <td className="px-4 py-3 font-medium">
                      {a.libelle}
                      {a.isCurrent && <span className="ml-2 text-xs text-indigo-500">★ {t("current")}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.effectif}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.moyenneGenerale}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{a.absencesInjust}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{a.facturesRetard}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{a.exclusions}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{a.nbPredictions}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{a.precisionPredictions}%</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{a.ecartMoyen}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{a.masteryMoy}%</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{a.tauxExercices}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Évolution globale — LineChart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartEvolution")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolutionData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Moyenne générale" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Maîtrise %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Précision %" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Taux exercices %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Évolution des prédictions — LineChart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartPredictions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={predictionData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Probabilité réussite %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Précision %" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Écart moyen" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Évolution des exercices — BarChart + Line */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartExercices")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={exerciceData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Assignés" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Répondus" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* KPI Snapshots évolution (si disponibles) */}
      {annees.some((a) => Object.keys(a.kpiSnapshots).length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("chartKpiSnapshots")}</CardTitle>
          </CardHeader>
          <CardContent>
            <KpiSnapshotsChart annees={annees} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── KPI Snapshots évolution ──────────────────────────────────────────────────

function KpiSnapshotsChart({ annees }: { annees: AnneeData[] }) {
  // Collecter toutes les clés KPI uniques
  const allKeys = new Set<string>();
  annees.forEach((a) => Object.keys(a.kpiSnapshots).forEach((k) => allKeys.add(k)));
  const kpiKeys = Array.from(allKeys);

  if (kpiKeys.length === 0) return null;

  // Construire les données de séries temporelles pour chaque KPI
  const seriesData = kpiKeys.map((key) => {
    const points: { periode: string; valeur: number }[] = [];
    annees.forEach((a) => {
      if (a.kpiSnapshots[key]) {
        a.kpiSnapshots[key].forEach((p) => {
          points.push({ periode: p.periode, valeur: p.valeur });
        });
      }
    });
    points.sort((a, b) => a.periode.localeCompare(b.periode));
    return { key, data: points };
  });

  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];

  return (
    <div className="h-[200px] sm:h-[300px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="periode"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString("fr", { month: "short", year: "2-digit" })}
        />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          labelFormatter={(v: string) => new Date(v).toLocaleDateString("fr")}
        />
        <Legend />
        {seriesData.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey="valeur"
            data={s.data}
            name={s.key.replace("learnos.kpi.", "")}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
