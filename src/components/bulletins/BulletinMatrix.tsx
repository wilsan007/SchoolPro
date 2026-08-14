"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronRight, Eye, EyeOff,
  Loader2, TableProperties, Award,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// ─── Types ───────────────────────────────────────────────

interface MatiereCol {
  id: string;
  nom: string;
  code: string;
  examCount: number;
  moyenneClasse: number | null;
}

interface EleveRow {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  matieres: Record<string, {
    notes: (number | null)[];
    moyenne: number | null;
    rang: number | null;
    coefficient: number;
  }>;
  moyenneGenerale: number | null;
  moyenneClasse: number | null;
  rang: number | null;
  effectif: number | null;
}

interface AnnuelleEleve {
  eleveId: string;
  moyennesTrim: { periodeNom: string; numero: number; moyenne: number | null; rang: number | null }[];
  moyenneAnnuelle: number | null;
  rangAnnuel: number | null;
  decision: string | null;
}

interface MatriceData {
  eleves: EleveRow[];
  matieres: MatiereCol[];
  annuelle: {
    periodes: { nom: string; numero: number }[];
    elevesAnnuelle: AnnuelleEleve[];
  } | null;
  periodeNom: string;
  periodeNumero: number;
}

interface Props {
  classeId: string;
  periodeId: string;
  classeNom: string;
}

// ─── Helpers ─────────────────────────────────────────────

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2);
}

function getOrdinal(n: number | null): string {
  if (!n) return "—";
  return n === 1 ? "1er" : `${n}e`;
}

