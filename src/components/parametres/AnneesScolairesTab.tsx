"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, CheckCircle2, Calendar } from "lucide-react";
import {
  createAnneeScolaire,
  activateAnneeScolaire,
  deleteAnneeScolaire,
} from "@/lib/actions/parametres";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface AnneeScolaire {
  id: string;
  libelle: string;
  dateDebut: Date;
  dateFin: Date;
  isCurrent: boolean;
}

interface AnneesScolairesTabProps {
  annees: AnneeScolaire[];
  canManage: boolean;
}

export function AnneesScolairesTab({ annees, canManage }: AnneesScolairesTabProps) {
  const t = useTranslations("parametres");
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    libelle: "",
    dateDebut: "",
    dateFin: "",
  });

  function fmtDate(d: Date) {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function resetForm() {
    setForm({ libelle: "", dateDebut: "", dateFin: "" });
    setShowForm(false);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createAnneeScolaire(form);
        toast.success(t("anneeCreated"));
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  function handleActivate(anneeId: string) {
    startTransition(async () => {
      try {
        await activateAnneeScolaire(anneeId);
        toast.success(t("anneeActivated"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  function handleDelete(anneeId: string) {
    if (!confirm(t("confirmDeleteAnnee"))) return;
    startTransition(async () => {
      try {
        await deleteAnneeScolaire(anneeId);
        toast.success(t("anneeDeleted"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  function suggestLibelle() {
    const currentYear = new Date().getFullYear();
    const next = currentYear + 1;
    setForm((prev) => ({ ...prev, libelle: `${currentYear}-${next}` }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {t("anneesScolaires")}
          </CardTitle>
          {canManage && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t("addAnnee")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {/* Formulaire de création */}
          {showForm && canManage && (
            <form onSubmit={handleCreate} className="mb-4 p-4 border rounded-lg bg-muted/30 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="libelle">{t("anneeLibelle")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="libelle"
                      value={form.libelle}
                      onChange={(e) => setForm((p) => ({ ...p, libelle: e.target.value }))}
                      placeholder="2025-2026"
                      required
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={suggestLibelle}>
                      {t("autoFill")}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dateDebut">{t("anneeStart")}</Label>
                  <Input
                    id="dateDebut"
                    type="date"
                    value={form.dateDebut}
                    onChange={(e) => setForm((p) => ({ ...p, dateDebut: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dateFin">{t("anneeEnd")}</Label>
                  <Input
                    id="dateFin"
                    type="date"
                    value={form.dateFin}
                    onChange={(e) => setForm((p) => ({ ...p, dateFin: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  {t("cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                  {t("create")}
                </Button>
              </div>
            </form>
          )}

          {/* Liste des années */}
          {annees.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {t("noAnnees")}
            </div>
          ) : (
            <div className="space-y-2">
              {annees.map((annee) => (
                <div
                  key={annee.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    annee.isCurrent ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                  )}
                >
                  {/* Badge actif */}
                  <div className="shrink-0">
                    {annee.isCurrent ? (
                      <div className="flex items-center gap-1.5 text-primary text-xs font-medium bg-primary/10 rounded-full px-2.5 py-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("active")}
                      </div>
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Libellé + dates */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{annee.libelle}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(annee.dateDebut)} → {fmtDate(annee.dateFin)}
                    </div>
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!annee.isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivate(annee.id)}
                          disabled={isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {t("activate")}
                        </Button>
                      )}
                      {!annee.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(annee.id)}
                          disabled={isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
