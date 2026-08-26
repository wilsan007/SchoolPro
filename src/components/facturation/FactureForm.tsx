"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, Sparkles, Calendar } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createFacture, type FactureFormData } from "@/lib/actions/facture";
import { StudentSearch } from "./StudentSearch";
import { useTranslations } from "next-intl";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface EleveOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: { id: string; nom: string } | null;
}

interface ClasseOption {
  id: string;
  nom: string;
}

const FormSchema = z.object({
  eleveId: z.string().min(1, "formErrStudent"),
  libelle: z.string().min(1, "formErrLabel"),
  montant: z.number().min(0.01, "formErrAmount"),
  echeance: z.string().optional(),
});

// Mois scolaires (Septembre à Juin = 10 mois)
const MOIS_SCOLAIRES = [
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
];

const TYPES_FACTURE = [
  { value: "MENSUALITE", labelKey: "typeMensualite" },
  { value: "INSCRIPTION", labelKey: "typeInscription" },
  { value: "RENOUVELLEMENT", labelKey: "typeRenouvellement" },
  { value: "CANTINE", labelKey: "typeCantine" },
  { value: "TRANSPORT", labelKey: "typeTransport" },
  { value: "LIBRE", labelKey: "typeLibre" },
];

export function FactureForm({
  eleves,
  classes,
  eleveIdPreselected,
  hierarchie,
}: {
  eleves: EleveOption[];
  classes: ClasseOption[];
  eleveIdPreselected?: string;
  hierarchie?: ClassesHierarchie;
}) {
  const t = useTranslations("facturation");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<FactureFormData>({
    eleveId: eleveIdPreselected ?? "",
    libelle: "",
    montant: 0,
    devise: "DJF",
    echeance: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedClasseId, setSelectedClasseId] = useState("");
  const [typeFacture, setTypeFacture] = useState("MENSUALITE");
  const [moisSelectionne, setMoisSelectionne] = useState("");
  const [tarifAuto, setTarifAuto] = useState<{ found: boolean; montant: number; libelleAuto: string; devise: string; message?: string } | null>(null);
  const [loadingTarif, setLoadingTarif] = useState(false);

  const updateField = useCallback(function updateField<K extends keyof FactureFormData>(field: K, value: FactureFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  useEffect(() => {
    if (eleveIdPreselected) {
      const eleve = eleves.find((e) => e.id === eleveIdPreselected);
      if (eleve?.classe?.id) setSelectedClasseId(eleve.classe.id);
    }
  }, [eleveIdPreselected, eleves]);

  const filteredEleves = useMemo(() => {
    if (!selectedClasseId) return eleves;
    return eleves.filter((e) => e.classe?.id === selectedClasseId);
  }, [eleves, selectedClasseId]);

  // Récupérer automatiquement le tarif quand la classe et le type sont sélectionnés
  useEffect(() => {
    if (!selectedClasseId || typeFacture === "LIBRE") {
      setTarifAuto(null);
      return;
    }
    setLoadingTarif(true);
    fetch(`/api/facturation/tarif?classeId=${selectedClasseId}&type=${typeFacture}`)
      .then((res) => res.json())
      .then((data) => {
        setTarifAuto(data);
        if (data.found) {
          // Construire le libellé avec le mois si mensualité
          let libelle = data.libelleAuto;
          if (typeFacture === "MENSUALITE" && moisSelectionne) {
            const moisLabel = MOIS_SCOLAIRES.find((m) => m.value === moisSelectionne)?.label ?? "";
            libelle = `Scolarité ${moisLabel}`;
          }
          updateField("montant", data.montant);
          updateField("libelle", libelle);
        }
      })
      .catch(() => setTarifAuto(null))
      .finally(() => setLoadingTarif(false));
  }, [selectedClasseId, typeFacture, moisSelectionne, updateField]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        next[issue.path[0]] = t(issue.message);
      });
      setErrors(next);
      toast.error(t("formErrors"));
      return;
    }

    setIsPending(true);
    try {
      const result = await createFacture(form);
      toast.success(t("formCreated"));
      router.push(`/facturation/${result.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  const inputClass = (field: string) => cn("h-10", errors[field] && "border-destructive");

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
          <Link href="/facturation">
            <ArrowLeft className="h-4 w-4" />
            {t("formBack")}
          </Link>
        </Button>
        <Button type="submit" size="sm" className="gap-2 w-full sm:w-auto" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("formCreate")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("formNewInvoice")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Type de facture ── */}
          <div className="space-y-1.5">
            <Label>{t("formInvoiceType")}</Label>
            <div className="flex flex-wrap gap-2">
              {TYPES_FACTURE.map((tf) => (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTypeFacture(tf.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    typeFacture === tf.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background hover:border-primary/30"
                  )}
                >
                  {t(tf.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Sélection classe + élève ── */}
          <div className="space-y-1.5">
            <Label htmlFor="eleveId">{t("formStudent")}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className={cn("sm:col-span-1", classes.length === 0 && "hidden")}>
                <select
                  id="classeFilter"
                  value={selectedClasseId}
                  onChange={(e) => {
                    setSelectedClasseId(e.target.value);
                    updateField("eleveId", "");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{t("allClasses")}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <StudentSearch
                  students={filteredEleves}
                  value={form.eleveId}
                  onChange={(id) => updateField("eleveId", id)}
                  placeholder={t("studentSearchPlaceholder")}
                  emptyMessage={t("noStudentFound")}
                  className={cn(errors.eleveId && "[&_input]:border-destructive")}
                />
              </div>
            </div>
            {errors.eleveId && <p className="text-xs text-destructive">{errors.eleveId}</p>}
          </div>

          {/* ── Sélection du mois (pour mensualité) ── */}
          {typeFacture === "MENSUALITE" && (
            <div className="space-y-1.5">
              <Label htmlFor="mois" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {t("formMonth")}
              </Label>
              <select
                id="mois"
                value={moisSelectionne}
                onChange={(e) => setMoisSelectionne(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t("formSelectMonth")}</option>
                {MOIS_SCOLAIRES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Indicateur tarif automatique ── */}
          {loadingTarif && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("formLoadingTarif")}
            </div>
          )}
          {tarifAuto && !tarifAuto.found && !loadingTarif && typeFacture !== "LIBRE" && (
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              {tarifAuto.message ?? t("formNoTarif")}
            </div>
          )}
          {tarifAuto?.found && typeFacture !== "LIBRE" && (
            <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              {t("formTarifFound", { montant: tarifAuto.montant.toLocaleString(), devise: tarifAuto.devise })}
            </div>
          )}

          {/* ── Libellé ── */}
          <div className="space-y-1.5">
            <Label htmlFor="libelle">{t("formLabel")}</Label>
            <Input
              id="libelle"
              placeholder={t("formLabelPlaceholder")}
              value={form.libelle}
              onChange={(e) => updateField("libelle", e.target.value)}
              className={inputClass("libelle")}
            />
            {errors.libelle && <p className="text-xs text-destructive">{errors.libelle}</p>}
          </div>

          {/* ── Montant + Échéance ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="montant">{t("formAmount")}</Label>
              <Input
                id="montant"
                type="number"
                min="0"
                step="0.01"
                value={form.montant || ""}
                onChange={(e) => updateField("montant", parseFloat(e.target.value) || 0)}
                className={inputClass("montant")}
              />
              {errors.montant && <p className="text-xs text-destructive">{errors.montant}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="echeance">{t("formDueDate")}</Label>
              <Input
                id="echeance"
                type="date"
                value={form.echeance ?? ""}
                onChange={(e) => updateField("echeance", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
