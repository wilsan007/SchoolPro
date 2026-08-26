"use client";

/**
 * Import d'élèves en deux temps : on montre d'abord, on écrit ensuite.
 *
 * L'ancienne version écrivait d'abord et affichait le bilan après coup. Un
 * réimport du même fichier ne se constatait donc qu'une fois les doublons
 * créés — c'est ainsi que 78 fiches en trop sont apparues sans qu'aucun
 * signal ne soit donné.
 *
 * Ici, l'étape « Analyser » ne touche pas la base : elle répond « voilà ce
 * qui se passerait ». L'utilisateur voit chaque ligne, son verdict, et peut
 * changer l'action avant de confirmer.
 */

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  X, MapPin, ArrowLeft, Copy, Ban, RefreshCw, Plus, Undo2, CalendarClock,
  Columns3, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Action = "CREER" | "METTRE_A_JOUR" | "IGNORER";

type Verdict =
  | "NOUVEAU" | "MATRICULE_EXISTANT" | "DOUBLON_IDENTITE" | "DOUBLON_CLASSE"
  | "DOUBLON_APPROCHE" | "DOUBLON_FICHIER" | "ERREUR";

interface LignePlan {
  ligne: number;
  nom: string;
  prenom: string;
  classe: string;
  dateNaissance?: string;
  matricule?: string;
  verdict: Verdict;
  message: string;
  action: Action;
  dateApproximative?: boolean;
  existant?: { id: string; matricule: string; nom: string; prenom: string; classe: string | null; archive: boolean };
}

interface ColonneInferee {
  index: number;
  header: string;
  type: string;
  champCible?: string;
  confianceType: number;
  confianceMapping: number;
  exemples: string[];
  valeursNonVides: number;
  totalLignes: number;
  valeursDistinctes?: string[];
  avertissements?: string[];
}

interface MappingColonnes {
  champs: Record<string, number>;
  colonnes: ColonneInferee[];
  champsManquants: string[];
  champsIncertains: string[];
}

interface PlanImport {
  hash: string;
  lignes: LignePlan[];
  resume: {
    total: number; aCreer: number; aMettreAJour: number;
    aIgnorer: number; doublons: number; erreurs: number;
  };
  dejaImporte?: { date: string; par: string | null };
  classesInconnues: string[];
  mappingColonnes?: MappingColonnes;
  headers?: string[];
}

interface ImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  structuresCreated: number;
  classesCreated: number;
  warnings?: string[];
  /** Identifiant du lot, présent dès qu'au moins une fiche a été créée. */
  importBatchId?: string;
}

interface Site {
  id: string;
  nom: string;
  code?: string | null;
}

