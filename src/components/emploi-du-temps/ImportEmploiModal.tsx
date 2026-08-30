"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, Upload, FileSpreadsheet, Download, ArrowLeft, ArrowRight,
  CheckCircle2, AlertTriangle, XCircle, Clock, Layers, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

// ============================================================
// ImportEmploiModal — import d'emploi du temps en 2 étapes
// ============================================================
//
// Étape 1 : sélection de la classe (hiérarchie Structure → Niveau → Classe)
// Étape 2 : upload + aperçu (stats, format, métadonnées, matières auto-créées,
//           conflits, totaux par jour, comparaison avec l'existant) puis
//           application via /api/emploi-du-temps/bulk-apply.

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

interface PreviewCreneau {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  matiereId: string | null;
  matiereNom: string;
  matiereACreerKey: string | null;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  isEvaluation: boolean;
  statut: "ok" | "warning" | "error";
  warnings: string[];
}

interface PreviewConflit {
  type: "enseignant" | "salle" | "horaire";
  jour: Jour;
  heureDebut: string;
  message: string;
}

interface PreviewMatiereACreer {
  key: string;
  nom: string;
  code: string;
  niveau: string | null;
}

interface ImportPreview {
  format: string;
  metaClasse: string | null;
  metaAnnee: string | null;
  warnings: string[];
  stats: { total: number; ok: number; warnings: number; errors: number };
  matieresACreer: PreviewMatiereACreer[];
  creneaux: PreviewCreneau[];
  conflits: PreviewConflit[];
  totauxParJour: { jour: Jour; minutes: number; depasse: boolean }[];
  comparaison: { inchanges: number; ajoutes: number; supprimes: number };
  gridConfig?: { stepMinutes: number; isFineGrid: boolean; structureType: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  hierarchie: ClassesHierarchie;
  /** Nombre de créneaux existants par classe (pour l'étape 1). */
  creneauxParClasse: Record<string, number>;
  onApplied: (classeId: string) => void;
}

const JOUR_LABELS: Record<Jour, string> = {
  DIMANCHE: "Dim", LUNDI: "Lun", MARDI: "Mar", MERCREDI: "Mer",
  JEUDI: "Jeu", VENDREDI: "Ven", SAMEDI: "Sam",
};

const CATEGORIE_ICONS: Record<string, string> = {
  primaire: "📚", college: "📘", lycee: "🎓", autre: "📋",
};

function minutesToHhMm(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}h${String(min).padStart(2, "0")}` : `${h}h`;
}

/** Génère et télécharge un modèle CSV au format grille. */
function downloadModelCsv() {
  const csv = [
    "Horaire,Lundi,Mardi,Mercredi,Jeudi,Vendredi,Samedi",
    "08:00-09:00,Mathématiques / M. Ahmed / Salle 1,Français / Mme Fatima,,Sciences,,,",
    "09:00-10:00,Récréation,Récréation,Récréation,Récréation,Récréation,,",
    "10:00-11:00,Anglais / M. Omar,Histoire / Mme Amina,Évaluation,Géographie / M. Said,,,",
    "11:00-12:00,Sciences / M. Ahmed / Labo,Mathématiques,Français,Anglais,,,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele-emploi-du-temps.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportEmploiModal({ open, onClose, hierarchie, creneauxParClasse, onApplied }: Props) {
  const t = useTranslations("emploi");
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedClasseId, setSelectedClasseId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedClasse = useMemo(
    () => {
      for (const cat of hierarchie) {
        for (const niv of cat.niveaux) {
          for (const cls of niv.classes) {
            if (cls.id === selectedClasseId) return cls;
          }
        }
      }
      return null;
    },
    [hierarchie, selectedClasseId],
  );

  const reset = useCallback(() => {
    setStep(1);
    setSelectedClasseId(null);
    setFile(null);
    setPreview(null);
    setLoading(false);
    setApplying(false);
    setDragOver(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(f: File) {
    if (!selectedClasseId) return;
    setFile(f);
    setPreview(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("classeId", selectedClasseId);
      const res = await fetch("/api/emploi-du-temps/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'import");
      setPreview(data as ImportPreview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'import");
      setFile(null);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function handleApply() {
    if (!preview || !selectedClasseId) return;
    // Bloque l'application s'il y a des erreurs ou des conflits.
    if (preview.stats.errors > 0 || preview.conflits.length > 0) {
      toast.error(t("importApplyBlocked"));
      return;
    }
    setApplying(true);
    try {
      const creneaux = preview.creneaux
        .filter((c) => c.statut !== "error")
        .map((c) => ({
          matiereId: c.matiereId ?? "",
          matiereACreerKey: c.matiereACreerKey ?? undefined,
          enseignantId: c.enseignantId,
          jour: c.jour,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          salle: c.salle,
        }));
      const body: Record<string, unknown> = { classeId: selectedClasseId, creneaux };
      if (preview.matieresACreer.length > 0) {
        body.matieresACreer = preview.matieresACreer;
      }
      const res = await fetch("/api/emploi-du-temps/bulk-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur d'application");
      toast.success(t("importApplied"));
      onApplied(selectedClasseId);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'application");
    } finally {
      setApplying(false);
    }
  }

  const canApply = preview && preview.stats.errors === 0 && preview.conflits.length === 0 && preview.creneaux.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        closeOnOverlayClick={!applying}
        className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-[22px] p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" />
            {t("importTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {step === 1 ? t("importStep1Desc") : t("importStep2Desc")}
          </DialogDescription>
        </DialogHeader>

        {/* Indicateur d'étapes */}
        <div className="px-6 flex items-center gap-2 text-xs">
          <span className={cn("flex items-center gap-1", step === 1 ? "text-primary font-medium" : "text-muted-foreground")}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", step === 1 ? "bg-primary text-primary-foreground" : "bg-muted")}>1</span>
            {t("importStep1")}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className={cn("flex items-center gap-1", step === 2 ? "text-primary font-medium" : "text-muted-foreground")}>
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", step === 2 ? "bg-primary text-primary-foreground" : "bg-muted")}>2</span>
            {t("importStep2")}
          </span>
        </div>

        <div className="px-6 pb-6">
          {step === 1 && (
            <div className="space-y-3">
              {hierarchie.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("importNoClasses")}</p>
              )}
              {hierarchie.map((cat) => (
                <div key={cat.categorie} className="rounded-[18px] border border-border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 flex items-center gap-2 text-sm font-medium">
                    <span>{CATEGORIE_ICONS[cat.label] ?? "📋"}</span>
                    <span>{t(`cat_${cat.label}` as never) ?? cat.label}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {cat.niveaux.map((niv) => (
                      <div key={niv.niveau} className="px-4 py-2">
                        <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide">{niv.niveau}</p>
                        <div className="flex flex-wrap gap-2">
                          {niv.classes.map((cls) => {
                            const count = creneauxParClasse[cls.id] ?? 0;
                            const selected = cls.id === selectedClasseId;
                            return (
                              <button
                                key={cls.id}
                                onClick={() => setSelectedClasseId(cls.id)}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-left transition-all duration-200 hover:-translate-y-0.5",
                                  selected
                                    ? "border-primary bg-primary/10 shadow-[0_4px_12px_rgba(14,165,233,0.15)]"
                                    : "border-border bg-background hover:border-primary/40",
                                )}
                              >
                                <div className="text-sm font-medium">{cls.nom}</div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {count} {t("importCreneaux")}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose} className="rounded-xl">{t("cancel")}</Button>
                <Button
                  disabled={!selectedClasseId}
                  onClick={() => setStep(2)}
                  className="gap-2 rounded-xl"
                >
                  {t("importContinue")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Classe sélectionnée */}
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
                <span className="text-sm">
                  <span className="text-muted-foreground">{t("class")} : </span>
                  <span className="font-medium">{selectedClasse?.nom}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 rounded-xl"
                  onClick={() => { setStep(1); setFile(null); setPreview(null); }}
                  disabled={applying}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("importChangeClass")}
                </Button>
              </div>

              {/* Zone de dépôt */}
              {!preview && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "rounded-[22px] border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200",
                    dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  )}
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">{t("importParsing")}</p>
                    </div>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">{t("importDropzone")}</p>
                      <p className="text-xs text-muted-foreground mt-1">.xlsx, .csv, .txt, .docx</p>
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".xlsx,.csv,.txt,.docx,.doc"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                      />
                    </>
                  )}
                </div>
              )}

              {/* Bouton modèle CSV */}
              {!preview && !loading && (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={downloadModelCsv}>
                    <Download className="h-4 w-4" />
                    {t("importDownloadModel")}
                  </Button>
                </div>
              )}

              {/* Aperçu */}
              {preview && (
                <div className="space-y-4">
                  {/* Fichier + changement */}
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
                    <span className="text-sm truncate flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {file?.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => { setFile(null); setPreview(null); }}
                      disabled={applying}
                    >
                      {t("importChangeFile")}
                    </Button>
                  </div>

                  {/* Stats globales */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatCard label={t("importTotal")} value={preview.stats.total} icon={<Layers className="h-4 w-4" />} tone="info" />
                    <StatCard label="OK" value={preview.stats.ok} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
                    <StatCard label={t("importWarnings")} value={preview.stats.warnings} icon={<AlertTriangle className="h-4 w-4" />} tone="warning" />
                    <StatCard label={t("importErrors")} value={preview.stats.errors} icon={<XCircle className="h-4 w-4" />} tone="error" />
                  </div>

                  {/* Format + métadonnées + grille */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="rounded-full">
                      {t("importFormat")} : {preview.format}
                    </Badge>
                    {preview.gridConfig && (
                      <Badge variant="secondary" className="rounded-full">
                        {t("importGrid")} : {preview.gridConfig.stepMinutes}min
                        {preview.gridConfig.isFineGrid ? ` (${t("importFineGrid")})` : ""}
                      </Badge>
                    )}
                    {preview.metaClasse && (
                      <Badge variant="secondary" className="rounded-full">
                        {t("importMetaClasse")} : {preview.metaClasse}
                      </Badge>
                    )}
                    {preview.metaAnnee && (
                      <Badge variant="secondary" className="rounded-full">
                        {t("importMetaAnnee")} : {preview.metaAnnee}
                      </Badge>
                    )}
                  </div>

                  {/* Avertissements globaux */}
                  {preview.warnings.length > 0 && (
                    <div className="rounded-xl border border-yellow-300/50 bg-yellow-50/60 dark:bg-yellow-900/10 px-3 py-2 text-xs space-y-1">
                      {preview.warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 text-yellow-800 dark:text-yellow-200">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Matières auto-créées */}
                  {preview.matieresACreer.length > 0 && (
                    <div className="rounded-xl border border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-900/10 px-3 py-2">
                      <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200 mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("importMatieresCreated")} ({preview.matieresACreer.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.matieresACreer.map((m) => (
                          <Badge key={m.key} className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                            {m.nom} → {m.code}{m.niveau ? ` (niv. ${m.niveau})` : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conflits */}
                  {preview.conflits.length > 0 && (
                    <div className="rounded-xl border border-red-300/50 bg-red-50/60 dark:bg-red-900/10 px-3 py-2">
                      <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1.5 flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5" />
                        {t("importConflicts")} ({preview.conflits.length})
                      </p>
                      <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5">
                        {preview.conflits.slice(0, 10).map((c, i) => (
                          <li key={i}>• {c.message}</li>
                        ))}
                        {preview.conflits.length > 10 && (
                          <li className="text-muted-foreground">… +{preview.conflits.length - 10}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Totaux par jour */}
                  {preview.totauxParJour.length > 0 && (
                    <div className="rounded-xl border border-border px-3 py-2">
                      <p className="text-xs font-medium mb-1.5">{t("importDailyTotals")}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {preview.totauxParJour.map((d) => (
                          <span
                            key={d.jour}
                            className={cn(
                              "rounded-full px-2 py-0.5",
                              d.depasse
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {JOUR_LABELS[d.jour]} : {minutesToHhMm(d.minutes)}
                            {d.depasse && " ⚠"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comparaison avec l'existant */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="rounded-full bg-muted">{t("importUnchanged")}: {preview.comparaison.inchanges}</Badge>
                    <Badge className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{t("importAdded")}: {preview.comparaison.ajoutes}</Badge>
                    <Badge variant="secondary" className="rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">{t("importRemoved")}: {preview.comparaison.supprimes}</Badge>
                  </div>

                  {/* Tableau des créneaux */}
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium">{t("day")}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t("startTime")}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t("endTime")}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t("subject")}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t("teacher")}</th>
                            <th className="text-left px-2 py-1.5 font-medium">{t("room")}</th>
                            <th className="text-center px-2 py-1.5 font-medium">OK</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {preview.creneaux.slice(0, 50).map((c, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="px-2 py-1.5">{JOUR_LABELS[c.jour]}</td>
                              <td className="px-2 py-1.5">{c.heureDebut}</td>
                              <td className="px-2 py-1.5">{c.heureFin || "—"}</td>
                              <td className="px-2 py-1.5">
                                {c.matiereNom}
                                {c.isEvaluation && <Badge className="ml-1 rounded-full bg-accent/10 text-accent text-[10px]">Éval</Badge>}
                              </td>
                              <td className="px-2 py-1.5 text-muted-foreground">{c.enseignantNom ?? "—"}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{c.salle ?? "—"}</td>
                              <td className="px-2 py-1.5 text-center">
                                {c.statut === "ok" && <CheckCircle2 className="h-3.5 w-3.5 inline text-emerald-600" />}
                                {c.statut === "warning" && <AlertTriangle className="h-3.5 w-3.5 inline text-yellow-500" />}
                                {c.statut === "error" && <XCircle className="h-3.5 w-3.5 inline text-red-600" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {preview.creneaux.length > 50 && (
                      <p className="text-[11px] text-muted-foreground px-2 py-1.5 text-center">
                        … +{preview.creneaux.length - 50} {t("importMoreRows")}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={handleClose} disabled={applying} className="rounded-xl">{t("cancel")}</Button>
                    <Button
                      onClick={handleApply}
                      disabled={!canApply || applying}
                      className="gap-2 rounded-xl"
                    >
                      {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {t("importApply")}
                    </Button>
                  </div>
                  {!canApply && preview.creneaux.length > 0 && (
                    <p className="text-xs text-center text-muted-foreground">{t("importApplyHint")}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  label, value, icon, tone,
}: {
  label: string; value: number; icon: React.ReactNode;
  tone: "info" | "success" | "warning" | "error";
}) {
  const toneClass = {
    info: "text-[#0369a1] bg-[#0ea5e9]/10",
    success: "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300",
    warning: "text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-300",
    error: "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", toneClass)}>{icon}</span>
        {label}
      </div>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}
