"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, Upload, X, User, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface Site {
  id: string;
  nom: string;
  code?: string | null;
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
  photoUrl?: string | null;
}

interface EleveFormProps {
  classes: Classe[];
  sites?: Site[];
  currentSiteId?: string | null;
  tenantHasSites?: boolean;
  initialData?: Partial<EleveFormData> & { id?: string };
  /**
   * L'action peut demander une confirmation plutôt que d'enregistrer : date
   * de naissance suspecte, ou élève de même identité déjà présent. Le
   * formulaire affiche alors la question et rappelle l'action si
   * l'administrateur confirme.
   */
  submitAction: (
    data: EleveFormData,
    confirmations?: { dateNaissance?: boolean; doublon?: boolean }
  ) => Promise<
    | { success: true; id: string }
    | { success: false; confirmation: { code: string; titre: string; message: string } }
  >;
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

export function EleveForm({ classes, sites = [], currentSiteId = null, tenantHasSites = false, initialData, submitAction, submitLabel, title, backHref }: EleveFormProps) {
  const t = useTranslations("eleves");
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
    photoUrl: initialData?.photoUrl ?? null,
  });
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{ code: string; titre: string; message: string } | null>(null);
  const [confirmations, setConfirmations] = useState<{ dateNaissance?: boolean; doublon?: boolean }>({});

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
      toast.error(t("formErrors"));
      return;
    }

    await enregistrer(confirmations);
  }

  /**
   * Enregistre, ou remonte la question posée par le serveur.
   *
   * Les confirmations s'accumulent : une fiche peut déclencher successivement
   * la question sur la date puis celle sur l'homonymie.
   */
  async function enregistrer(confs: { dateNaissance?: boolean; doublon?: boolean }) {
    setIsPending(true);
    try {
      const result = await submitAction(form, confs);
      if (!result.success) {
        setConfirmation(result.confirmation);
        return;
      }
      setConfirmation(null);
      toast.success(submitLabel === "Créer" ? t("enrollSuccess") : t("updateSuccess"));
      router.push(`/eleves/${result.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  function confirmerEtPoursuivre() {
    if (!confirmation) return;
    const suivantes = {
      ...confirmations,
      ...(confirmation.code === "DATE_APPROXIMATIVE" ? { dateNaissance: true } : {}),
      ...(confirmation.code === "DOUBLON_IDENTITE" ? { doublon: true } : {}),
    };
    setConfirmations(suivantes);
    setConfirmation(null);
    enregistrer(suivantes);
  }

  const inputClass = (field: string) => cn("h-10", errors[field] && "border-destructive");

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/eleves/upload-photo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("uploadError"));
      updateField("photoUrl", data.photoUrl);
      toast.success(t("photoUploaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("uploadError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("studentInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Photo upload */}
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
              {form.photoUrl ? (
                <Image src={form.photoUrl} alt={t("studentPhoto")} fill className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-10 h-10 text-gray-300" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-sm rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors w-fit">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? t("uploading") : t("uploadPhoto")}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              </label>
              {form.photoUrl && (
                <button
                  type="button"
                  onClick={() => updateField("photoUrl", null)}
                  className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-600 w-fit"
                >
                  <X className="w-3 h-3" /> {t("removePhoto")}
                </button>
              )}
              <p className="text-xs text-gray-400">{t("photoHint")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="prenom">{t("firstNameRequired")}</Label>
            <Input id="prenom" value={form.prenom} onChange={(e) => updateField("prenom", e.target.value)} className={inputClass("prenom")} />
            {errors.prenom && <p className="text-xs text-destructive">{errors.prenom}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nom">{t("lastNameRequired")}</Label>
            <Input id="nom" value={form.nom} onChange={(e) => updateField("nom", e.target.value)} className={inputClass("nom")} />
            {errors.nom && <p className="text-xs text-destructive">{errors.nom}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="matricule">{t("matriculeHint")}</Label>
            <Input id="matricule" value={form.matricule} onChange={(e) => updateField("matricule", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateNaissance">{t("birthDateRequired")}</Label>
            <Input id="dateNaissance" type="date" value={form.dateNaissance} onChange={(e) => updateField("dateNaissance", e.target.value)} className={inputClass("dateNaissance")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lieuNaissance">{t("birthPlace")}</Label>
            <Input id="lieuNaissance" value={form.lieuNaissance} onChange={(e) => updateField("lieuNaissance", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nationalite">{t("nationality")}</Label>
            <Input id="nationalite" value={form.nationalite} onChange={(e) => updateField("nationalite", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sexe">{t("sexRequired")}</Label>
            <select id="sexe" value={form.sexe} onChange={(e) => updateField("sexe", e.target.value as "M" | "F")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="M">{t("masculin")}</option>
              <option value="F">{t("feminin")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="classeId">{t("classLabel")}</Label>
            <select id="classeId" value={form.classeId} onChange={(e) => updateField("classeId", e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">{t("unassigned")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.nom} — {c.niveau}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="statut">{t("status")}</Label>
            <select id="statut" value={form.statut} onChange={(e) => updateField("statut", e.target.value as EleveFormData["statut"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="ACTIF">{t("statusActive")}</option>
              <option value="TRANSFERE">{t("statusTransferred")}</option>
              <option value="DIPLOME">{t("statusGraduated")}</option>
              <option value="EXCLU">{t("statusExcluded")}</option>
              <option value="ABANDONNE">{t("statusDropped")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regime">{t("regime")}</Label>
            <select id="regime" value={form.regime} onChange={(e) => updateField("regime", e.target.value as EleveFormData["regime"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="externe">{t("external")}</option>
              <option value="demi-pensionnaire">{t("halfBoarding")}</option>
              <option value="interne">{t("boarding")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transport">{t("transport")}</Label>
            <Input id="transport" value={form.transport} onChange={(e) => updateField("transport", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="groupeSanguin">{t("bloodGroup")}</Label>
            <Input id="groupeSanguin" value={form.groupeSanguin} onChange={(e) => updateField("groupeSanguin", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactUrgenceNom">{t("emergencyContact")}</Label>
            <Input id="contactUrgenceNom" placeholder={t("lastName")} value={form.contactUrgenceNom} onChange={(e) => updateField("contactUrgenceNom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactUrgencePhone">{t("emergencyPhone")}</Label>
            <Input id="contactUrgencePhone" value={form.contactUrgencePhone} onChange={(e) => updateField("contactUrgencePhone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numeroBoursier">{t("scholarshipNumber")}</Label>
            <Input id="numeroBoursier" value={form.numeroBoursier} onChange={(e) => updateField("numeroBoursier", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="allergies">{t("allergies")}</Label>
            <Input id="allergies" value={form.allergies} onChange={(e) => updateField("allergies", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="besoinsSpeciaux">{t("specialNeeds")}</Label>
            <Input id="besoinsSpeciaux" value={form.besoinsSpeciaux} onChange={(e) => updateField("besoinsSpeciaux", e.target.value)} />
          </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("parentGuardian")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="parentPrenom">{t("firstName")}</Label>
            <Input id="parentPrenom" value={form.parentPrenom} onChange={(e) => updateField("parentPrenom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentNom">{t("lastName")}</Label>
            <Input id="parentNom" value={form.parentNom} onChange={(e) => updateField("parentNom", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentLien">{t("relationship")}</Label>
            <select id="parentLien" value={form.parentLien} onChange={(e) => updateField("parentLien", e.target.value as EleveFormData["parentLien"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="PERE">{t("father")}</option>
              <option value="MERE">{t("mother")}</option>
              <option value="TUTEUR">{t("guardian")}</option>
              <option value="AUTRE">{t("other")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentPhone">{t("phone")}</Label>
            <Input id="parentPhone" value={form.parentPhone} onChange={(e) => updateField("parentPhone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentEmail">{t("email")}</Label>
            <Input id="parentEmail" type="email" value={form.parentEmail} onChange={(e) => updateField("parentEmail", e.target.value)} className={inputClass("parentEmail")} />
            {errors.parentEmail && <p className="text-xs text-destructive">{errors.parentEmail}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentProfession">{t("profession")}</Label>
            <Input id="parentProfession" value={form.parentProfession} onChange={(e) => updateField("parentProfession", e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label htmlFor="parentAdresse">{t("address")}</Label>
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
            <Label htmlFor="parentIsGardien" className="font-normal">{t("primaryGuardian")}</Label>
          </div>
        </CardContent>
      </Card>

      {/* Point de contrôle avant enregistrement : on expose ce qui est
          suspect et l'administrateur tranche. Ni la date au 1er janvier ni
          l'homonymie ne sont refusées d'office — elles peuvent être exactes. */}
      {confirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmation(null)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
                <div>
                  <h3 className="font-semibold">{confirmation.titre}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{confirmation.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmation(null)}>
                  Corriger
                </Button>
                <Button type="button" size="sm" onClick={confirmerEtPoursuivre} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer et continuer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </form>
  );
}
