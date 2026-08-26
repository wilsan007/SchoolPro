"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  FileText,
  Dumbbell,
  Clock,
  BookOpen,
  Loader2,
} from "lucide-react";

// ------------------------------------------------------------
// Types — alignés sur TableauBordSeance (tableau-bord-enseignant.ts)
// ------------------------------------------------------------

interface TableauBordData {
  seance: {
    id: string;
    date: string;
    dureePrevue: number;
    classeNom: string;
    matiereNom: string;
    chapitreNom: string;
  };
  planification: {
    statut: string;
    semaineDebut: number;
    semaineFin: number;
    heuresPrevues: number | null;
  } | null;
  competencesPrevues: { code: string; libelle: string; statut: string }[];
  prediction: {
    elevesEnDifficulte: number;
    totalEleves: number;
    prerequisManquants: { competence: string; eleves: number }[];
  } | null;
  patternHistorique: { moyenneHistorique: number; tauxEchec: number } | null;
  planLecon: {
    titre: string;
    objectifs: string[];
    etapes: { nom: string; duree: number; description: string; support?: string }[];
    materiel: string[];
    differentiation: string | null;
    statut: string;
  } | null;
  exercicesRemediation: {
    eleveId: string;
    eleveNom: string;
    competence: string;
    palier: string;
  }[];
}

interface Props {
  seanceId: string | null;
}

// ------------------------------------------------------------
// Composant principal
// ------------------------------------------------------------

export function TableauBordPanel({ seanceId }: Props) {
  const t = useTranslations("cahierJournal");
  const [data, setData] = useState<TableauBordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTableau = useCallback(async () => {
    if (!seanceId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cahier-journal/tableau-bord/${seanceId}`);
      if (!res.ok) {
        throw new Error("Erreur lors du chargement");
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Erreur");
    } finally {
      setLoading(false);
    }
  }, [seanceId]);

  useEffect(() => {
    void fetchTableau();
  }, [fetchTableau]);

  if (!seanceId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        {t("tableauBord.titre")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("tableauBord.titre")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? t("tableauBord.aucunePrediction")}
      </div>
    );
  }

  // Calcul du pourcentage d'élèves en difficulté.
  const pctDifficulte =
    data.prediction && data.prediction.totalEleves > 0
      ? Math.round(
          (data.prediction.elevesEnDifficulte / data.prediction.totalEleves) * 100
        )
      : 0;
  const alerteActive = pctDifficulte > 20;

  return (
    <div className="space-y-4">
      {/* En-tête : infos séance */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-5 h-5 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            {t("tableauBord.titre")}
          </h3>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="font-medium">{data.seance.classeNom}</span>
          <span>·</span>
          <span>{data.seance.matiereNom}</span>
          <span>·</span>
          <span>{data.seance.chapitreNom}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {data.seance.dureePrevue} min
          </span>
        </div>
      </div>

      {/* Prédiction — panneau d'alerte si >20% en difficulté */}
      {data.prediction ? (
        <div
          className={`rounded-lg border p-4 ${
            alerteActive
              ? "border-orange-300 bg-orange-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-5 h-5 mt-0.5 ${
                alerteActive ? "text-orange-600" : "text-slate-400"
              }`}
            />
            <div className="flex-1 space-y-2">
              <h4 className="text-sm font-semibold text-slate-800">
                {t("tableauBord.prediction")}
              </h4>
              <p
                className={`text-sm ${
                  alerteActive ? "text-orange-700" : "text-slate-600"
                }`}
              >
                {t("tableauBord.elevesEnDifficulte", {
                  count: data.prediction.elevesEnDifficulte,
                  pct: pctDifficulte,
                })}
              </p>
              {data.prediction.prerequisManquants.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">
                    {t("tableauBord.prerequisManquants")}
                  </p>
                  {data.prediction.prerequisManquants.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded px-2 py-1"
                    >
                      <span>{p.competence}</span>
                      <span className="font-medium">{p.eleves}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="w-4 h-4" />
            {t("tableauBord.aucunePrediction")}
          </div>
        </div>
      )}

      {/* Compétences prévues — checklist */}
      {data.competencesPrevues.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-slate-800">
              {t("tableauBord.competencesPrevues")}
            </h4>
          </div>
          <div className="space-y-1.5">
            {data.competencesPrevues.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    c.statut === "TRAITE"
                      ? "bg-emerald-500 border-emerald-500"
                      : c.statut === "EN_COURS"
                        ? "bg-blue-500 border-blue-500"
                        : "border-slate-300"
                  }`}
                >
                  {c.statut === "TRAITE" && (
                    <CheckCircle className="w-3 h-3 text-white" />
                  )}
                </span>
                <span className="font-mono text-xs text-slate-500">{c.code}</span>
                <span>{c.libelle}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern historique */}
      {data.patternHistorique && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-semibold text-slate-800">
                {t("tableauBord.patternHistorique")}
              </h4>
              <p className="text-sm text-slate-600">
                {t("tableauBord.tauxEchec", {
                  pct: Math.round(data.patternHistorique.tauxEchec * 100),
                })}
              </p>
              <p className="text-xs text-slate-500">
                {t("tableauBord.moyenneHistorique", {
                  pct: Math.round(data.patternHistorique.moyenneHistorique * 100),
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan de leçon proposé */}
      {data.planLecon ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-violet-600" />
            <h4 className="text-sm font-semibold text-slate-800">
              {t("tableauBord.planLecon")}
            </h4>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">{data.planLecon.titre}</p>
            {data.planLecon.objectifs.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600">
                {data.planLecon.objectifs.map((o, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-slate-400 mt-0.5">•</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.planLecon.etapes.length > 0 && (
              <div className="space-y-1.5">
                {data.planLecon.etapes.map((etape, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5"
                  >
                    <span className="font-medium text-slate-700 min-w-[80px]">
                      {etape.nom}
                    </span>
                    <span className="text-slate-400">{etape.duree} min</span>
                    <span className="flex-1">{etape.description}</span>
                  </div>
                ))}
              </div>
            )}
            {data.planLecon.differentiation && (
              <p className="text-xs text-slate-500 italic">
                {data.planLecon.differentiation}
              </p>
            )}
          </div>
          {/* Boutons accepter / modifier / refuser */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              onClick={() => {
                /* TODO: POST accepter plan lecon */
              }}
            >
              {t("tableauBord.accepter")}
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              onClick={() => {
                /* TODO: navigate to edit page */
              }}
            >
              {t("tableauBord.modifier")}
            </button>
            <button
              className="text-xs px-3 py-1.5 rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
              onClick={() => {
                /* TODO: POST refuser plan lecon */
              }}
            >
              {t("tableauBord.refuser")}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FileText className="w-4 h-4" />
            {t("tableauBord.aucunPlan")}
          </div>
        </div>
      )}

      {/* Exercices de remédiation */}
      {data.exercicesRemediation.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-semibold text-slate-800">
              {t("tableauBord.exercicesRemediation")}
            </h4>
          </div>
          <div className="space-y-1.5">
            {data.exercicesRemediation.map((ex, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs text-slate-700 bg-slate-50 rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ex.eleveNom}</span>
                  <span className="text-slate-400">·</span>
                  <span>{ex.competence}</span>
                </div>
                <span className="text-slate-500 font-mono">{ex.palier}</span>
              </div>
            ))}
          </div>
          <button
            className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            onClick={() => {
              /* TODO: POST generer exercices */
            }}
          >
            <Dumbbell className="w-3 h-3" />
            {t("tableauBord.genererExercices")}
          </button>
        </div>
      )}
    </div>
  );
}