const VERDICT_STYLE: Record<Verdict, { label: string; classe: string }> = {
  NOUVEAU: { label: "Nouveau", classe: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  MATRICULE_EXISTANT: { label: "Matricule connu", classe: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  DOUBLON_IDENTITE: { label: "Déjà enregistré", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  DOUBLON_CLASSE: { label: "Homonyme en classe", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  DOUBLON_APPROCHE: { label: "Orthographe proche", classe: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300" },
  DOUBLON_FICHIER: { label: "Répété dans le fichier", classe: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  ERREUR: { label: "Non importable", classe: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

const ACTION_LABEL: Record<Action, string> = {
  CREER: "Créer",
  METTRE_A_JOUR: "Mettre à jour",
  IGNORER: "Ignorer",
};

interface ImportElevesDialogProps {
  onClose: () => void;
  sites?: Site[];
  currentSiteId?: string | null;
  tenantHasSites?: boolean;
}

export function ImportElevesDialog({
  onClose,
  sites = [],
  currentSiteId = null,
  tenantHasSites = false,
}: ImportElevesDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(currentSiteId ?? "");
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Action>>({});
  const [busy, setBusy] = useState<"analyse" | "import" | "annulation" | null>(null);
  const [annule, setAnnule] = useState<{ annulees: number; conservees: number; detailConservees: string[] } | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [seulementProblemes, setSeulementProblemes] = useState(true);
  const [datesConfirmees, setDatesConfirmees] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const t = useTranslations("import");

  const siteBloque = tenantHasSites && sites.length > 0 && !selectedSiteId;

  const actionDe = (l: LignePlan): Action => decisions[l.ligne] ?? l.action;

  const compte = plan
    ? plan.lignes.reduce(
        (acc, l) => {
          acc[actionDe(l)]++;
          return acc;
        },
        { CREER: 0, METTRE_A_JOUR: 0, IGNORER: 0 } as Record<Action, number>
      )
    : { CREER: 0, METTRE_A_JOUR: 0, IGNORER: 0 };

  async function analyser() {
    if (!file) return;
    if (siteBloque) {
      toast.error("Sélectionnez un site avant d'analyser");
      return;
    }
    setBusy("analyse");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (selectedSiteId) fd.append("siteId", selectedSiteId);
      const res = await fetch("/api/import/eleves/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse impossible");
      setPlan(data);
      setDecisions({});
      setDatesConfirmees(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analyse impossible");
    } finally {
      setBusy(null);
    }
  }

  async function confirmer() {
    if (!file || !plan) return;
    setBusy("import");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("hash", plan.hash);
      fd.append("decisions", JSON.stringify(decisions));
      if (datesConfirmees) fd.append("datesConfirmees", "true");
      if (selectedSiteId) fd.append("siteId", selectedSiteId);
      const res = await fetch("/api/import/eleves", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import impossible");
      setResult(data.summary);
      setPlan(null);
      toast.success("Import terminé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setBusy(null);
    }
  }

  async function annulerImport() {
    if (!result?.importBatchId) return;
    setBusy("annulation");
    try {
      const res = await fetch("/api/import/eleves/annuler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importBatchId: result.importBatchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Annulation impossible");
      setAnnule(data);
      toast.success(`${data.annulees} fiche(s) archivée(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Annulation impossible");
    } finally {
      setBusy(null);
    }
  }

  function choisirFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const ext = selected.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      toast.error("Format non pris en charge (.xlsx ou .xls attendu)");
      return;
    }
    setFile(selected);
    setPlan(null);
    setResult(null);
    setAnnule(null);
  }

  // Lignes qui seront réellement écrites et portent une date au 1er janvier.
  // Une ligne ignorée n'a pas à être validée.
  const lignesDateAConfirmer = plan
    ? plan.lignes.filter((l) => l.dateApproximative && actionDe(l) !== "IGNORER")
    : [];
  const validationDatesManquante = lignesDateAConfirmer.length > 0 && !datesConfirmees;

  const lignesAffichees = plan
    ? seulementProblemes
      ? plan.lignes.filter((l) => l.verdict !== "NOUVEAU")
      : plan.lignes
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card
        className={cn("w-full flex flex-col max-h-[90vh]", plan ? "max-w-3xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {plan ? "Vérifier avant d'importer" : "Importer des élèves"}
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* ── Étape 1 : choix du fichier ── */}
          {!plan && !result && (
            <>
              <p className="text-sm text-muted-foreground">
                Le fichier est d&apos;abord analysé. Rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé.
              </p>

              {tenantHasSites && sites.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="importSiteId" className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    Site de rattachement
                  </Label>
                  <select
                    id="importSiteId"
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className={cn(
                      "h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                      !selectedSiteId ? "border-destructive" : "border-input"
                    )}
                  >
                    <option value="">— Sélectionner un site —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.nom}{s.code ? ` (${s.code})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold">Colonnes attendues</p>
                <p className="text-muted-foreground">
                  nom, prénom, classe, <span className="font-medium text-foreground">date de naissance</span>,
                  sexe, matricule, lieu de naissance, nationalité, régime.
                </p>
                <p className="text-muted-foreground">
                  La date de naissance est obligatoire : c&apos;est elle qui permet de distinguer
                  deux homonymes et de reconnaître un élève déjà enregistré.
                </p>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={choisirFichier} />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <p className="text-sm">Cliquez pour choisir un fichier Excel</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Étape 2 : le plan ── */}
          {plan && (
            <>
              {plan.dejaImporte && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs">
                  <Copy className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-300">Ce fichier a déjà été importé</p>
                    <p className="text-amber-800 dark:text-amber-400">
                      Le {new Date(plan.dejaImporte.date).toLocaleString("fr-FR")}
                      {plan.dejaImporte.par ? ` par ${plan.dejaImporte.par}` : ""}. Réimporter mettra
                      les fiches à jour sans les dupliquer.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {[
                  { n: compte.CREER, l: "à créer", i: Plus, c: "text-green-600" },
                  { n: compte.METTRE_A_JOUR, l: "à mettre à jour", i: RefreshCw, c: "text-blue-600" },
                  { n: compte.IGNORER, l: "ignorés", i: Ban, c: "text-muted-foreground" },
                  { n: plan.resume.erreurs, l: "en erreur", i: AlertTriangle, c: "text-destructive" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border p-2.5 text-center">
                    <s.i className={cn("h-4 w-4 mx-auto mb-1", s.c)} />
                    <p className="text-lg font-bold leading-none">{s.n}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.l}</p>
                  </div>
                ))}
              </div>

              {/* ── Mapping des colonnes inféré ── */}
              {plan.mappingColonnes && plan.mappingColonnes.colonnes.length > 0 && (
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowMapping((s) => !s)}
                    className="w-full flex items-center justify-between p-3 text-xs font-medium hover:bg-muted/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Columns3 className="h-4 w-4 text-muted-foreground" />
                      {t("columnMapping.title")}
                      <span className="text-muted-foreground font-normal">
                        — {t("columnMapping.subtitle")}
                      </span>
                      {plan.mappingColonnes.champsManquants.length > 0 && (
                        <span className="ml-1 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-semibold">
                          {plan.mappingColonnes.champsManquants.length} {t("columnMapping.missingRequired")}
                        </span>
                      )}
                      {plan.mappingColonnes.champsIncertains.length > 0 && (
                        <span className="ml-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold">
                          {plan.mappingColonnes.champsIncertains.length} {t("columnMapping.lowConfidence")}
                        </span>
                      )}
                    </span>
                    {showMapping ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {showMapping && (
                    <div className="border-t overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 font-medium">{t("columnMapping.header")}</th>
                            <th className="text-left p-2 font-medium">{t("columnMapping.detectedType")}</th>
                            <th className="text-left p-2 font-medium">{t("columnMapping.mappedTo")}</th>
                            <th className="text-left p-2 font-medium">{t("columnMapping.confidence")}</th>
                            <th className="text-left p-2 font-medium">{t("columnMapping.examples")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {plan.mappingColonnes.colonnes.map((col) => {
                            const confPct = Math.round(col.confianceMapping * 100);
                            const confColor =
                              confPct >= 70 ? "text-green-600" :
                              confPct >= 40 ? "text-amber-600" :
                              "text-muted-foreground";
                            const typeLabel = t(`columnMapping.type${col.type.charAt(0).toUpperCase()}${col.type.slice(1)}`, undefined);
                            const fieldLabel = col.champCible
                              ? t(`columnMapping.field${col.champCible.charAt(0).toUpperCase()}${col.champCible.slice(1)}`, undefined)
                              : t("columnMapping.unmapped");
                            return (
                              <tr key={col.index} className="hover:bg-muted/30">
                                <td className="p-2 font-medium truncate max-w-[160px]">{col.header || `—`}</td>
                                <td className="p-2">
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                                    {typeLabel}
                                  </span>
                                </td>
                                <td className="p-2">
                                  {col.champCible ? (
                                    <span className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                      col.confianceMapping >= 0.7
                                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                    )}>
                                      {fieldLabel}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px]">{t("columnMapping.unmapped")}</span>
                                  )}
                                </td>
                                <td className={cn("p-2 font-mono", confColor)}>
                                  {col.champCible ? `${confPct}%` : "—"}
                                </td>
                                <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                                  {col.exemples.slice(0, 2).join(", ")}
                                  {col.avertissements && col.avertissements.length > 0 && (
                                    <span className="block text-amber-600 dark:text-amber-400 text-[10px] mt-0.5">
                                      ⚠ {col.avertissements[0]}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Dates au 1er janvier : validation explicite exigée. Elles
                  peuvent être exactes, mais c'est la date qu'on saisit quand
                  la vraie est inconnue — et c'est elle qui distingue deux
                  élèves de même nom. */}
              {lignesDateAConfirmer.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <CalendarClock className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                    <div className="text-xs">
                      <p className="font-semibold text-amber-900 dark:text-amber-300">
                        {lignesDateAConfirmer.length} date(s) de naissance au 1er janvier
                      </p>
                      <p className="text-amber-800 dark:text-amber-400">
                        C&apos;est la date saisie par défaut quand la date réelle est inconnue.
                        Vérifiez-les : c&apos;est elle qui permet de distinguer deux élèves
                        de même nom et prénom.
                      </p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-amber-900 dark:text-amber-300">
                          Voir les lignes concernées
                        </summary>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {lignesDateAConfirmer.map((l) => (
                            <span key={l.ligne} className="rounded bg-background border px-1.5 py-0.5">
                              L{l.ligne} · {l.prenom} {l.nom}
                            </span>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-amber-900 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={datesConfirmees}
                      onChange={(e) => setDatesConfirmees(e.target.checked)}
                      className="rounded"
                    />
                    Je confirme que ces dates de naissance sont exactes
                  </label>
                </div>
              )}

              {plan.classesInconnues.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Classes qui seront créées : <span className="font-medium text-foreground">{plan.classesInconnues.join(", ")}</span>
                </p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {lignesAffichees.length} ligne{lignesAffichees.length > 1 ? "s" : ""} affichée{lignesAffichees.length > 1 ? "s" : ""}
                </p>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seulementProblemes}
                    onChange={(e) => setSeulementProblemes(e.target.checked)}
                    className="rounded"
                  />
                  Masquer les nouveaux élèves
                </label>
              </div>

              <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                {lignesAffichees.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Aucun point d&apos;attention — toutes les lignes sont de nouveaux élèves.
                  </p>
                ) : (
                  lignesAffichees.map((l) => {
                    const style = VERDICT_STYLE[l.verdict];
                    const action = actionDe(l);
                    return (
                      <div key={l.ligne} className="p-2.5 flex items-start gap-3 text-xs">
                        <span className="text-muted-foreground w-8 shrink-0 pt-0.5">L{l.ligne}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {l.prenom} {l.nom}
                              {l.classe && <span className="text-muted-foreground font-normal"> · {l.classe}</span>}
                            </span>
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", style.classe)}>
                              {style.label}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">{l.message}</p>
                        </div>
                        {l.verdict !== "ERREUR" && (
                          <select
                            value={action}
                            onChange={(e) =>
                              setDecisions((d) => ({ ...d, [l.ligne]: e.target.value as Action }))
                            }
                            className="h-7 rounded border border-input bg-background px-1.5 text-[11px] shrink-0"
                          >
                            <option value="CREER">{ACTION_LABEL.CREER}</option>
                            {l.existant && <option value="METTRE_A_JOUR">{ACTION_LABEL.METTRE_A_JOUR}</option>}
                            <option value="IGNORER">{ACTION_LABEL.IGNORER}</option>
                          </select>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ── Étape 3 : le résultat ── */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { n: result.created, l: "créés", c: "text-green-600" },
                  { n: result.updated, l: "mis à jour", c: "text-blue-600" },
                  { n: result.skipped, l: "ignorés", c: "text-muted-foreground" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border p-3 text-center">
                    <p className={cn("text-xl font-bold", s.c)}>{s.n}</p>
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </div>
              {(result.structuresCreated > 0 || result.classesCreated > 0) && (
                <div className="rounded-lg border bg-primary/5 p-3 text-xs">
                  {result.classesCreated > 0 && <p>• {result.classesCreated} classe(s) créée(s)</p>}
                  {result.structuresCreated > 0 && <p>• {result.structuresCreated} structure(s) créée(s)</p>}
                </div>
              )}
              {result.warnings && result.warnings.length > 0 && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-orange-800 dark:text-orange-300">{w}</p>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Import terminé.
                </div>
                {/* Filet de sécurité : défaire l'import entier en un geste,
                    plutôt que de retrouver et archiver les fiches une à une. */}
                {result.importBatchId && !annule && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive"
                    onClick={annulerImport}
                    disabled={busy === "annulation"}
                  >
                    {busy === "annulation" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5" />
                    )}
                    Annuler cet import
                  </Button>
                )}
              </div>
              {annule && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs">
                  <p className="font-medium text-amber-900 dark:text-amber-300">
                    Import annulé : {annule.annulees} fiche(s) archivée(s).
                  </p>
                  {annule.conservees > 0 && (
                    <p className="text-amber-800 dark:text-amber-400 mt-1">
                      {annule.conservees} fiche(s) conservée(s) car des données y sont
                      déjà rattachées : {annule.detailConservees.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 justify-between items-center border-t p-4">
          {plan ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPlan(null)}>
              <ArrowLeft className="h-4 w-4" />
              Changer de fichier
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
            {!plan && !result && (
              <Button size="sm" className="gap-2" onClick={analyser} disabled={!file || busy !== null || siteBloque}>
                {busy === "analyse" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Analyser
              </Button>
            )}
            {plan && (
              <Button
                size="sm"
                className="gap-2"
                onClick={confirmer}
                disabled={
                  busy !== null ||
                  compte.CREER + compte.METTRE_A_JOUR === 0 ||
                  validationDatesManquante
                }
                title={
                  validationDatesManquante
                    ? "Confirmez d'abord les dates de naissance signalées"
                    : undefined
                }
              >
                {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmer ({compte.CREER + compte.METTRE_A_JOUR})
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
