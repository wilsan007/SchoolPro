"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, DollarSign } from "lucide-react";
import { useTranslations } from "next-intl";
import { createTarif, deleteTarif, getTarifsForTenant, type TarifFormData } from "@/lib/actions/facturation-avancee";

interface TarifItem {
  id: string;
  niveau: string;
  annee: string;
  mensualite: number;
  fraisInscription: number;
  fraisRenouvellement: number;
  fraisCantine: number | null;
  fraisTransport: number | null;
  devise: string;
  nbMois: number;
  actif: boolean;
}

const NIVEAUX_PREDEFINIS = ["Maternelle", "Primaire", "Collège", "Lycée"];

function formatMoney(amount: number, devise: string) {
  const currency = devise === "XOF" ? "DJF" : devise;
  return new Intl.NumberFormat("fr-DJ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function TarifsTab() {
  const t = useTranslations("parametres");
  const [tarifs, setTarifs] = useState<TarifItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<TarifFormData>({
    niveau: "",
    annee: "2025-2026",
    mensualite: 0,
    fraisInscription: 0,
    fraisRenouvellement: 0,
    fraisCantine: undefined,
    fraisTransport: undefined,
    devise: "DJF",
    nbMois: 10,
    siteId: undefined,
  });

  useEffect(() => {
    loadTarifs();
  }, []);

  async function loadTarifs() {
    try {
      const data = await getTarifsForTenant();
      setTarifs(data as TarifItem[]);
    } catch {
      setTarifs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createTarif(form);
      toast.success(t("tarifCreated"));
      setShowForm(false);
      setForm({ niveau: "", annee: "2025-2026", mensualite: 0, fraisInscription: 0, fraisRenouvellement: 0, fraisCantine: undefined, fraisTransport: undefined, devise: "DJF", nbMois: 10, siteId: undefined });
      await loadTarifs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteTarif"))) return;
    try {
      await deleteTarif(id);
      toast.success(t("tarifDeleted"));
      await loadTarifs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {t("tarifsDescription")}
        </p>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          {t("addTarif")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("newTarif")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="niveau">{t("level")} *</Label>
                <select
                  id="niveau"
                  value={form.niveau}
                  onChange={(e) => setForm({ ...form, niveau: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">{t("select")}</option>
                  {NIVEAUX_PREDEFINIS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="annee">{t("schoolYear")} *</Label>
                <Input id="annee" value={form.annee} onChange={(e) => setForm({ ...form, annee: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nbMois">{t("nbMonths")}</Label>
                <Input id="nbMois" type="number" min="1" max="12" value={form.nbMois}
                  onChange={(e) => setForm({ ...form, nbMois: parseInt(e.target.value) || 10 })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mensualite">{t("monthlyFee")} *</Label>
                <Input id="mensualite" type="number" min="0" step="0.01" value={form.mensualite || ""}
                  onChange={(e) => setForm({ ...form, mensualite: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fraisInscription">{t("inscriptionFee")} *</Label>
                <Input id="fraisInscription" type="number" min="0" step="0.01" value={form.fraisInscription || ""}
                  onChange={(e) => setForm({ ...form, fraisInscription: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fraisRenouvellement">{t("renewalFee")} *</Label>
                <Input id="fraisRenouvellement" type="number" min="0" step="0.01" value={form.fraisRenouvellement || ""}
                  onChange={(e) => setForm({ ...form, fraisRenouvellement: parseFloat(e.target.value) || 0 })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fraisCantine">{t("canteenFee")}</Label>
                <Input id="fraisCantine" type="number" min="0" step="0.01" value={form.fraisCantine ?? ""}
                  onChange={(e) => setForm({ ...form, fraisCantine: parseFloat(e.target.value) || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fraisTransport">{t("transportFee")}</Label>
                <Input id="fraisTransport" type="number" min="0" step="0.01" value={form.fraisTransport ?? ""}
                  onChange={(e) => setForm({ ...form, fraisTransport: parseFloat(e.target.value) || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="devise">{t("currency")}</Label>
                <select id="devise" value={form.devise} onChange={(e) => setForm({ ...form, devise: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="DJF">DJF (Franc Djibouti)</option>
                  <option value="XOF">XOF (Franc CFA)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
              <div className="md:col-span-3 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  {t("create")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : tarifs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("noTarifs")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">{t("level")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("schoolYear")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("monthlyFee")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("inscriptionFee")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("renewalFee")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("canteenFee")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("transportFee")}</th>
                    <th className="text-center px-4 py-3 font-medium">{t("months")}</th>
                    <th className="text-right px-4 py-3 font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tarifs.map((tarif) => (
                    <tr key={tarif.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {tarif.niveau}
                          {!tarif.actif && <Badge variant="secondary">{t("inactive")}</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{tarif.annee}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatMoney(tarif.mensualite, tarif.devise)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(tarif.fraisInscription, tarif.devise)}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(tarif.fraisRenouvellement, tarif.devise)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{tarif.fraisCantine ? formatMoney(tarif.fraisCantine, tarif.devise) : "—"}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{tarif.fraisTransport ? formatMoney(tarif.fraisTransport, tarif.devise) : "—"}</td>
                      <td className="px-4 py-3 text-center">{tarif.nbMois}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(tarif.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
