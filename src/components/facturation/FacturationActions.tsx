"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, AlertTriangle, Ban, Unlock, RefreshCw, Banknote } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  genererMensualites,
  genererFraisInscription,
  detecterFacturesEnRetard,
  envoyerRelance,
  exclureEleve,
  leverExclusion,
  getExclusionsForTenant,
} from "@/lib/actions/facturation-avancee";
import { PaiementParNumero } from "./PaiementParNumero";

interface FactureEnRetard {
  id: string;
  numero: string;
  eleveNom: string;
  matricule: string;
  classe: string;
  montant: number;
  restant: number;
  echeance: Date | null;
  dernierNiveauRelance: number;
}

interface ExclusionItem {
  id: string;
  eleveId: string;
  motif: string;
  details: string | null;
  dateDebut: Date;
  eleve: { nom: string; prenom: string; matricule: string; classe: { nom: string } | null };
  decideePar: { name: string } | null;
}

const MOIS_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export function FacturationActions({ currentYear = "2025-2026" }: { currentYear?: string }) {
  const t = useTranslations("facturation");
  const [isPending, setIsPending] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showRetardModal, setShowRetardModal] = useState(false);
  const [showExcluModal, setShowExcluModal] = useState(false);

  // Génération mensualités
  const [genMois, setGenMois] = useState(new Date().getMonth() + 1);
  const [genAnnee, setGenAnnee] = useState(currentYear);
  const [genCantine, setGenCantine] = useState(false);
  const [genTransport, setGenTransport] = useState(false);

  // Factures en retard
  const [facturesRetard, setFacturesRetard] = useState<FactureEnRetard[]>([]);
  const [loadingRetard, setLoadingRetard] = useState(false);

  // Exclusions
  const [exclusions, setExclusions] = useState<ExclusionItem[]>([]);
  const [loadingExclu, setLoadingExclu] = useState(false);

  async function handleGenererMensualites() {
    setIsPending(true);
    try {
      const result = await genererMensualites({ mois: genMois, annee: genAnnee, inclureCantine: genCantine, inclureTransport: genTransport });
      toast.success(t("invoicesGenerated", { generated: result.generated, skipped: result.skipped }));
      setShowGenModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDetecterRetard() {
    setLoadingRetard(true);
    try {
      const data = await detecterFacturesEnRetard();
      setFacturesRetard(data as FactureEnRetard[]);
      setShowRetardModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoadingRetard(false);
    }
  }

  async function handleRelance(factureId: string, canal: string) {
    try {
      const result = await envoyerRelance(factureId, canal);
      toast.success(t("relanceSent", { niveau: result.niveau, canal }));
      // Rafraîchir la liste
      const data = await detecterFacturesEnRetard();
      setFacturesRetard(data as FactureEnRetard[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  async function handleExclure(eleveNom: string, eleveId: string) {
    const details = prompt(t("exclusionPrompt", { name: eleveNom }), t("exclusionDefaultReason"));
    if (!details) return;
    try {
      await exclureEleve({ eleveId, motif: "NON_PAIEMENT", details });
      toast.success(t("studentExcluded"));
      await loadExclusions();
      const data = await detecterFacturesEnRetard();
      setFacturesRetard(data as FactureEnRetard[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  async function handleLeverExclusion(exclusionId: string) {
    if (!confirm(t("confirmLiftExclusion"))) return;
    try {
      await leverExclusion(exclusionId);
      toast.success(t("exclusionLifted"));
      await loadExclusions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  async function loadExclusions() {
    setLoadingExclu(true);
    try {
      const data = await getExclusionsForTenant();
      setExclusions(data as ExclusionItem[]);
    } catch {
      setExclusions([]);
    } finally {
      setLoadingExclu(false);
    }
  }

  useEffect(() => {
    loadExclusions();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <Button size="sm" variant="default" className="gap-2" onClick={() => setShowGenModal(!showGenModal)}>
          <Zap className="h-4 w-4" />
          {t("generateMonthly")}
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowPayModal(!showPayModal)}>
          <Banknote className="h-4 w-4" />
          {t("payByInvoiceNumber")}
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={handleDetecterRetard} disabled={loadingRetard}>
          {loadingRetard ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          {t("detectOverdue")}
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowExcluModal(!showExcluModal)}>
          <Ban className="h-4 w-4" />
          {t("exclusions")} ({exclusions.length})
        </Button>
      </div>

      {/* Modal: Paiement par numéro */}
      {showPayModal && <PaiementParNumero open={showPayModal} onClose={() => setShowPayModal(false)} />}

      {/* Modal: Génération mensualités */}
      {showGenModal && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {t("generateMonthlyTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="gen-mois">{t("month")}</Label>
                <select id="gen-mois" value={genMois} onChange={(e) => setGenMois(parseInt(e.target.value))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {MOIS_NOMS.map((nom, i) => (
                    <option key={i} value={i + 1}>{nom}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-annee">{t("schoolYear")}</Label>
                <Input id="gen-annee" value={genAnnee} onChange={(e) => setGenAnnee(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={genCantine} onChange={(e) => setGenCantine(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <span className="text-sm">{t("includeCanteen")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={genTransport} onChange={(e) => setGenTransport(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                <span className="text-sm">{t("includeTransport")}</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              {t("generationHint")}
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" onClick={handleGenererMensualites} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {t("generate")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowGenModal(false)}>{t("cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal: Factures en retard */}
      {showRetardModal && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("overdueInvoices")} ({facturesRetard.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {facturesRetard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("noOverdueInvoices")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">{t("number")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("student")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("class")}</th>
                      <th className="text-right px-3 py-2 font-medium">{t("remaining")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("dueDate")}</th>
                      <th className="text-center px-3 py-2 font-medium hidden sm:table-cell">{t("reminders")}</th>
                      <th className="text-right px-3 py-2 font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturesRetard.map((f) => (
                      <tr key={f.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{f.numero}</td>
                        <td className="px-3 py-2">{f.eleveNom}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{f.classe}</td>
                        <td className="px-3 py-2 text-right font-medium text-destructive">{f.restant} DJF</td>
                        <td className="px-3 py-2 text-xs hidden sm:table-cell">{f.echeance ? new Date(f.echeance).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-3 py-2 text-center hidden sm:table-cell">
                          {f.dernierNiveauRelance > 0 ? (
                            <Badge variant="warning">{t("level")} {f.dernierNiveauRelance}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("none")}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => handleRelance(f.id, "sms")}>
                              <RefreshCw className="h-3 w-3" />
                              {t("remind")}
                            </Button>
                            {f.dernierNiveauRelance >= 3 && (
                              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const eleveId = prompt(t("enterStudentId"));
                                  if (eleveId) handleExclure(f.eleveNom, eleveId);
                                }}>
                                <Ban className="h-3 w-3" />
                                {t("exclude")}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setShowRetardModal(false)}>{t("close")}</Button>
          </CardContent>
        </Card>
      )}

      {/* Modal: Exclusions en cours */}
      {showExcluModal && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <Ban className="h-4 w-4" />
              {t("currentExclusions")} ({exclusions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingExclu ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : exclusions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("noExclusions")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">{t("student")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("class")}</th>
                      <th className="text-left px-3 py-2 font-medium">{t("reason")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("details")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("since")}</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">{t("decidedBy")}</th>
                      <th className="text-right px-3 py-2 font-medium">{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exclusions.map((ex) => (
                      <tr key={ex.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{ex.eleve.prenom} {ex.eleve.nom}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{ex.eleve.classe?.nom ?? "—"}</td>
                        <td className="px-3 py-2"><Badge variant="destructive">{ex.motif}</Badge></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate hidden sm:table-cell">{ex.details ?? "—"}</td>
                        <td className="px-3 py-2 text-xs hidden sm:table-cell">{new Date(ex.dateDebut).toLocaleDateString("fr-FR")}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{ex.decideePar?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                            onClick={() => handleLeverExclusion(ex.id)}>
                            <Unlock className="h-3 w-3" />
                            {t("lift")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setShowExcluModal(false)}>{t("close")}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
