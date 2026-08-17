"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Loader2, Target, Activity,
  CheckCircle2, XCircle, AlertTriangle, Brain, Calendar,
  ChevronLeft, ChevronRight, Award, BarChart3,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { texteErreur } from "@/lib/erreurs-client";

// ── Types ───────────────────────────────────────────────────────────────────

interface Prediction {
  id: string;
  probaReussite: number;
  difficultePredite: string;
  masteryAvant: number | null;
  masteryApres: number | null;
  predictionCorrecte: boolean | null;
  ecart: number | null;
  emiseLe: string;
  verifieeLe: string | null;
  competence: {
    id: string;
    code: string;
    libelle: string;
    chapitre: {
      id: string;
      nom: string;
      niveau: string;
      matiere: { id: string; nom: string; couleur: string | null };
    } | null;
  };
}

interface Evidence {
  id: string;
  masterySignal: number;
  confidence: number;
  occurredAt: string;
  evidenceType: string;
  sourceType: string;
  competence: {
    id: string;
    code: string;
    libelle: string;
    chapitre: { matiere: { id: string; nom: string; couleur: string | null } } | null;
  } | null;
  matiere: { id: string; nom: string; couleur: string | null } | null;
}

interface Bulletin {
  id: string;
  moyenneGenerale: number | null;
  moyenneClasse: number | null;
  rang: number | null;
  effectifClasse: number | null;
  appreciation: string | null;
  decision: string | null;
  isPublie: boolean;
  heuresAbsence: number | null;
  periode: { id: string; nom: string; numero: number; dateDebut: string; dateFin: string };
}

interface Annee {
  id: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  isCurrent: boolean;
  statut: string;
}

interface Synthese {
  trajectoire: "PROGRESSION" | "STABLE" | "REGRESSION" | "INDETERMINE";
  moyenneDebut: number | null;
  moyenneFin: number | null;
  deltaMoyenne: number | null;
  totalPredictions: number;
  predictionsVerifiees: number;
  predictionsCorrectes: number;
  tauxPrecision: number | null;
  ecartMoyen: number | null;
  distribution: Record<string, number>;
  moyennesBulletins: { periode: string; numero: number; moyenne: number; rang: number | null; effectif: number | null }[];
  totalEvidences: number;
}

interface EvolutionData {
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string; niveau: string } | null };
  annee: Annee | null;
  anneesDisponibles: Annee[];
  predictions: Prediction[];
  evidences: Evidence[];
  bulletins: Bulletin[];
  synthese: Synthese | null;
}

// ── Couleurs ────────────────────────────────────────────────────────────────

