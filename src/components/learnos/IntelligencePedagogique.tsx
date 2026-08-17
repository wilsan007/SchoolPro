"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain, Loader2, RefreshCw, TrendingUp, TrendingDown, Target,
  AlertTriangle, CheckCircle2, Sparkles, Activity, BookOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { texteErreur } from "@/lib/erreurs-client";

/**
 * Tableau de bord d'intelligence pédagogique.
 *
 * Montre à la direction ce que le système a APPRIS de l'historique :
 *   - Patterns détectés (compétences difficiles par niveau)
 *   - Précision des prédictions passées
 *   - Seuils calibrés par niveau × matière
 *   - Journal d'apprentissage (trace d'audit)
 *
 * Le bouton « Analyser » déclenche un cycle complet d'analyse.
 */

interface Pattern {
  id: string;
  niveau: string;
  competenceId: string | null;
  masteryMoyenne: number;
  confidenceMoyenne: number;
  effectif: number;
  ecartType: number;
  tauxEchec: number;
  anneesCouvertes: number;
  competence: { code: string; libelle: string; chapitre: { nom: string; matiere: { nom: string } } } | null;
}

interface Prediction {
  id: string;
  difficultePredite: string;
  probaReussite: number;
  predictionCorrecte: boolean | null;
  ecart: number | null;
  verifieeLe: string | null;
  eleve: { nom: string; prenom: string };
  competence: { code: string; libelle: string };
}

interface Calibration {
  id: string;
  niveau: string;
  matiereId: string | null;
  seuilCritique: number;
  seuilFragile: number;
  seuilConsolide: number;
  seuilAvance: number;
  confianceMinimale: number;
  echantillon: number;
  ameliorationMesuree: boolean | null;
  gainPrecision: number | null;
}

interface JournalEntry {
  id: string;
  typeAnalyse: string;
  resume: string;
  echantillon: number;
  perimetre: string;
  createdAt: string;
}

interface IntelligenceData {
  patterns: Pattern[];
  predictions: Prediction[];
  calibrations: Calibration[];
  journal: JournalEntry[];
  stats: {
    totalPatterns: number;
    totalPredictions: number;
    totalCalibrations: number;
    tauxPrecision: number | null;
    totalVerifiees: number;
    distribution: Record<string, number>;
  };
}

const DIFFICULTE_COULEUR: Record<string, string> = {
  FACILE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  MODERE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DIFFICILE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CRITIQUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function IntelligencePedagogique({ anneeId }: { anneeId?: string }) {
  const t = useTranslations("learnos.intelligence");
  const te = useTranslations("learnos.erreurs");
  const tc = useTranslations("learnos.commun");

  const [data, setData] = useState<IntelligenceData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [analyse, setAnalyse] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const url = anneeId
        ? `/api/learnos/intelligence?anneeId=${anneeId}`
        : "/api/learnos/intelligence";
      const res = await fetch(url);
      if (!res.ok) {
        toast.error(texteErreur(await res.json().catch(() => ({})), te, tc("erreurServeur")));
        return;
      }
      setData(await res.json());
    } catch {
      toast.error(tc("erreur"));
    } finally {
      setChargement(false);
    }
  }, [anneeId, te, tc]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function lancerAnalyse() {
    setAnalyse(true);
    try {
      const res = await fetch("/api/learnos/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complet",
          ...(anneeId ? { anneeId } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(texteErreur(body, te, tc("erreurServeur")));
        return;
      }
      toast.success(t("analyseTerminee"));
      await charger();
    } catch {
      toast.error(tc("erreur"));
    } finally {
      setAnalyse(false);
    }
  }

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t("chargement")}
      </div>
    );
  }

  if (!data) return null;

  const precision = data.stats.tauxPrecision;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* En-tête : titre + bouton d'analyse */}
      <Card>
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-primary shrink-0" />
            <div>
              <p className="font-medium">{t("titre")}</p>
              <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
            </div>
          </div>
          <Button onClick={() => void lancerAnalyse()} disabled={analyse}>
            {analyse ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {t("lancerAnalyse")}
          </Button>
        </CardContent>
      </Card>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t("patterns")}</span>
            </div>
            <p className="text-2xl font-bold">{data.stats.totalPatterns}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t("predictions")}</span>
            </div>
            <p className="text-2xl font-bold">{data.stats.totalPredictions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t("precision")}</span>
            </div>
            <p className="text-2xl font-bold">
              {precision !== null ? `${(precision * 100).toFixed(0)}%` : tc("donneesInsuffisantes")}
            </p>
            {data.stats.totalVerifiees > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("surN", { n: data.stats.totalVerifiees })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{t("calibrations")}</span>
            </div>
            <p className="text-2xl font-bold">{data.stats.totalCalibrations}</p>
          </CardContent>
        </Card>
      </div>

      {/* Patterns détectés — les compétences les plus difficiles */}
      {data.patterns.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="font-medium text-sm">{t("patternsTitre")}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{t("patternsAide")}</p>
            <div className="space-y-2">
              {data.patterns.slice(0, 10).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{p.niveau}</Badge>
                      {p.competence && (
                        <span className="text-sm font-medium truncate">
                          {p.competence.code} — {p.competence.libelle}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.competence?.chapitre?.matiere?.nom ?? "—"} · {p.competence?.chapitre?.nom ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t("moyenne")}</p>
                      <p className="text-sm font-medium">
                        {(p.masteryMoyenne * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t("tauxEchec")}</p>
                      <p className={`text-sm font-medium ${p.tauxEchec > 0.3 ? "text-red-600" : p.tauxEchec > 0.15 ? "text-amber-600" : "text-emerald-600"}`}>
                        {(p.tauxEchec * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">{t("effectif")}</p>
                      <p className="text-sm font-medium">{p.effectif}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calibrations des seuils */}
      {data.calibrations.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-sm">{t("calibrationsTitre")}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{t("calibrationsAide")}</p>
            <div className="space-y-2">
              {data.calibrations.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{c.niveau}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("surN", { n: c.echantillon })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 text-xs">
                    <span>C: {c.seuilCritique.toFixed(2)}</span>
                    <span>F: {c.seuilFragile.toFixed(2)}</span>
                    <span>Co: {c.seuilConsolide.toFixed(2)}</span>
                    <span>A: {c.seuilAvance.toFixed(2)}</span>
                    {c.ameliorationMesuree !== null && (
                      c.ameliorationMesuree ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journal d'apprentissage — trace d'audit */}
      {data.journal.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">{t("journalTitre")}</h3>
            </div>
            <div className="space-y-1.5">
              {data.journal.map((j) => (
                <div key={j.id} className="flex items-start gap-3 text-sm py-1.5 border-b last:border-0">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {t(`type_${j.typeAnalyse}`, { defaultValue: j.typeAnalyse })}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{j.resume}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(j.createdAt).toLocaleString()} · {j.perimetre}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* État vide */}
      {data.patterns.length === 0 &&
        data.calibrations.length === 0 &&
        data.journal.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <Brain className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="font-medium text-sm">{t("etatVide")}</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("etatVideAide")}
              </p>
              <Button onClick={() => void lancerAnalyse()} disabled={analyse}>
                {analyse ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {t("lancerAnalyse")}
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
