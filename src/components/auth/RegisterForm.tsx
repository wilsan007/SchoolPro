"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, School, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { registerTenant, type RegisterFormData } from "@/lib/actions/register";
import { useTranslations } from "next-intl";

const FormSchema = z.object({
  schoolName: z.string().min(2, "Le nom de l'établissement est requis"),
  schoolType: z.enum(["maternelle", "primaire", "college", "lycee", "mixte"]),
  city: z.string().min(1, "La ville est requise"),
  phone: z.string().min(1, "Le téléphone est requis"),
  email: z.string().email("Email invalide"),
  adminFirstName: z.string().min(1, "Le prénom est requis"),
  adminLastName: z.string().min(1, "Le nom est requis"),
  adminEmail: z.string().email("Email administrateur invalide"),
  adminPassword: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
  plan: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]),
});

const schoolTypeKeys: Record<string, string> = {
  maternelle: "typeMaternelle",
  primaire: "typePrimaire",
  college: "typeCollege",
  lycee: "typeLycee",
  mixte: "typeMixte",
};

const planKeys: Record<string, { labelKey: string; price: string; descKey: string }> = {
  STARTER: { labelKey: "planStarter", price: "49€/mois", descKey: "planStarterDesc" },
  PRO: { labelKey: "planPro", price: "149€/mois", descKey: "planProDesc" },
  BUSINESS: { labelKey: "planBusiness", price: "399€/mois", descKey: "planBusinessDesc" },
  ENTERPRISE: { labelKey: "planEnterprise", price: "Sur devis", descKey: "planEnterpriseDesc" },
};

export function RegisterForm() {
  const t = useTranslations("register");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<RegisterFormData>({
    schoolName: "",
    schoolType: "mixte",
    country: "SN",
    city: "",
    address: "",
    phone: "",
    email: "",
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminPassword: "",
    adminPhone: "",
    plan: "STARTER",
    syncInterval: 60,
    syncEnabled: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateField<K extends keyof RegisterFormData>(field: K, value: RegisterFormData[K]) {
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
        next[issue.path[0]] = issue.message;
      });
      setErrors(next);
      toast.error(t("formErrors"));
      return;
    }

    setIsPending(true);
    try {
      await registerTenant(form);
      setSuccess(true);
      toast.success(t("createdSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle>{t("successTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t("successMsg", { name: form.schoolName })}
          </p>
          <p className="text-sm text-muted-foreground text-center">
            {t("successLoginMsg")}
          </p>
          <Button asChild className="w-full gap-2">
            <Link href="/login">
              {t("login")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              {t("backHome")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const inputClass = (field: string) => cn("h-10", errors[field] && "border-destructive");

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            {t("backHome")}
          </Link>
        </Button>
      </div>

      {/* Établissement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            {t("schoolInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="schoolName">{t("schoolName")}</Label>
            <Input
              id="schoolName"
              placeholder={t("schoolNamePlaceholder")}
              value={form.schoolName}
              onChange={(e) => updateField("schoolName", e.target.value)}
              className={inputClass("schoolName")}
            />
            {errors.schoolName && <p className="text-xs text-destructive">{errors.schoolName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schoolType">{t("schoolType")}</Label>
            <select
              id="schoolType"
              value={form.schoolType}
              onChange={(e) => updateField("schoolType", e.target.value as RegisterFormData["schoolType"])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(schoolTypeKeys).map(([key, labelKey]) => (
                <option key={key} value={key}>{t(labelKey)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">{t("city")}</Label>
            <Input
              id="city"
              placeholder={t("cityPlaceholder")}
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
              className={inputClass("city")}
            />
            {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input
              id="phone"
              placeholder={t("phonePlaceholder")}
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className={inputClass("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">{t("schoolEmail")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("schoolEmailPlaceholder")}
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={inputClass("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="address">{t("address")}</Label>
            <Input
              id="address"
              placeholder={t("addressPlaceholder")}
              value={form.address ?? ""}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Administrateur */}
      <Card>
        <CardHeader>
          <CardTitle>{t("adminAccount")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-1.5">
            <Label htmlFor="adminFirstName">{t("firstName")}</Label>
            <Input
              id="adminFirstName"
              value={form.adminFirstName}
              onChange={(e) => updateField("adminFirstName", e.target.value)}
              className={inputClass("adminFirstName")}
            />
            {errors.adminFirstName && <p className="text-xs text-destructive">{errors.adminFirstName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminLastName">{t("lastName")}</Label>
            <Input
              id="adminLastName"
              value={form.adminLastName}
              onChange={(e) => updateField("adminLastName", e.target.value)}
              className={inputClass("adminLastName")}
            />
            {errors.adminLastName && <p className="text-xs text-destructive">{errors.adminLastName}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="adminEmail">{t("adminEmail")}</Label>
            <Input
              id="adminEmail"
              type="email"
              placeholder={t("adminEmailPlaceholder")}
              value={form.adminEmail}
              onChange={(e) => updateField("adminEmail", e.target.value)}
              className={inputClass("adminEmail")}
            />
            {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminPassword">{t("adminPassword")}</Label>
            <Input
              id="adminPassword"
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={form.adminPassword}
              onChange={(e) => updateField("adminPassword", e.target.value)}
              className={inputClass("adminPassword")}
            />
            {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminPhone">{t("adminPhone")}</Label>
            <Input
              id="adminPhone"
              placeholder={t("phonePlaceholder")}
              value={form.adminPhone ?? ""}
              onChange={(e) => updateField("adminPhone", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plan */}
      <Card>
        <CardHeader>
          <CardTitle>{t("choosePlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Object.entries(planKeys).map(([key, plan]) => (
              <button
                key={key}
                type="button"
                onClick={() => updateField("plan", key as RegisterFormData["plan"])}
                className={cn(
                  "text-left p-4 rounded-lg border-2 transition-all",
                  form.plan === key
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50"
                )}
              >
                <p className="font-semibold text-sm">{t(plan.labelKey)}</p>
                <p className="text-lg font-bold mt-1">{plan.price}</p>
                <p className="text-xs text-muted-foreground mt-1">{t(plan.descKey)}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t("trialInfo")}
          </p>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full gap-2" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <School className="h-4 w-4" />}
        {t("submit")}
      </Button>
    </form>
  );
}
