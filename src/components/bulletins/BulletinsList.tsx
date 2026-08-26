"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Edit, Trash2, Loader2, Download, FileSpreadsheet, Lock, History } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { BulletinEditorModal } from "./BulletinEditorModal";
import { Badge } from "@/components/ui/badge";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BulletinsList({ classes, hierarchie: _hierarchie, periodes, userRole }: { classes: any[]; hierarchie?: ClassesHierarchie; periodes: any[]; userRole?: string }) {
  const t = useTranslations("bulletins");
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedClasse, setSelectedClasse] = useState<string>(classes[0]?.id || "");
  const [selectedPeriode, setSelectedPeriode] = useState<string>(
    periodes.find(p => p.isCurrent)?.id || periodes[0]?.id || ""
  );

  const [editingBulletin, setEditingBulletin] = useState<any>(null);
  const [historyBulletin, setHistoryBulletin] = useState<any>(null);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const isAdmin = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL";
  // `bulletins:write` = éditer ; `bulletins:delete` = supprimer.
  // TEACHER n'a que `bulletins:read` — il consulte mais n'édite pas.
  const canWrite = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL" || userRole === "CLASS_TEACHER";
  const canDelete = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "PRINCIPAL";

  const loadBulletins = useCallback(async () => {
    if (!selectedClasse || !selectedPeriode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/list?classeId=${selectedClasse}&periodeId=${selectedPeriode}`);
      const data = await res.json();
      if (res.ok) {
        setBulletins(data.bulletins || []);
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error(t("errLoadBulletins"));
    } finally {
      setLoading(false);
    }
  }, [selectedClasse, selectedPeriode, t]);

  useEffect(() => {
    loadBulletins();
  }, [loadBulletins]);

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/bulletins/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        loadBulletins();
      } else {
        const data = await res.json();
        toast.error(data.error || t("errDelete"));
      }
    } catch {
      toast.error(t("errDelete"));
    }
  };

  const handlePrint = (eleveId: string, periodeId: string) => {
    window.open(`/bulletin/${eleveId}/${periodeId}`, "_blank");
  };

  const handleExportExcel = async () => {
    if (!selectedClasse || !selectedPeriode) return;
    try {
      const res = await fetch(`/api/bulletins/export-excel?classeId=${selectedClasse}&periodeId=${selectedPeriode}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Bulletin_${selectedClasse}_${selectedPeriode}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t("exportGenerated"));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("errExport"));
      }
    } catch {
      toast.error(t("errExportExcel"));
    }
  };

  async function loadHistory(bulletinId: string) {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/bulletins/${bulletinId}/historique`);
      if (res.ok) {
        const data = await res.json();
        setHistoryEntries(data.historique || []);
      } else {
        toast.error(t("errLoadHistory"));
      }
    } catch {
      toast.error(t("errLoadHistory"));
    } finally {
      setLoadingHistory(false);
    }
  }

  function openHistory(bulletin: any) {
    setHistoryBulletin(bulletin);
    setHistoryEntries([]);
    loadHistory(bulletin.id);
  }

  return (
    <div className="space-y-4 sm:space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">{t("classe")}</label>
            <Select value={selectedClasse} onValueChange={setSelectedClasse}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectClass")} />
              </SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">{t("rank")}</label>
            <Select value={selectedPeriode} onValueChange={setSelectedPeriode}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectPeriod")} />
              </SelectTrigger>
              <SelectContent>
                {periodes.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">{t("listTitle", { count: bulletins.length })}</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportExcel} disabled={loading || bulletins.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            {t("exportExcel")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : bulletins.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{t("noBulletins")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[720px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("student")}</th>
                    <th className="px-4 py-3 font-medium">{t("matricule")}</th>
                    <th className="px-4 py-3 font-medium">{t("moyenne")}</th>
                    <th className="px-4 py-3 font-medium">{t("decision")}</th>
                    <th className="px-4 py-3 font-medium">{t("statutLabel")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bulletins.map(b => {
                    const verrouille = b.verrouille || b.statut === "VERROUILLE" || b.statut === "PUBLIE";
                    const publie = b.statut === "PUBLIE" || b.isPublie;
                    return (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{b.eleve.nom} {b.eleve.prenom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{b.eleve.matricule}</td>
                        <td className="px-4 py-3">
                          {b.moyenneGenerale ? (
                            <Badge variant={b.moyenneGenerale >= 10 ? "success" : "destructive"}>
                              {b.moyenneGenerale.toFixed(2)}/20
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground italic">{t("notCalculated")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {b.decision ? (
                            <Badge variant="outline">{b.decision}</Badge>
                          ) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {publie ? (
                            <Badge variant="success" className="gap-1">
                              <Lock className="h-3 w-3" />
                              {t("published")}
                            </Badge>
                          ) : verrouille ? (
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              {t("locked")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{t("draft")}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handlePrint(b.eleve.id, b.periodeId)} title={t("previewPrint")}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingBulletin(b)}
                                title={verrouille && !isAdmin ? t("lockedEditTooltip") : t("edit")}
                                disabled={verrouille && !isAdmin}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(b.id)}
                                title={verrouille && !isAdmin ? t("lockedDeleteTooltip") : t("delete")}
                                disabled={verrouille && !isAdmin}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openHistory(b)}
                              title={t("history")}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
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

      <BulletinEditorModal
        bulletin={editingBulletin}
        isOpen={!!editingBulletin}
        onClose={() => setEditingBulletin(null)}
        onSuccess={loadBulletins}
        canWrite={canWrite}
      />

      {/* Modal historique */}
      <Dialog open={!!historyBulletin} onOpenChange={(open: boolean) => !open && setHistoryBulletin(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("historyTitle", {
                nom: historyBulletin?.eleve?.nom ?? "",
                prenom: historyBulletin?.eleve?.prenom ?? "",
              })}
            </DialogTitle>
          </DialogHeader>
          {loadingHistory ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historyEntries.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{t("noHistory")}</div>
          ) : (
            <div className="space-y-3 py-2">
              {historyEntries.map((h: any) => (
                <div key={h.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-xs">{h.action}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.auteurNom ?? "—"} ({h.auteurRole ?? "—"})
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="font-medium">{h.champ}</span>
                    {h.ancienneValeur && (
                      <span className="text-muted-foreground"> : {h.ancienneValeur}</span>
                    )}
                    {h.nouvelleValeur && (
                      <span className="text-green-600 dark:text-green-400"> → {h.nouvelleValeur}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