const decisionColors: Record<string, string> = {
  PASSAGE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REDOUBLEMENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  FELICITATIONS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ENCOURAGEMENTS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  AVERTISSEMENT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

// ─── Composant ───────────────────────────────────────────

export function BulletinMatrix({ classeId, periodeId, classeNom }: Props) {
  const t = useTranslations("bulletins");
  const [data, setData] = useState<MatriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsedMatieres, setCollapsedMatieres] = useState<Set<string>>(new Set());
  const [showExamNotes, setShowExamNotes] = useState(true);
  const [showMoyClasse, setShowMoyClasse] = useState(true);
  const [showRang, setShowRang] = useState(true);
  const [showAnnuelle, setShowAnnuelle] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/matrice?classeId=${classeId}&periodeId=${periodeId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("errMatrixLoad"));
    } finally {
      setLoading(false);
    }
  }, [classeId, periodeId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleMatiere(id: string) {
    setCollapsedMatieres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">{t("loadingBulletins")}</span>
      </div>
    );
  }

  if (!data || data.eleves.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        {t("noBulletinsGenerated")}
      </div>
    );
  }

  const { eleves, matieres, annuelle } = data;
  const hasAnnuelle = annuelle !== null && data.periodeNumero === 3;

  // Calculer largeur: élève + matières + général
  const totalExamCols = matieres.reduce((sum, m) => sum + (showExamNotes ? m.examCount : 0), 0);
  const matiereColCount = matieres.length; // colonnes moy élève
  const generalCols = 1 + (showMoyClasse ? 1 : 0) + (showRang ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Barre de contrôles */}
      <div className="flex flex-wrap items-center gap-2 px-1 py-2">
        <div className="flex items-center gap-2 mr-4">
          <TableProperties className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {classeNom} — {data.periodeNom}
          </span>
          <Badge variant="outline" className="text-xs">
            {t("studentsSubjects", { students: eleves.length, subjects: matieres.length })}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={showExamNotes ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowExamNotes(!showExamNotes)}
          >
            {showExamNotes ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {t("showExamNotes")}
          </Button>
          <Button
            variant={showMoyClasse ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowMoyClasse(!showMoyClasse)}
          >
            {showMoyClasse ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {t("showClassAvg")}
          </Button>
          <Button
            variant={showRang ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowRang(!showRang)}
          >
            {showRang ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {t("showRanks")}
          </Button>
          {hasAnnuelle && (
            <Button
              variant={showAnnuelle ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowAnnuelle(!showAnnuelle)}
            >
              <Award className="h-3 w-3" />
              {t("annualRecap")}
            </Button>
          )}
        </div>
      </div>

      {/* Tableau principal — plein écran */}
      <Card className="overflow-hidden flex-1">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          <table className="border-collapse" style={{ fontSize: "10px", width: "max-content", minWidth: "100%" }}>
            {/* ─── En-têtes ─── */}
            <thead>
              {/* Ligne 1: Élève | Matières (groupées) | Général | Annuel */}
              <tr className="bg-slate-100 dark:bg-slate-800/50">
                <th
                  className="sticky left-0 z-20 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-left font-bold text-[10px] uppercase tracking-wide min-w-[140px]"
                  rowSpan={2}
                >
                  Élève
                </th>
                {matieres.map((m) => {
                  const isCollapsed = collapsedMatieres.has(m.id);
                  const subCols = (isCollapsed ? 0 : (showExamNotes ? m.examCount : 0)) + 1 + (showMoyClasse ? 1 : 0) + (showRang ? 1 : 0);
                  return (
                    <th
                      key={m.id}
                      colSpan={isCollapsed ? 1 : subCols}
                      className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center font-bold text-[10px] cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors"
                      onClick={() => toggleMatiere(m.id)}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        {isCollapsed ? (
                          <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                        )}
                        <span className="truncate max-w-[90px]" title={m.nom}>
                          {m.nom}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th
                  className="border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-center font-bold text-[11px] uppercase bg-indigo-50 dark:bg-indigo-900/20"
                  colSpan={generalCols}
                  rowSpan={1}
                >
                  Général
                </th>
                {hasAnnuelle && showAnnuelle && annuelle && (
                  <>
                    {annuelle.periodes.map((p) => (
                      <th
                        key={p.numero}
                        className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center font-bold text-[10px] bg-amber-50 dark:bg-amber-900/20"
                      >
                        {p.nom}
                      </th>
                    ))}
                    <th className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center font-bold text-[10px] bg-amber-100 dark:bg-amber-900/30">
                      Moy. Annuelle
                    </th>
                    <th className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center font-bold text-[10px] bg-amber-100 dark:bg-amber-900/30">
                      Rang Annuel
                    </th>
                    <th className="border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-center font-bold text-[10px] bg-amber-100 dark:bg-amber-900/30">
                      Décision
                    </th>
                  </>
                )}
              </tr>

              {/* Ligne 2: sous-colonnes (N1, N2, Moy.Él, Moy.Cl, Rang) */}
              <tr className="bg-slate-50 dark:bg-slate-800/30">
                {matieres.map((m) => {
                  const isCollapsed = collapsedMatieres.has(m.id);
                  if (isCollapsed) {
                    return (
                      <th key={m.id} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-[9px] text-muted-foreground font-normal">
                        ▸
                      </th>
                    );
                  }
                  return (
                    <Fragment key={m.id}>
                      {showExamNotes && Array.from({ length: m.examCount }, (_, i) => (
                        <th key={`${m.id}-n${i}`} className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[8px] font-medium text-muted-foreground min-w-[28px]">
                          N{i + 1}
                        </th>
                      ))}
                      <th key={`${m.id}-moy`} className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[8px] font-bold text-slate-600 dark:text-slate-300 bg-yellow-50 dark:bg-yellow-900/10 min-w-[36px]">
                        Moy.
                      </th>
                      {showMoyClasse && (
                        <th key={`${m.id}-moyc`} className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[8px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 min-w-[36px]">
                          Cl.
                        </th>
                      )}
                      {showRang && (
                        <th key={`${m.id}-rang`} className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[8px] font-medium text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/10 min-w-[30px]">
                          Rg
                        </th>
                      )}
                    </Fragment>
                  );
                })}
                {/* Sous-colonnes Général */}
                <th className="border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[8px] font-bold bg-indigo-50 dark:bg-indigo-900/20 min-w-[42px]">
                  Moy.
                </th>
                {showMoyClasse && (
                  <th className="border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[8px] font-medium text-blue-600 dark:text-blue-400 bg-indigo-50 dark:bg-indigo-900/20 min-w-[42px]">
                    Cl.
                  </th>
                )}
                {showRang && (
                  <th className="border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-[8px] font-medium text-amber-700 dark:text-amber-500 bg-indigo-50 dark:bg-indigo-900/20 min-w-[36px]">
                    Rang
                  </th>
                )}
                {/* Sous-colonnes Annuel — vides car déjà dans ligne 1 */}
                {hasAnnuelle && showAnnuelle && annuelle && (
                  <Fragment key="annuelle-sub">
                    {annuelle.periodes.map((p) => (
                      <th key={`sub-${p.numero}`} className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[7px] text-muted-foreground bg-amber-50 dark:bg-amber-900/20 min-w-[36px]">
                        Moy.
                      </th>
                    ))}
                    <th className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[7px] font-bold bg-amber-100 dark:bg-amber-900/30 min-w-[42px]">—</th>
                    <th className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[7px] font-bold bg-amber-100 dark:bg-amber-900/30 min-w-[36px]">—</th>
                    <th className="border border-slate-300 dark:border-slate-700 px-1 py-0.5 text-[7px] bg-amber-100 dark:bg-amber-900/30 min-w-[60px]">—</th>
                  </Fragment>
                )}
              </tr>
            </thead>

            {/* ─── Corps: une ligne par élève ─── */}
            <tbody>
              {eleves.map((eleve, idx) => {
                const annuelEleve = annuelle?.elevesAnnuelle.find((a) => a.eleveId === eleve.id);
                return (
                  <tr
                    key={eleve.id}
                    className={cn(
                      "transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30",
                      idx % 2 === 0 ? "bg-white dark:bg-slate-900/20" : "bg-slate-50/50 dark:bg-slate-800/10"
                    )}
                  >
                    {/* Nom élève */}
                    <td className="sticky left-0 z-10 bg-inherit border border-slate-300 dark:border-slate-700 px-2 py-1 font-medium text-[10px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground text-[8px] font-mono">{eleve.matricule}</span>
                        <span>{eleve.prenom} {eleve.nom}</span>
                      </div>
                    </td>

                    {/* Colonnes par matière */}
                    {matieres.map((m) => {
                      const isCollapsed = collapsedMatieres.has(m.id);
                      const matData = eleve.matieres[m.id];

                      if (isCollapsed) {
                        return (
                          <td key={m.id} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] text-muted-foreground">
                            {matData?.moyenne !== null && matData?.moyenne !== undefined ? fmt(matData.moyenne) : "—"}
                          </td>
                        );
                      }

                      return (
                        <Fragment key={m.id}>
                          {showExamNotes && Array.from({ length: m.examCount }, (_, i) => (
                            <td key={`${m.id}-n${i}`} className="border border-slate-300 dark:border-slate-700 px-0.5 py-1 text-center text-[9px]">
                              {matData?.notes[i] !== null && matData?.notes[i] !== undefined ? (
                                <span className={cn(
                                  matData.notes[i]! >= 10 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400 font-medium"
                                )}>
                                  {matData.notes[i]!.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                          ))}
                          <td key={`${m.id}-moy`} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] font-bold bg-yellow-50/50 dark:bg-yellow-900/10">
                            {fmt(matData?.moyenne ?? null)}
                          </td>
                          {showMoyClasse && (
                            <td key={`${m.id}-moyc`} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                              {fmt(m.moyenneClasse)}
                            </td>
                          )}
                          {showRang && (
                            <td key={`${m.id}-rang`} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] text-amber-700 dark:text-amber-500 font-medium bg-amber-50/30 dark:bg-amber-900/10">
                              {getOrdinal(matData?.rang ?? null)}
                            </td>
                          )}
                        </Fragment>
                      );
                    })}

                    {/* Colonnes Général */}
                    <td className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center text-[10px] font-bold bg-indigo-50/50 dark:bg-indigo-900/20">
                      {fmt(eleve.moyenneGenerale)}
                    </td>
                    {showMoyClasse && (
                      <td className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center text-[9px] text-blue-600 dark:text-blue-400 bg-indigo-50/30 dark:bg-indigo-900/10">
                        {fmt(eleve.moyenneClasse)}
                      </td>
                    )}
                    {showRang && (
                      <td className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center text-[9px] font-bold text-amber-700 dark:text-amber-500 bg-indigo-50/30 dark:bg-indigo-900/10">
                        {getOrdinal(eleve.rang)}
                        {eleve.effectif && <span className="text-[7px] text-muted-foreground">/{eleve.effectif}</span>}
                      </td>
                    )}

                    {/* Colonnes Annuel (T3 only) */}
                    {hasAnnuelle && showAnnuelle && annuelle && annuelEleve && (
                      <Fragment key="annuelle-row">
                        {annuelEleve.moyennesTrim.map((t) => (
                          <td key={`ann-${t.numero}`} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] bg-amber-50/30 dark:bg-amber-900/10">
                            {fmt(t.moyenne)}
                          </td>
                        ))}
                        <td className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[10px] font-bold bg-amber-100/50 dark:bg-amber-900/20">
                          {fmt(annuelEleve.moyenneAnnuelle)}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] font-bold text-amber-700 dark:text-amber-500 bg-amber-100/50 dark:bg-amber-900/20">
                          {getOrdinal(annuelEleve.rangAnnuel)}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[8px] bg-amber-100/50 dark:bg-amber-900/20">
                          {annuelEleve.decision ? (
                            <span className={cn("px-1 py-0.5 rounded font-medium text-[7px]", decisionColors[annuelEleve.decision] ?? "bg-slate-100 text-slate-700")}>
                              {annuelEleve.decision}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </Fragment>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* ─── Pied: moyennes de classe ─── */}
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800/50 font-bold">
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 px-2 py-1 text-[9px] uppercase tracking-wide">
                  {t("classAvgRow")}
                </td>
                {matieres.map((m) => {
                  const isCollapsed = collapsedMatieres.has(m.id);
                  if (isCollapsed) {
                    return <td key={m.id} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px]">{fmt(m.moyenneClasse)}</td>;
                  }
                  return (
                    <Fragment key={m.id}>
                      {showExamNotes && Array.from({ length: m.examCount }, (_, i) => (
                        <td key={`${m.id}-fn${i}`} className="border border-slate-300 dark:border-slate-700" />
                      ))}
                      <td key={`${m.id}-fmoy`} className="border border-slate-300 dark:border-slate-700 px-1 py-1 text-center text-[9px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
                        {fmt(m.moyenneClasse)}
                      </td>
                      {showMoyClasse && <td key={`${m.id}-fmoyc`} className="border border-slate-300 dark:border-slate-700" />}
                      {showRang && <td key={`${m.id}-frang`} className="border border-slate-300 dark:border-slate-700" />}
                    </Fragment>
                  );
                })}
                <td className="border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-center text-[10px] text-blue-700 dark:text-blue-400 bg-indigo-50 dark:bg-indigo-900/20">
                  {fmt(eleves[0]?.moyenneClasse ?? null)}
                </td>
                {showMoyClasse && <td className="border border-slate-300 dark:border-slate-700" />}
                {showRang && <td className="border border-slate-300 dark:border-slate-700" />}
                {hasAnnuelle && showAnnuelle && annuelle && (
                  <Fragment key="annuelle-foot">
                    {annuelle.periodes.map((p) => (
                      <td key={`fann-${p.numero}`} className="border border-slate-300 dark:border-slate-700 bg-amber-50/50 dark:bg-amber-900/10" />
                    ))}
                    <td className="border border-slate-300 dark:border-slate-700 bg-amber-100/50 dark:bg-amber-900/20" />
                    <td className="border border-slate-300 dark:border-slate-700 bg-amber-100/50 dark:bg-amber-900/20" />
                    <td className="border border-slate-300 dark:border-slate-700 bg-amber-100/50 dark:bg-amber-900/20" />
                  </Fragment>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 px-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-50 dark:bg-yellow-900/30" /> Moy. élève
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-50 dark:bg-blue-900/30" /> Moy. classe
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 dark:bg-amber-900/30" /> Rang
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-indigo-50 dark:bg-indigo-900/30" /> Général
        </span>
        {hasAnnuelle && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/40" /> Récap annuel
          </span>
        )}
        <span className="ml-auto">Cliquer sur une matière pour replier/déplier ses colonnes</span>
      </div>
    </div>
  );
}
