"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { updateEtablissement, type EtablissementFormData } from "@/lib/actions/parametres";

interface EtablissementTabProps {
  etablissement: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    siret: string | null;
    currentYear: string;
    notationMax: number;
    langue: string;
    timezone: string;
    currency: string;
    primaryColor: string | null;
    secondaryColor: string | null;
  };
  canManage: boolean;
}

export function EtablissementTab({ etablissement, canManage }: EtablissementTabProps) {
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<EtablissementFormData>({
    name: etablissement.name,
    address: etablissement.address ?? "",
    city: etablissement.city ?? "",
    country: etablissement.country,
    phone: etablissement.phone ?? "",
    email: etablissement.email ?? "",
    website: etablissement.website ?? "",
    siret: etablissement.siret ?? "",
    currentYear: etablissement.currentYear,
    notationMax: etablissement.notationMax,
    langue: etablissement.langue,
    timezone: etablissement.timezone,
    currency: etablissement.currency,
    primaryColor: etablissement.primaryColor ?? "",
    secondaryColor: etablissement.secondaryColor ?? "",
  });

  function update<K extends keyof EtablissementFormData>(field: K, value: EtablissementFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await updateEtablissement(form);
      toast.success("Paramètres enregistrés");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="name">Nom de l&apos;établissement *</Label>
            <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website">Site web</Label>
            <Input id="website" value={form.website} onChange={(e) => update("website", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="siret">N° d&apos;agrément</Label>
            <Input id="siret" value={form.siret} onChange={(e) => update("siret", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Ville</Label>
            <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Pays</Label>
            <select id="country" value={form.country} onChange={(e) => update("country", e.target.value)} disabled={!canManage}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="SN">Sénégal</option>
              <option value="CI">Côte d&apos;Ivoire</option>
              <option value="DJ">Djibouti</option>
              <option value="ML">Mali</option>
              <option value="BF">Burkina Faso</option>
              <option value="CM">Cameroun</option>
              <option value="FR">France</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration pédagogique</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentYear">Année scolaire</Label>
            <Input id="currentYear" value={form.currentYear} onChange={(e) => update("currentYear", e.target.value)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notationMax">Notation sur</Label>
            <Input id="notationMax" type="number" min="1" max="100" value={form.notationMax}
              onChange={(e) => update("notationMax", parseInt(e.target.value) || 20)} disabled={!canManage} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Devise</Label>
            <select id="currency" value={form.currency} onChange={(e) => update("currency", e.target.value)} disabled={!canManage}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="XOF">FCFA (XOF)</option>
              <option value="EUR">Euro (€)</option>
              <option value="USD">Dollar US ($)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="langue">Langue</Label>
            <select id="langue" value={form.langue} onChange={(e) => update("langue", e.target.value)} disabled={!canManage}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Fuseau horaire</Label>
            <select id="timezone" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} disabled={!canManage}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="Africa/Dakar">Africa/Dakar</option>
              <option value="Africa/Abidjan">Africa/Abidjan</option>
              <option value="Africa/Djibouti">Africa/Djibouti</option>
              <option value="Europe/Paris">Europe/Paris</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}
