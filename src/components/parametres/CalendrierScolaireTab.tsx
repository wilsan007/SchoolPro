"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, CalendarDays, Plane, FileCheck, PartyPopper } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface AnneeScolaire {
  id: string;
  libelle: string;
  dateDebut: Date;
  dateFin: Date;
  isCurrent: boolean;
}

interface Evenement {
  id: string;
  type: string;
  libelle: string;
  dateDebut: string;
  dateFin: string;
}

const TYPES = [
  { value: "VACANCE_SCOLAIRE", icon: Plane, couleur: "text-blue-600" },
  { value: "EXAMEN", icon: FileCheck, couleur: "text-red-600" },
  { value: "JOUR_FERIE", icon: PartyPopper, couleur: "text-amber-600" },
  { value: "AUTRE", icon: CalendarDays, couleur: "text-muted-foreground" },
] as const;

export function CalendrierScolaireTab({
  annees,
  canManage,
}: {
  annees: AnneeScolaire[];
  canManage: boolean;
}) {
  const t = useTranslations("parametres");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : fr;
  const [isPending, startTransition] = useTransition();
  const [anneeActive, setAnneeActive] = useState<string>(
    annees.find((a) => a.isCurrent)?.id ?? annees[0]?.id ?? ""
  );
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "VACANCE_SCOLAIRE",
    libelle: "",
    dateDebut: "",
    dateFin: "",
  });

  const chargerEvenements = useCallback(async () => {
    if (!anneeActive) return;
    setChargement(true);
    try {
      const res = await fetch(`/api/parametres/calendrier-scolaire?anneeId=${anneeActive}`);
      const data = await res.json();
      if (res.ok) {
        setEvenements(data.evenements ?? []);
      }
    } catch {
      // Silencieux : l'erreur est non bloquante.
    } finally {
      setChargement(false);
    }
  }, [anneeActive]);

  useEffect(() => {
    chargerEvenements();
  }, [chargerEvenements]);

  function resetForm() {
    setForm({ type: "VACANCE_SCOLAIRE", libelle: "", dateDebut: "", dateFin: "" });
    setShowForm(false);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/parametres/calendrier-scolaire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anneeId: anneeActive,
            ...form,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("genericError"));
        toast.success(t("evenementCree"));
        resetForm();
        chargerEvenements();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("confirmDeleteEvenement"))) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/parametres/calendrier-scolaire/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? t("genericError"));
        }
        toast.success(t("evenementSupprime"));
        chargerEvenements();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("genericError"));
      }
    });
  }

  if (annees.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">{t("aucuneAnneeCalendrier")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {t("calendrierScolaire")}
          </CardTitle>
          {canManage && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t("ajouterEvenement")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sélecteur d'année */}
          <div className="flex flex-wrap gap-2">
            {annees.map((a) => (
              <button
                key={a.id}
                onClick={() => setAnneeActive(a.id)}
                className={
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                  (anneeActive === a.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted")
                }
              >
                {a.libelle}
                {a.isCurrent && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {t("current")}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Formulaire de création */}
          {showForm && canManage && (
            <form onSubmit={handleCreate} className="space-y-3 rounded-lg border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ev-type">{t("typeEvenement")}</Label>
                  <select
                    id="ev-type"
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    {TYPES.map((ty) => (
                      <option key={ty.value} value={ty.value}>
                        {t(`type_${ty.value}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="ev-libelle">{t("libelleEvenement")}</Label>
                  <Input
                    id="ev-libelle"
                    value={form.libelle}
                    onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                    placeholder={t("libelleEvenementPlaceholder")}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ev-debut">{t("dateDebut")}</Label>
                  <Input
                    id="ev-debut"
                    type="date"
                    value={form.dateDebut}
                    onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ev-fin">{t("dateFin")}</Label>
                  <Input
                    id="ev-fin"
                    type="date"
                    value={form.dateFin}
                    onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetForm}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {t("creer")}
                </Button>
              </div>
            </form>
          )}

          {/* Liste des événements */}
          {chargement ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : evenements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("aucunEvenement")}
            </p>
          ) : (
            <div className="space-y-2">
              {evenements.map((ev) => {
                const typeDef = TYPES.find((t) => t.value === ev.type) ?? TYPES[3];
                const Icon = typeDef.icon;
                return (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={"h-5 w-5 " + typeDef.couleur} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{ev.libelle}</span>
                          <Badge variant="outline" className="text-xs">
                            {t(`type_${ev.type}`)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(ev.dateDebut), "dd/MM/yyyy", { locale: dateLocale })}
                          {" — "}
                          {format(new Date(ev.dateFin), "dd/MM/yyyy", { locale: dateLocale })}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(ev.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
