"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileQuestion,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  BookOpen,
  ClipboardList,
  GraduationCap,
  PenLine,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────────────────────
// Types (miroir de alerte-decalage.ts)
// ──────────────────────────────────────────────────────────────

type NiveauDecalage = "ALIGNE" | "DECLARE_SEUL" | "REALISE_NON_DECLARE" | "DECALAGE";

interface ChapitrePrevu {
  planificationId: string;
  chapitreNom: string;
  matiereNom: string;
  classeNom: string | null;
  niveau: string;
  semaineDebut: number;
  semaineFin: number;
  statutPlan: string;
  declareTraite: boolean;
  devoirsDonnes: number;
  preuvesEleves: number;
  notesSaisies: number;
  exercicesAssignes: number;
  niveauDecalage: NiveauDecalage;
  explication: string;
}

interface ResultatAlerteDecalage {
  semaine: number;
  dateDebut: string;
  dateFin: string;
  chapitres: ChapitrePrevu[];
  resume: {
    alignes: number;
    declaresSeuls: number;
    realisesNonDeclares: number;
    decalages: number;
    total: number;
  };
  aDesAlertes: boolean;
}

// ──────────────────────────────────────────────────────────────
// Configuration visuelle par niveau
// ──────────────────────────────────────────────────────────────

const CONFIG_NIVEAU: Record<
  NiveauDecalage,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: typeof AlertTriangle;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  ALIGNE: {
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    borderColor: "border-l-emerald-500",
    icon: CheckCircle2,
    badgeVariant: "default",
  },
  DECLARE_SEUL: {
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-l-amber-500",
    icon: FileQuestion,
    badgeVariant: "secondary",
  },
  REALISE_NON_DECLARE: {
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-l-blue-500",
    icon: Clock,
    badgeVariant: "secondary",
  },
  DECALAGE: {
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-l-red-500",
    icon: AlertTriangle,
    badgeVariant: "destructive",
  },
};

// ──────────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────────

export function AlerteDecalage() {
  const t = useTranslations("learnos.alerteDecalage");
  const [data, setData] = useState<ResultatAlerteDecalage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/learnos/alerte-decalage");
      if (!res.ok) throw new Error("Erreur");
      const json = await res.json();
      setData(json);
    } catch {
      setError(t("erreur"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("chargement")}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-l-4 border-l-red-500">
        <CardContent className="py-4 text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Cas : aucun chapitre prévu cette semaine.
  if (data.resume.total === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          {t("aucunChapitrePrevu", { semaine: data.semaine })}
        </CardContent>
      </Card>
    );
  }

  const { resume } = data;

  return (
    <div className="space-y-3">
      {/* ── En-tête avec indicateur global ── */}
      <Card className={data.aDesAlertes ? "border-l-4 border-l-red-500" : "border-l-4 border-l-emerald-500"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {data.aDesAlertes ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              )}
              {t("titre")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t("semaine", { n: data.semaine })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Indicateur global */}
          <div className="flex items-center gap-3 rounded-lg p-3">
            {data.aDesAlertes ? (
              <>
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">
                    {t("decalageDetecte")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("resumeDecalage", {
                      decalages: resume.decalages,
                      declaresSeuls: resume.declaresSeuls,
                      total: resume.total,
                    })}
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <div>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {t("toutAligne")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("resumeAligne", { total: resume.total })}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Badges résumé */}
          <div className="flex flex-wrap gap-2">
            {resume.alignes > 0 && (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {t("alignes", { n: resume.alignes })}
              </Badge>
            )}
            {resume.declaresSeuls > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                <FileQuestion className="mr-1 h-3 w-3" />
                {t("declaresSeuls", { n: resume.declaresSeuls })}
              </Badge>
            )}
            {resume.realisesNonDeclares > 0 && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                <Clock className="mr-1 h-3 w-3" />
                {t("realisesNonDeclares", { n: resume.realisesNonDeclares })}
              </Badge>
            )}
            {resume.decalages > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {t("decalages", { n: resume.decalages })}
              </Badge>
            )}
          </div>

          {/* Bouton refresh */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={charger} disabled={loading}>
              <RefreshCw className="h-3 w-3" />
              {t("rafraichir")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Détail par chapitre ── */}
      {expanded && (
        <div className="space-y-2">
          {data.chapitres
            .sort((a, b) => {
              // Trier : DECALAGE d'abord, puis DECLARE_SEUL, puis REALISE_NON_DECLARE, puis ALIGNE
              const ordre: Record<NiveauDecalage, number> = {
                DECALAGE: 0,
                DECLARE_SEUL: 1,
                REALISE_NON_DECLARE: 2,
                ALIGNE: 3,
              };
              return ordre[a.niveauDecalage] - ordre[b.niveauDecalage];
            })
            .map((chap) => {
              const config = CONFIG_NIVEAU[chap.niveauDecalage];
              const Icon = config.icon;
              return (
                <Card key={chap.planificationId} className={`border-l-4 ${config.borderColor}`}>
                  <CardContent className="space-y-2 py-3">
                    {/* Ligne 1 : titre + badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <span className="font-medium">{chap.chapitreNom}</span>
                      <Badge variant="outline" className="text-xs">
                        {chap.matiereNom}
                      </Badge>
                      {chap.classeNom && (
                        <Badge variant="secondary" className="text-xs">
                          {chap.classeNom}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {t("semaines", { debut: chap.semaineDebut, fin: chap.semaineFin })}
                      </Badge>
                    </div>

                    {/* Ligne 2 : signaux */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <SignalBadge
                        icon={BookOpen}
                        label={t("statutPlan")}
                        value={chap.statutPlan}
                        active={chap.declareTraite}
                      />
                      <SignalBadge
                        icon={ClipboardList}
                        label={t("devoirs")}
                        value={chap.devoirsDonnes.toString()}
                        active={chap.devoirsDonnes > 0}
                      />
                      <SignalBadge
                        icon={GraduationCap}
                        label={t("preuves")}
                        value={chap.preuvesEleves.toString()}
                        active={chap.preuvesEleves > 0}
                      />
                      <SignalBadge
                        icon={PenLine}
                        label={t("notes")}
                        value={chap.notesSaisies.toString()}
                        active={chap.notesSaisies > 0}
                      />
                      <SignalBadge
                        icon={ClipboardList}
                        label={t("exercices")}
                        value={chap.exercicesAssignes.toString()}
                        active={chap.exercicesAssignes > 0}
                      />
                    </div>

                    {/* Ligne 3 : explication */}
                    <p className={`text-sm ${config.color}`}>
                      {chap.explication}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sous-composant : badge de signal
// ──────────────────────────────────────────────────────────────

function SignalBadge({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${active ? "text-emerald-500" : "text-muted-foreground/50"}`} />
      <span>{label}:</span>
      <span className={`font-medium ${active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
