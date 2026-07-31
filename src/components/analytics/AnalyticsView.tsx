"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend, Cell,
  PieChart, Pie, LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, CheckCircle2,
  Star, BarChart3, Activity, Loader2, Shield,
  ChevronRight, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSchoolGroup, SCHOOL_GROUP_ORDER } from "@/lib/school-groups";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EleveRanking {
  id: string;
  nom: string;
  prenom: string;
  moyenne: number | null;
}

interface EleveRisque extends EleveRanking {
  absencesInjust: number;
  risque: "ELEVE" | "MOYEN";
}

interface AbsenceChartPoint {
  date: string;
  injust: number;
  just: number;
  attente: number;
}

interface MatiereData {
  matiere: string;
  moyenne: number;
  nbNotes: number;
}

interface ClasseData {
  classe: string;
  niveau: string;
  effectif: number;
}

interface MatiereParClasseData {
  classe: string;
  niveau: string;
  matieres: MatiereData[];
}

interface AnalyticsData {
  synthese: {
    totalEleves: number;
    tauxReussite: number;
    enReussite: number;
    elevesAEvaluer: number;
    incidentsOuverts: number;
    examensEnCours: number;
  };
  top5: EleveRanking[];
  bottom5: EleveRanking[];
  elevesArisque: EleveRisque[];
  absencesChartData: AbsenceChartPoint[];
  matieresData: MatiereData[];
  matieresParClasse: MatiereParClasseData[];
  elevesParClasse: ClasseData[];
  bulletinsStats: { total: number; reussite: number; passage: number };
  genderDist: { garcons: number; filles: number };
  revenueData: { month: string; montant: number }[];
  absenceParClasse: { classe: string; count: number }[];
  classeRadarData: { classe: string; moyenne: number }[];
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon, color, trend,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", color)}>
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            {trend === "up" ? (
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            ) : trend === "down" ? (
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getMoyenneColor(m: number | null): string {
  if (m === null) return "text-gray-400";
  if (m >= 14) return "text-green-600";
  if (m >= 10) return "text-blue-600";
  if (m >= 8) return "text-orange-500";
  return "text-red-600";
}

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

// ─── Composant principal ──────────────────────────────────────────────────────

export function AnalyticsView() {
  const t = useTranslations("analytics");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => console.error("[Analytics] Erreur fetch:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t("loadingAnalytics")}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { synthese, top5, bottom5, elevesArisque, absencesChartData, matieresData, matieresParClasse, elevesParClasse } = data;
  const genderDist = data.genderDist ?? { garcons: 0, filles: 0 };
  const revenueData = data.revenueData ?? [];
  const absenceParClasse = data.absenceParClasse ?? [];
  const classeRadarData = data.classeRadarData ?? [];

  // Format date court pour graphique
  const absData = absencesChartData.map((d) => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString("fr-SN", { day: "2-digit", month: "2-digit" }),
  }));

  // Groupement des moyennes par matière par classe selon le niveau scolaire
  const matieresParClasseGrouped = SCHOOL_GROUP_ORDER.map((group) => ({
    group,
    classes: (matieresParClasse ?? [])
      .filter((c) => getSchoolGroup(c.niveau, c.classe) === group)
      .sort((a, b) => a.classe.localeCompare(b.classe)),
  })).filter((g) => g.classes.length > 0);

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleClass(classe: string) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classe)) next.delete(classe);
      else next.add(classe);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* KPI principaux */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title={t("activeStudents")}
          value={synthese.totalEleves}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          color="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          title={t("successRate")}
          value={`${synthese.tauxReussite}%`}
          sub={t("successSub", { count: synthese.enReussite })}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-100 dark:bg-green-900/30"
          trend={synthese.tauxReussite >= 70 ? "up" : "down"}
        />
        <StatCard
          title={t("evaluated")}
          value={synthese.elevesAEvaluer}
          sub={t("evaluatedSub")}
          icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
          color="bg-indigo-100 dark:bg-indigo-900/30"
        />
        <StatCard
          title={t("openIncidents")}
          value={synthese.incidentsOuverts}
          icon={<Shield className="w-5 h-5 text-red-600" />}
          color="bg-red-100 dark:bg-red-900/30"
          trend={synthese.incidentsOuverts > 5 ? "down" : "neutral"}
        />
        <StatCard
          title={t("atRiskStudents")}
          value={elevesArisque.length}
          sub={t("atRiskSub")}
          icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
          color="bg-orange-100 dark:bg-orange-900/30"
        />
        <StatCard
          title={t("ongoingExams")}
          value={synthese.examensEnCours}
          icon={<Activity className="w-5 h-5 text-purple-600" />}
          color="bg-purple-100 dark:bg-purple-900/30"
        />
      </div>

