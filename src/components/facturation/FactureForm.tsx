"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createFacture, type FactureFormData } from "@/lib/actions/facture";
import { useTranslations } from "next-intl";

interface EleveOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: { nom: string } | null;
}

const FormSchema = z.object({
  eleveId: z.string().min(1, "formErrStudent"),
  libelle: z.string().min(1, "formErrLabel"),
  montant: z.number().min(0.01, "formErrAmount"),
  echeance: z.string().optional(),
});

export function FactureForm({ eleves }: { eleves: EleveOption[] }) {
  const t = useTranslations("facturation");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<FactureFormData>({
    eleveId: "",
    libelle: "",
    montant: 0,
    devise: "DJF",
    echeance: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateField<K extends keyof FactureFormData>(field: K, value: FactureFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  }

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
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/facturation">
            <ArrowLeft className="h-4 w-4" />
            {t("formBack")}
          </Link>
        </Button>
        <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("formCreate")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("formNewInvoice")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="eleveId">{t("formStudent")}</Label>
            <select
              id="eleveId"
              value={form.eleveId}
              onChange={(e) => updateField("eleveId", e.target.value)}
              className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring", errors.eleveId && "border-destructive")}
            >
              <option value="">{t("formSelectStudent")}</option>
              {eleves.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.prenom} {el.nom} — {el.matricule} ({el.classe?.nom ?? "N/A"})
                </option>
              ))}
            </select>
            {errors.eleveId && <p className="text-xs text-destructive">{errors.eleveId}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
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
        </CardContent>
      </Card>
    </form>
  );
}
