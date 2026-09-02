"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, Sparkles, Calendar, Lock, Plus, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createFacturesCombinees, type FactureBatchItem } from "@/lib/actions/facture";
import { StudentSearch } from "./StudentSearch";
import { useTranslations } from "next-intl";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import type { TypeFacture } from "@prisma/client";
import { EXCLUSIONS, TYPES_MENSUELS, cleUnicite } from "@/lib/domain/facture-unicite";

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

interface ExistingFacture {
  type: TypeFacture;
  mois: string | null;
  statut: string;
  numero: string;
}

const FormSchema = z.object({
  eleveId: z.string().min(1, "formErrStudent"),
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

const TYPES_FACTURE: { value: TypeFacture; labelKey: string; estMensuel: boolean }[] = [
  { value: "MENSUALITE", labelKey: "typeMensualite", estMensuel: true },
  { value: "INSCRIPTION", labelKey: "typeInscription", estMensuel: false },
  { value: "RENOUVELLEMENT", labelKey: "typeRenouvellement", estMensuel: false },
  { value: "CANTINE", labelKey: "typeCantine", estMensuel: true },
  { value: "TRANSPORT", labelKey: "typeTransport", estMensuel: true },
  { value: "LIBRE", labelKey: "typeLibre", estMensuel: false },
];

interface ServiceSelectionne {
  type: TypeFacture;
  mois: string | null;
  libelle: string;
  montant: number;
  devise: string;
}

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
  const [eleveId, setEleveId] = useState(eleveIdPreselected ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedClasseId, setSelectedClasseId] = useState("");
  const [echeance, setEcheance] = useState("");
  // Services sélectionnés pour le batch multi-services
  const [services, setServices] = useState<ServiceSelectionne[]>([]);
  // Factures existantes de l'élève (pour verrouillage UI)
  const [existingFactures, setExistingFactures] = useState<ExistingFacture[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const updateEleve = useCallback(function updateEleve(id: string) {
    setEleveId(id);
    setServices([]);
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

  // Récupérer les factures existantes de l'élève pour verrouiller l'UI
  useEffect(() => {
    if (!eleveId) {
      setExistingFactures([]);
      return;
    }
    setLoadingExisting(true);
    fetch(`/api/facturation/existing?eleveId=${eleveId}`)
      .then((res) => res.json())
      .then((data) => setExistingFactures(data.factures ?? []))
      .catch(() => setExistingFactures([]))
      .finally(() => setLoadingExisting(false));
  }, [eleveId]);

  // Map des factures existantes par clé d'unicité pour verrouillage rapide
  const existingByKey = useMemo(() => {
    const map = new Map<string, ExistingFacture>();
    for (const f of existingFactures) {
      map.set(cleUnicite(f.type, f.mois), f);
    }
    return map;
  }, [existingFactures]);

  // Types exclus mutuellement par les services déjà sélectionnés
  const excludedTypes = useMemo(() => {
    const excluded = new Set<TypeFacture>();
    for (const s of services) {
      const exc = EXCLUSIONS[s.type];
      if (exc) excluded.add(exc);
    }
    return excluded;
  }, [services]);

  function isServiceLocked(type: TypeFacture, mois: string | null): { locked: boolean; facture?: ExistingFacture } {
    const key = cleUnicite(type, mois);
    const existing = existingByKey.get(key);
    if (existing) return { locked: true, facture: existing };
    return { locked: false };
  }

  function addService(type: TypeFacture) {
    if (excludedTypes.has(type)) return;
    const tf = TYPES_FACTURE.find((t) => t.value === type)!;
    const mois = tf.estMensuel ? MOIS_SCOLAIRES[0]?.value ?? null : null;
    const { locked } = isServiceLocked(type, mois);
    if (locked) return;
    // Récupérer le tarif automatiquement
    fetchTarif(type, mois, selectedClasseId).then((tarif) => {
      setServices((prev) => [
        ...prev,
        {
          type,
          mois,
          libelle: tarif?.libelleAuto ?? "",
          montant: tarif?.montant ?? 0,
          devise: tarif?.devise ?? "DJF",
        },
      ]);
    });
  }

  function removeService(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
  }

  function updateService(index: number, patch: Partial<ServiceSelectionne>) {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // Récupère le tarif pour un type + mois + classe
  async function fetchTarif(
    type: TypeFacture,
    mois: string | null,
    classeId: string,
  ): Promise<{ montant: number; libelleAuto: string; devise: string } | null> {
    if (!classeId || type === "LIBRE") return null;
    try {
      const res = await fetch(`/api/facturation/tarif?classeId=${classeId}&type=${type}${mois ? `&mois=${mois}` : ""}`);
      const data = await res.json();
      if (data.found) {
        let libelle = data.libelleAuto;
        if (type === "MENSUALITE" && mois) {
          const moisLabel = MOIS_SCOLAIRES.find((m) => m.value === mois)?.label ?? "";
          libelle = `Scolarité ${moisLabel}`;
        }
        return { montant: data.montant, libelleAuto: libelle, devise: data.devise };
      }
    } catch {
      // ignore
    }
    return null;
  }

  // Recharge le tarif quand le mois change pour un service mensuel
  function onMoisChange(index: number, mois: string) {
    const service = services[index];
    if (!service) return;
    fetchTarif(service.type, mois, selectedClasseId).then((tarif) => {
      updateService(index, {
        mois,
        montant: tarif?.montant ?? service.montant,
        libelle: tarif?.libelleAuto ?? service.libelle,
      });
    });
  }

  const montantTotal = services.reduce((sum, s) => sum + s.montant, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = FormSchema.safeParse({ eleveId });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        next[issue.path[0]] = t(issue.message);
      });
      setErrors(next);
      toast.error(t("formErrors"));
      return;
    }

    if (services.length === 0) {
      toast.error(t("formErrNoService"));
      return;
    }

    setIsPending(true);
    try {
      const items: FactureBatchItem[] = services.map((s) => ({
        eleveId,
        libelle: s.libelle,
        montant: s.montant,
        devise: s.devise,
        echeance: echeance || undefined,
        type: s.type,
        mois: TYPES_MENSUELS.has(s.type) ? s.mois : null,
      }));
      const result = await createFacturesCombinees(items);
      if (result.created.length > 0) {
        toast.success(t("formCreatedBatch", { count: result.created.length }));
      }
      if (result.blocked.length > 0) {
        toast.warning(
          t("formBlockedBatch", { count: result.blocked.length }) +
            " : " +
            result.blocked.map((b) => `${b.type}${b.mois ? ` ${b.mois}` : ""} (${b.raison})`).join(", "),
        );
      }
      if (result.created.length > 0) {
        router.push(`/facturation/${result.created[0].id}`);
        router.refresh();
      }
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
        <Button type="submit" size="sm" className="gap-2 w-full sm:w-auto" disabled={isPending || services.length === 0}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("formCreate")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("formNewInvoice")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    updateEleve("");
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
                  value={eleveId}
                  onChange={updateEleve}
                  placeholder={t("studentSearchPlaceholder")}
                  emptyMessage={t("noStudentFound")}
                  className={cn(errors.eleveId && "[&_input]:border-destructive")}
                />
              </div>
            </div>
            {errors.eleveId && <p className="text-xs text-destructive">{errors.eleveId}</p>}
          </div>

          {/* ── Cartes de services cliquables (multi-sélection) ── */}
          {eleveId && (
            <div className="space-y-2">
              <Label>{t("formInvoiceType")}</Label>
              <div className="flex flex-wrap gap-2">
                {TYPES_FACTURE.map((tf) => {
                  const isExcluded = excludedTypes.has(tf.value);
                  // Vérifier si ce type est déjà verrouillé (pour le mois par défaut)
                  const defaultMois = tf.estMensuel ? MOIS_SCOLAIRES[0]?.value ?? null : null;
                  const { locked, facture } = isServiceLocked(tf.value, defaultMois);
                  const isDisabled = isExcluded || locked || loadingExisting;
                  return (
                    <button
                      key={tf.value}
                      type="button"
                      onClick={() => addService(tf.value)}
                      disabled={isDisabled}
                      title={
                        locked
                          ? `Déjà facturé (${facture?.statut}) — annulez la facture ${facture?.numero} pour recréer`
                          : isExcluded
                          ? `Exclus par ${EXCLUSIONS[tf.value] ?? ""}`
                          : undefined
                      }
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5",
                        isDisabled
                          ? "border-muted bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60"
                          : "border-input bg-background hover:border-primary/30 hover:bg-primary/5",
                      )}
                    >
                      {locked && <Lock className="h-3 w-3" />}
                      {t(tf.labelKey)}
                    </button>
                  );
                })}
              </div>
              {loadingExisting && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("formLoadingExisting")}
                </p>
              )}
            </div>
          )}

          {/* ── Liste des services sélectionnés ── */}
          {services.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("formSelectedServices", { count: services.length })}</Label>
                <span className="text-sm font-semibold">
                  {t("formTotal")}: {montantTotal.toLocaleString()} DJF
                </span>
              </div>
              {services.map((service, index) => {
                const tf = TYPES_FACTURE.find((t) => t.value === service.type)!;
                return (
                  <div key={index} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5 text-primary" />
                        {t(tf.labelKey)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeService(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {tf.estMensuel && (
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {t("formMonth")}
                          </Label>
                          <select
                            value={service.mois ?? ""}
                            onChange={(e) => onMoisChange(index, e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          >
                            {MOIS_SCOLAIRES.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs">{t("formLabel")}</Label>
                        <Input
                          value={service.libelle}
                          onChange={(e) => updateService(index, { libelle: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("formAmount")}</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={service.montant || ""}
                          onChange={(e) => updateService(index, { montant: parseFloat(e.target.value) || 0 })}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Échéance commune ── */}
          <div className="space-y-1.5">
            <Label htmlFor="echeance">{t("formDueDate")}</Label>
            <Input
              id="echeance"
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
