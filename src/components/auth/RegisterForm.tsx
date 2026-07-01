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

const schoolTypeLabels: Record<string, string> = {
  maternelle: "Maternelle",
  primaire: "Primaire",
  college: "Collège",
  lycee: "Lycée",
  mixte: "Mixte (tous niveaux)",
};

const planLabels: Record<string, { label: string; price: string; desc: string }> = {
  STARTER: { label: "Starter", price: "49€/mois", desc: "< 200 élèves" },
  PRO: { label: "Pro", price: "149€/mois", desc: "200-1000 élèves" },
  BUSINESS: { label: "Business", price: "399€/mois", desc: "1000-5000 élèves" },
  ENTERPRISE: { label: "Enterprise", price: "Sur devis", desc: "> 5000 élèves" },
};

export function RegisterForm() {
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
      toast.error("Veuillez corriger les erreurs du formulaire");
      return;
    }

    setIsPending(true);
    try {
      await registerTenant(form);
      setSuccess(true);
      toast.success("Votre espace EcolPro a été créé ! Essai gratuit de 30 jours.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue");
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
          <CardTitle>Espace créé avec succès !</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Votre établissement <strong>{form.schoolName}</strong> a été enregistré.
            Vous bénéficiez d&apos;un essai gratuit de 30 jours.
          </p>
          <p className="text-sm text-muted-foreground text-center">
            Connectez-vous avec votre email administrateur pour commencer.
          </p>
          <Button asChild className="w-full gap-2">
            <Link href="/login">
              Se connecter
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Retour à l&apos;accueil
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
            Retour à l&apos;accueil
          </Link>
        </Button>
      </div>

      {/* Établissement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            Informations de l&apos;établissement
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="schoolName">Nom de l&apos;établissement *</Label>
            <Input
              id="schoolName"
              placeholder="Ex: Lycée Mohamed Hashim Ledi"
              value={form.schoolName}
              onChange={(e) => updateField("schoolName", e.target.value)}
              className={inputClass("schoolName")}
            />
            {errors.schoolName && <p className="text-xs text-destructive">{errors.schoolName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schoolType">Type d&apos;établissement *</Label>
            <select
              id="schoolType"
              value={form.schoolType}
              onChange={(e) => updateField("schoolType", e.target.value as RegisterFormData["schoolType"])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(schoolTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">Ville *</Label>
            <Input
              id="city"
              placeholder="Ex: Djibouti"
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
              className={inputClass("city")}
            />
            {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Téléphone *</Label>
            <Input
              id="phone"
              placeholder="+253 ..."
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className={inputClass("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email de l&apos;établissement *</Label>
            <Input
              id="email"
              type="email"
              placeholder="contact@ecole.edu"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={inputClass("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              placeholder="Rue, quartier, BP..."
              value={form.address ?? ""}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Administrateur */}
      <Card>
        <CardHeader>
          <CardTitle>Compte administrateur</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="adminFirstName">Prénom *</Label>
            <Input
              id="adminFirstName"
              value={form.adminFirstName}
              onChange={(e) => updateField("adminFirstName", e.target.value)}
              className={inputClass("adminFirstName")}
            />
            {errors.adminFirstName && <p className="text-xs text-destructive">{errors.adminFirstName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminLastName">Nom *</Label>
            <Input
              id="adminLastName"
              value={form.adminLastName}
              onChange={(e) => updateField("adminLastName", e.target.value)}
              className={inputClass("adminLastName")}
            />
            {errors.adminLastName && <p className="text-xs text-destructive">{errors.adminLastName}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="adminEmail">Email administrateur *</Label>
            <Input
              id="adminEmail"
              type="email"
              placeholder="admin@ecole.edu"
              value={form.adminEmail}
              onChange={(e) => updateField("adminEmail", e.target.value)}
              className={inputClass("adminEmail")}
            />
            {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminPassword">Mot de passe *</Label>
            <Input
              id="adminPassword"
              type="password"
              placeholder="Min. 8 caractères"
              value={form.adminPassword}
              onChange={(e) => updateField("adminPassword", e.target.value)}
              className={inputClass("adminPassword")}
            />
            {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminPhone">Téléphone administrateur</Label>
            <Input
              id="adminPhone"
              placeholder="+253 ..."
              value={form.adminPhone ?? ""}
              onChange={(e) => updateField("adminPhone", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Choisissez votre plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(planLabels).map(([key, plan]) => (
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
                <p className="font-semibold text-sm">{plan.label}</p>
                <p className="text-lg font-bold mt-1">{plan.price}</p>
                <p className="text-xs text-muted-foreground mt-1">{plan.desc}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Vous bénéficiez d&apos;un essai gratuit de 30 jours. Aucune carte bancaire requise.
          </p>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full gap-2" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <School className="h-4 w-4" />}
        Créer mon espace EcolPro
      </Button>
    </form>
  );
}