      {/* Graphique absences */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            {t("absenceEvolution")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {absData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              {t("noAbsenceData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={absData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gInjust" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gJust" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="injust" name={t("absenceInjust")} stroke="#ef4444" fill="url(#gInjust)" strokeWidth={2} />
                <Area type="monotone" dataKey="just" name={t("absenceJust")} stroke="#10b981" fill="url(#gJust)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Moyennes par matière par classe + Effectifs par classe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Moyennes par matière — groupées par classe */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t("avgByMatter")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {matieresParClasseGrouped.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {t("noPublishedGrades")}
              </div>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto scrollbar-thin">
                {matieresParClasseGrouped.map(({ group, classes }) => (
                  <div key={group}>
                    {/* Niveau scolaire (Primaire / Collège / Lycée) */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      {expandedGroups.has(group) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group}</span>
                      <Badge variant="secondary" className="text-xs ml-1">
                        {t("classCount", { count: classes.length })}
                      </Badge>
                    </button>

                    {/* Classes sous le niveau */}
                    {expandedGroups.has(group) && (
                      <div className="ml-4 space-y-0.5">
                        {classes.map((cls) => (
                          <div key={cls.classe}>
                            <button
                              onClick={() => toggleClass(cls.classe)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/40 transition-colors text-left"
                            >
                              {expandedClasses.has(cls.classe) ? (
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              )}
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{cls.classe}</span>
                              <span className="text-xs text-muted-foreground">{t("matterCount", { count: cls.matieres.length })}</span>
                            </button>

                            {/* Matières sous la classe */}
                            {expandedClasses.has(cls.classe) && (
                              <div className="ml-8 space-y-1 py-1">
                                {cls.matieres.map((m, mi) => (
                                  <div key={m.matiere} className="flex items-center gap-2 px-2 py-1 rounded text-xs">
                                    <span
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: CHART_COLORS[mi % CHART_COLORS.length] }}
                                    />
                                    <span className="flex-1 text-gray-600 dark:text-gray-400">{m.matiere}</span>
                                    <span className={cn("font-bold", getMoyenneColor(m.moyenne))}>
                                      {m.moyenne.toFixed(2)}/20
                                    </span>
                                    <span className="text-muted-foreground text-[10px]">{t("notesCount", { count: m.nbNotes })}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Effectifs par classe */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {t("classSize")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {elevesParClasse.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {t("noClassConfigured")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={elevesParClasse}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 40, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="classe" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="effectif" name={t("studentsLabel")} fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Palmarès + Décrochage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 5 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              {t("top5")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top5.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">{t("noGradesAvailable")}</p>
            ) : (
              <div className="space-y-2">
                {top5.map((e, i) => (
                  <div key={e.id} className="flex items-center gap-3">
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                      i === 0 ? "bg-yellow-100 text-yellow-700" :
                      i === 1 ? "bg-gray-100 text-gray-600" :
                      i === 2 ? "bg-orange-100 text-orange-700" :
                      "bg-gray-50 text-gray-500"
                    )}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {e.prenom} {e.nom}
                      </p>
                    </div>
                    <span className={cn("text-sm font-bold", getMoyenneColor(e.moyenne))}>
                      {e.moyenne?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom 5 */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              {t("strugglingStudents")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottom5.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">{t("noGradesAvailable")}</p>
            ) : (
              <div className="space-y-2">
                {bottom5.map((e) => (
                  <div key={e.id} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {e.prenom} {e.nom}
                      </p>
                    </div>
                    <span className={cn("text-sm font-bold", getMoyenneColor(e.moyenne))}>
                      {e.moyenne?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risque décrochage */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              {t("dropoutRisk")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {elevesArisque.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-xs text-gray-400">{t("noAtRiskStudents")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {elevesArisque.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <Badge className={cn(
                      "text-xs px-1.5 py-0 flex-shrink-0",
                      e.risque === "ELEVE"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-orange-50 text-orange-700 border-orange-200"
                    )}>
                      {e.risque === "ELEVE" ? "!" : "~"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {e.prenom} {e.nom}
                      </p>
                      <p className="text-xs text-gray-400">
                        {e.moyenne !== null ? `${e.moyenne.toFixed(1)}/20` : "—"}
                        {e.absencesInjust > 0 && ` · ${e.absencesInjust} abs.`}
                      </p>
                    </div>
                  </div>
                ))}
                {elevesArisque.length > 6 && (
                  <p className="text-xs text-gray-400 text-center">
                    {t("moreCount", { count: elevesArisque.length - 6 })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nouveaux graphiques : Genre, Revenus, Radar classes, Absences par classe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Répartition par genre */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {t("genderDist")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={[
                    { name: t("boys"), value: genderDist.garcons, fill: "#3b82f6" },
                    { name: t("girls"), value: genderDist.filles, fill: "#ec4899" },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry: any) => `${entry.name}: ${entry.value}`}
                  labelLine={false}
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#ec4899" />
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenus (6 derniers mois) */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              {t("revenue6m")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {t("noRevenueData")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: number) => [`${v.toLocaleString()} F`, t("collected")]}
                  />
                  <Line type="monotone" dataKey="montant" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Radar moyennes par classe + Absences par classe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Radar — moyennes par classe */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t("classRadar")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {classeRadarData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {t("noDataAvailable")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={classeRadarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="classe" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 20]} tick={{ fontSize: 9 }} />
                  <Radar name={t("avgLabel")} dataKey="moyenne" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [`${v}/20`, t("avgLabel")]} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Absences par classe */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              {t("absenceByClass")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {absenceParClasse.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {t("noAbsenceRecorded")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={absenceParClasse} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="classe" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" name={t("absencesLabel")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