const DIFFICULTE_COULEUR: Record<string, string> = {
  FACILE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  MODERE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DIFFICILE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CRITIQUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const TRAJECTOIRE_CONFIG = {
  PROGRESSION: {
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-900",
  },
  REGRESSION: {
    icon: TrendingDown,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-900",
  },
  STABLE: {
    icon: Minus,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-900",
  },
  INDETERMINE: {
    icon: Activity,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
  },
};

// ── Composant principal ─────────────────────────────────────────────────────

export function EvolutionEleve({ eleveId }: { eleveId: string }) {
  const t = useTranslations("learnos.evolution");
  const te = useTranslations("learnos.erreurs");
  const tc = useTranslations("learnos.commun");

  const [data, setData] = useState<EvolutionData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [anneeId, setAnneeId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const url = anneeId
        ? `/api/learnos/eleves/${eleveId}/evolution?anneeId=${anneeId}`
        : `/api/learnos/eleves/${eleveId}/evolution`;
      const res = await fetch(url);
      if (!res.ok) {
        toast.error(texteErreur(await res.json().catch(() => ({})), te, tc("erreurServeur")));
        return;
      }
      const d: EvolutionData = await res.json();
      setData(d);
      if (!anneeId && d.annee) setAnneeId(d.annee.id);
    } catch {
      toast.error(tc("erreur"));
    } finally {
      setChargement(false);
    }
  }, [eleveId, anneeId, te, tc]);

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleveId]);

  // Recharger quand on change d'année manuellement.
  useEffect(() => {
    if (anneeId && data?.annee?.id !== anneeId) {
      void charger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anneeId]);

  // ── Données dérivées ──────────────────────────────────────────────────────

  // Timeline des preuves pour le graphique en ligne.
  const timelineData = useMemo(() => {
    if (!data?.evidences) return [];
    return data.evidences
      .filter((e) => e.masterySignal != null)
      .map((e) => ({
        date: new Date(e.occurredAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        timestamp: new Date(e.occurredAt).getTime(),
        mastery: Math.round(e.masterySignal * 100),
        confidence: Math.round(e.confidence * 100),
        matiere: e.matiere?.nom ?? e.competence?.chapitre?.matiere?.nom ?? "—",
      }));
  }, [data]);

  // Données pour le graphique prédictions vs réalité.
  const predictionsChartData = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions
      .filter((p) => p.masteryApres !== null)
      .map((p) => ({
        code: p.competence.code,
        libelle: p.competence.libelle.length > 20 ? p.competence.libelle.slice(0, 20) + "…" : p.competence.libelle,
        predit: Math.round(p.probaReussite * 100),
        reel: Math.round((p.masteryApres ?? 0) * 100),
        correcte: p.predictionCorrecte,
      }));
  }, [data]);

  // Regroupement des prédictions par matière.
  const predictionsParMatiere = useMemo(() => {
    if (!data?.predictions) return [];
    const groupes = new Map<string, { nom: string; couleur: string | null; predictions: Prediction[] }>();
    for (const p of data.predictions) {
      const m = p.competence.chapitre?.matiere;
      const cle = m?.id ?? "sans-matiere";
      if (!groupes.has(cle)) {
        groupes.set(cle, {
          nom: m?.nom ?? "—",
          couleur: m?.couleur ?? null,
          predictions: [],
        });
      }
      groupes.get(cle)!.predictions.push(p);
    }
    return [...groupes.entries()];
  }, [data]);

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t("chargement")}
      </div>
    );
  }

  if (!data) return null;

  if (!data.annee) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{t("aucuneAnnee")}</p>
        </CardContent>
      </Card>
    );
  }

  const s = data.synthese;
  const trajConfig = s ? TRAJECTOIRE_CONFIG[s.trajectoire] : TRAJECTOIRE_CONFIG.INDETERMINE;
  const TrajIcon = trajConfig.icon;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Sélecteur d'année ──────────────────────────────────────────────── */}
      {data.anneesDisponibles.length > 1 && (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("anneeScolaire")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!anneeId}
                onClick={() => {
                  const idx = data.anneesDisponibles.findIndex((a) => a.id === anneeId);
                  if (idx < data.anneesDisponibles.length - 1) {
                    setAnneeId(data.anneesDisponibles[idx + 1].id);
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="text-sm">
                {data.annee.libelle}
                {data.annee.isCurrent && <span className="ml-1.5 text-emerald-600">●</span>}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={!anneeId}
                onClick={() => {
                  const idx = data.anneesDisponibles.findIndex((a) => a.id === anneeId);
                  if (idx > 0) {
                    setAnneeId(data.anneesDisponibles[idx - 1].id);
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Carte de trajectoire ──────────────────────────────────────────── */}
      {s && (
        <Card className={cn("border-l-4", trajConfig.border, trajConfig.bg)}>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className={cn("rounded-xl p-3", trajConfig.bg)}>
                <TrajIcon className={cn("h-7 w-7", trajConfig.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base">
                  {t(`trajectoire.${s.trajectoire}`)}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t(`trajectoireAide.${s.trajectoire}`)}
                </p>
                {s.deltaMoyenne !== null && (
                  <div className="mt-3 flex flex-wrap gap-4 sm:gap-6 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">{t("debutAnnee")}</span>
                      <p className="font-semibold">
                        {s.moyenneDebut !== null ? `${Math.round(s.moyenneDebut * 100)}%` : tc("donneesInsuffisantes")}
                      </p>
                    </div>
                    <div className="text-muted-foreground self-center">→</div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t("finAnnee")}</span>
                      <p className="font-semibold">
                        {s.moyenneFin !== null ? `${Math.round(s.moyenneFin * 100)}%` : tc("donneesInsuffisantes")}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t("evolution")}</span>
                      <p className={cn("font-semibold", s.deltaMoyenne > 0 ? "text-emerald-600" : s.deltaMoyenne < 0 ? "text-red-600" : "text-blue-600")}>
                        {s.deltaMoyenne > 0 ? "+" : ""}{Math.round(s.deltaMoyenne * 100)}%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("predictionsEmises")}</span>
              </div>
              <p className="text-2xl font-bold">{s.totalPredictions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("predictionsVerifiees")}</span>
              </div>
              <p className="text-2xl font-bold">{s.predictionsVerifiees}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("tauxPrecision")}</span>
              </div>
              <p className="text-2xl font-bold">
                {s.tauxPrecision !== null ? `${Math.round(s.tauxPrecision * 100)}%` : tc("donneesInsuffisantes")}
              </p>
              {s.ecartMoyen !== null && (
                <p className="text-xs text-muted-foreground">
                  {t("ecartMoyen", { val: Math.round(s.ecartMoyen * 100) })}%
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t("preuvesApprentissage")}</span>
              </div>
              <p className="text-2xl font-bold">{s.totalEvidences}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Évolution des bulletins ────────────────────────────────────────── */}
      {data.bulletins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4 text-primary" />
              {t("evolutionBulletins")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.bulletins.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{b.periode.nom}</p>
                    {b.appreciation && (
                      <p className="text-xs text-muted-foreground italic mt-0.5">{b.appreciation}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {b.moyenneGenerale != null && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{t("moyenne")}</p>
                        <p className={cn(
                          "text-sm font-bold",
                          b.moyenneGenerale >= 14 ? "text-emerald-600" : b.moyenneGenerale >= 10 ? "text-blue-600" : "text-red-600"
                        )}>
                          {b.moyenneGenerale.toFixed(2)}/20
                        </p>
                      </div>
                    )}
                    {b.rang != null && b.effectifClasse != null && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{t("rang")}</p>
                        <p className="text-sm font-bold">{b.rang}/{b.effectifClasse}</p>
                      </div>
                    )}
                    {b.heuresAbsence != null && b.heuresAbsence > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{t("absences")}</p>
                        <p className="text-sm font-medium text-amber-600">{b.heuresAbsence}h</p>
                      </div>
                    )}
                    {b.decision && (
                      <Badge
                        variant={
                          b.decision === "PASSAGE" || b.decision === "Félicitations" ? "success" :
                          b.decision === "REDOUBLEMENT" ? "destructive" : "warning"
                        }
                        className="text-xs"
                      >
                        {b.decision}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Graphique : timeline de la maîtrise ────────────────────────────── */}
      {timelineData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t("timelineMaitrise")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "%", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name === "mastery" ? t("maitrise") : t("fiabilite"),
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs">
                      {value === "mastery" ? t("maitrise") : t("fiabilite")}
                    </span>
                  )}
                />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: t("seuilFragile"), fontSize: 10, fill: "#f59e0b" }} />
                <Line
                  type="monotone"
                  dataKey="mastery"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Graphique : prédictions vs réalité ─────────────────────────────── */}
      {predictionsChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t("predictionsVsRealite")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={predictionsChartData} margin={{ top: 5, right: 20, bottom: 60, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="code"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  label={{ value: "%", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name === "predit" ? t("predit") : t("reel"),
                  ]}
                  labelFormatter={(code: string) => {
                    const item = predictionsChartData.find((p) => p.code === code);
                    return item ? item.libelle : code;
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs">
                      {value === "predit" ? t("predit") : t("reel")}
                    </span>
                  )}
                />
                <Bar dataKey="predit" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reel" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Détail des prédictions par matière ─────────────────────────────── */}
      {predictionsParMatiere.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              {t("predictionsDetail")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {predictionsParMatiere.map(([cle, groupe]) => (
              <div key={cle} className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: groupe.couleur ?? "hsl(var(--muted-foreground))" }}
                  />
                  {groupe.nom}
                  <Badge variant="outline" className="text-xs">
                    {groupe.predictions.length}
                  </Badge>
                </h4>
                <div className="space-y-1.5">
                  {groupe.predictions.map((p) => (
                    <PredictionRow key={p.id} prediction={p} t={t} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── État vide ──────────────────────────────────────────────────────── */}
      {data.predictions.length === 0 &&
        data.evidences.length === 0 &&
        data.bulletins.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <Activity className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">{t("etatVide")}</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("etatVideAide")}
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}

// ── Sous-composant : ligne de prédiction ────────────────────────────────────

function PredictionRow({
  prediction,
  t,
}: {
  prediction: Prediction;
  t: ReturnType<typeof useTranslations>;
}) {
  const verifiee = prediction.verifieeLe !== null;
  const correcte = prediction.predictionCorrecte === true;
  const ecart = prediction.ecart;

  return (
    <div className="flex flex-col sm:flex-row items-start gap-3 rounded-lg border p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">
            {prediction.competence.code}
          </span>
          <span className="font-medium truncate">
            {prediction.competence.libelle}
          </span>
          <Badge
            variant="outline"
            className={cn("text-xs", DIFFICULTE_COULEUR[prediction.difficultePredite] ?? "")}
          >
            {prediction.difficultePredite}
          </Badge>
        </div>
        {prediction.competence.chapitre && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {prediction.competence.chapitre.nom}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-xs">
        {/* Prédiction */}
        <div className="text-center">
          <p className="text-muted-foreground">{t("predit")}</p>
          <p className="font-semibold text-violet-600">
            {Math.round(prediction.probaReussite * 100)}%
          </p>
        </div>

        {/* Réalité */}
        {verifiee && prediction.masteryApres !== null ? (
          <div className="text-center">
            <p className="text-muted-foreground">{t("reel")}</p>
            <p className={cn(
              "font-semibold",
              prediction.masteryApres >= 0.55 ? "text-emerald-600" : prediction.masteryApres >= 0.35 ? "text-amber-600" : "text-red-600"
            )}>
              {Math.round(prediction.masteryApres * 100)}%
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-muted-foreground">{t("reel")}</p>
            <p className="font-semibold text-muted-foreground">—</p>
          </div>
        )}

        {/* Écart */}
        {verifiee && ecart !== null && (
          <div className="text-center">
            <p className="text-muted-foreground">{t("ecart")}</p>
            <p className={cn(
              "font-semibold",
              correcte ? "text-emerald-600" : "text-red-600"
            )}>
              {Math.round(ecart * 100)}%
            </p>
          </div>
        )}

        {/* Statut vérification */}
        {verifiee ? (
          correcte ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
      </div>
    </div>
  );
}
