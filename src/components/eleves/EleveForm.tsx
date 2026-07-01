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

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface EleveFormData {
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance?: string;
  nationalite?: string;
  sexe: "M" | "F";
  classeId?: string;
  statut?: "ACTIF" | "TRANSFERE" | "DIPLOME" | "EXCLU" | "ABANDONNE";
  groupeSanguin?: string;
  allergies?: string;
  besoinsSpeciaux?: string;
  regime?: "interne" | "demi-pensionnaire" | "externe";
  transport?: string;
  contactUrgenceNom?: string;
  contactUrgencePhone?: string;
  numeroBoursier?: string;
  matricule?: string;
  parentNom?: string;
  parentPrenom?: string;
  parentPhone?: string;
  parentEmail?: string;
  parentProfession?: string;
  parentAdresse?: string;
  parentLien?: "PERE" | "MERE" | "TUTEUR" | "AUTRE";
  parentIsGardien?: boolean;
}

interface EleveFormProps {
  classes: Classe[];
  initialData?: Partial<EleveFormData> & { id?: string };
  submitAction: (data: EleveFormData) => Promise<{ success: boolean; id: string }>;
  submitLabel: string;
  title: string;
  backHref: string;
}

const FormSchema = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().min(1, "Le prénom est requis"),
  dateNaissance: z.string().min(1, "La date de naissance est requise"),
  sexe: z.enum(["M", "F"]),
  classeId: z.string().optional(),
  statut: z.enum(["ACTIF", "TRANSFERE", "DIPLOME", "EXCLU", "ABANDONNE"]).optional(),
  regime: z.enum(["interne", "demi-pensionnaire", "externe"]).optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
});

