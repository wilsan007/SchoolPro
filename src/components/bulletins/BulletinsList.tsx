"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Edit, Trash2, Loader2, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { BulletinEditorModal } from "./BulletinEditorModal";
import { Badge } from "@/components/ui/badge";

export function BulletinsList({ classes, periodes }: { classes: any[]; periodes: any[] }) {
  const t = useTranslations("bulletins");
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedClasse, setSelectedClasse] = useState<string>(classes[0]?.id || "");
  const [selectedPeriode, setSelectedPeriode] = useState<string>(
    periodes.find(p => p.isCurrent)?.id || periodes[0]?.id || ""
  );

  const [editingBulletin, setEditingBulletin] = useState<any>(null);

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

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex gap-4">
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
        <CardHeader className="flex flex-row items-center justify-between">
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
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("student")}</th>
                    <th className="px-4 py-3 font-medium">{t("matricule")}</th>
                    <th className="px-4 py-3 font-medium">{t("moyenne")}</th>
                    <th className="px-4 py-3 font-medium">{t("decision")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bulletins.map(b => (
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
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handlePrint(b.eleve.id, b.periodeId)} title={t("previewPrint")}>
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingBulletin(b)} title={t("edit")}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b.id)} title={t("delete")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
      />
    </div>
  );
}