export function EleveForm({ classes, initialData, submitAction, submitLabel, title, backHref }: EleveFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<EleveFormData>({
    nom: initialData?.nom ?? "",
    prenom: initialData?.prenom ?? "",
    dateNaissance: initialData?.dateNaissance ?? "",
    lieuNaissance: initialData?.lieuNaissance ?? "",
    nationalite: initialData?.nationalite ?? "SN",
    sexe: initialData?.sexe ?? "M",
    classeId: initialData?.classeId ?? "",
    statut: initialData?.statut ?? "ACTIF",
    groupeSanguin: initialData?.groupeSanguin ?? "",
    allergies: initialData?.allergies ?? "",
    besoinsSpeciaux: initialData?.besoinsSpeciaux ?? "",
    regime: initialData?.regime ?? "externe",
    transport: initialData?.transport ?? "",
    contactUrgenceNom: initialData?.contactUrgenceNom ?? "",
    contactUrgencePhone: initialData?.contactUrgencePhone ?? "",
    numeroBoursier: initialData?.numeroBoursier ?? "",
    matricule: initialData?.matricule ?? "",
    parentNom: initialData?.parentNom ?? "",
    parentPrenom: initialData?.parentPrenom ?? "",
    parentPhone: initialData?.parentPhone ?? "",
    parentEmail: initialData?.parentEmail ?? "",
    parentProfession: initialData?.parentProfession ?? "",
    parentAdresse: initialData?.parentAdresse ?? "",
    parentLien: initialData?.parentLien ?? "PERE",
    parentIsGardien: initialData?.parentIsGardien ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateField<K extends keyof EleveFormData>(field: K, value: EleveFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
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
      const result = await submitAction(form);
      toast.success(submitLabel === "Créer" ? "Élève inscrit avec succès" : "Élève mis à jour");
      router.push(`/eleves/${result.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsPending(false);
    }
  }

  const inputClass = (field: string) => cn("h-10", errors[field] && "border-destructive");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>
        <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations de l&apos;élève</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="prenom">Prénom *</Label>
            <Input id="prenom" value={form.prenom} onChange={(e) => updateField("prenom", e.target.value)} className={inputClass("prenom")} />
            {errors.prenom && <p className="text-xs text-destructive">{errors.prenom}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nom">Nom *</Label>
            <Input id="nom" value={form.nom} onChange={(e) => updateField("nom", e.target.value)} className={inputClass("nom")} />
            {errors.nom && <p className="text-xs text-destructive">{errors.nom}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="matricule">Matricule (laisser vide pour auto-générer)</Label>
            <Input id="matricule" value={form.matricule} onChange={(e) => updateField("matricule", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateNaissance">Date de naissance *</Label>
            <Input id="dateNaissance" type="date" value={form.dateNaissance} onChange={(e) => updateField("dateNaissance", e.target.value)} className={inputClass("dateNaissance")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lieuNaissance">Lieu de naissance</Label>
            <Input id="lieuNaissance" value={form.lieuNaissance} onChange={(e) => updateField("lieuNaissance", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nationalite">Nationalité</Label>
            <Input id="nationalite" value={form.nationalite} onChange={(e) => updateField("nationalite", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sexe">Sexe *</Label>
            <select id="sexe" value={form.sexe} onChange={(e) => updateField("sexe", e.target.value as "M" | "F")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="classeId">Classe</Label>
            <select id="classeId" value={form.classeId} onChange={(e) => updateField("classeId", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Non affecté</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.nom} — {c.niveau}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="statut">Statut</Label>
            <select id="statut" value={form.statut} onChange={(e) => updateField("statut", e.target.value as EleveFormData["statut"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="ACTIF">Actif</option>
              <option value="TRANSFERE">Transféré</option>
              <option value="DIPLOME">Diplômé</option>
              <option value="EXCLU">Exclu</option>
              <option value="ABANDONNE">Abandonné</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regime">Régime</Label>
            <select id="regime" value={form.regime} onChange={(e) => updateField("regime", e.target.value as EleveFormData["regime"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="externe">Externe</option>
              <option value="demi-pensionnaire">Demi-pensionnaire</option>
              <option value="interne">Interne</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transport">Transport</Label>
            <Input id="transport" value={form.transport} onChange={(e) => updateField("transport", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="groupeSanguin">Groupe sanguin</Label>
            <Input id="groupeSanguin" value={form.groupeSanguin} onChange={(e) => updateField("groupeSanguin", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactUrgenceNom">Contact d&apos;urgence</Label>
            <Input id="contactUrgenceNom" placeholder="Nom" value={form.contactUrgenceNom} onChange={(e) => updateField("contactUrgenceNom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactUrgencePhone">Téléphone d&apos;urgence</Label>
            <Input id="contactUrgencePhone" value={form.contactUrgencePhone} onChange={(e) => updateField("contactUrgencePhone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numeroBoursier">Numéro boursier</Label>
            <Input id="numeroBoursier" value={form.numeroBoursier} onChange={(e) => updateField("numeroBoursier", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="allergies">Allergies</Label>
            <Input id="allergies" value={form.allergies} onChange={(e) => updateField("allergies", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="besoinsSpeciaux">Besoins spéciaux</Label>
            <Input id="besoinsSpeciaux" value={form.besoinsSpeciaux} onChange={(e) => updateField("besoinsSpeciaux", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parent / Tuteur</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="parentPrenom">Prénom</Label>
            <Input id="parentPrenom" value={form.parentPrenom} onChange={(e) => updateField("parentPrenom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentNom">Nom</Label>
            <Input id="parentNom" value={form.parentNom} onChange={(e) => updateField("parentNom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentLien">Lien de parenté</Label>
            <select id="parentLien" value={form.parentLien} onChange={(e) => updateField("parentLien", e.target.value as EleveFormData["parentLien"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="PERE">Père</option>
              <option value="MERE">Mère</option>
              <option value="TUTEUR">Tuteur</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentPhone">Téléphone</Label>
            <Input id="parentPhone" value={form.parentPhone} onChange={(e) => updateField("parentPhone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentEmail">Email</Label>
            <Input id="parentEmail" type="email" value={form.parentEmail} onChange={(e) => updateField("parentEmail", e.target.value)} className={inputClass("parentEmail")} />
            {errors.parentEmail && <p className="text-xs text-destructive">{errors.parentEmail}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentProfession">Profession</Label>
            <Input id="parentProfession" value={form.parentProfession} onChange={(e) => updateField("parentProfession", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="parentAdresse">Adresse</Label>
            <Input id="parentAdresse" value={form.parentAdresse} onChange={(e) => updateField("parentAdresse", e.target.value)} />
          </div>
          <div className="flex items-center gap-2 md:col-span-2 lg:col-span-3">
            <input
              id="parentIsGardien"
              type="checkbox"
              checked={form.parentIsGardien}
              onChange={(e) => updateField("parentIsGardien", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <Label htmlFor="parentIsGardien" className="font-normal">Tuteur légal principal</Label>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
