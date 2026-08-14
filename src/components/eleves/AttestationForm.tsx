"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Printer, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslations } from "next-intl";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: { id: string; nom: string; prenom: string; matricule: string; sexe: "M" | "F"; dateNaissance: Date | null }[];
}

interface TenantInfo {
  name: string;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  chefEtablissement: string | null;
  signatureUrl: string | null;
  cachetUrl: string | null;
  currentYear: string;
}

const HONORIFIQUES = ["attMonsieur", "attMadame", "attMademoiselle"];
const TITRES = ["attScolarite", "attCertificat", "attInscription"];
const HONORIFIQUES_VALUES = ["Monsieur", "Madame", "Mademoiselle"];
const TITRES_VALUES = ["Attestation de scolarité", "Certificat de scolarité", "Attestation d'inscription"];

export function AttestationForm({ classes, tenant }: { classes: Classe[]; tenant: TenantInfo }) {
  const t = useTranslations("eleves");
  const [honorifique, setHonorifique] = useState("Monsieur");
  const [titre, setTitre] = useState("Attestation de scolarité");
  const [niveau, setNiveau] = useState<string>("");
  const [classeId, setClasseId] = useState<string>("");
  const [eleveId, setEleveId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const niveaux = [...new Set(classes.map((c) => c.niveau))].sort();
  const filteredClasses = niveau ? classes.filter((c) => c.niveau === niveau) : classes;
  const selectedClasse = filteredClasses.find((c) => c.id === classeId);
  const selectedEleve = selectedClasse?.eleves.find((e) => e.id === eleveId);

  async function handlePrint() {
    if (!eleveId) {
      toast.error(t("attSelectStudentErr"));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/eleves/attestation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId, honorifique, titre }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t("genericError"));
      }
      const data = await res.json();
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(data.html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
      }
      toast.success(t("attGenerated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("attGenError"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t(titre === "Attestation de scolarité" ? "attScolarite" : titre === "Certificat de scolarité" ? "attCertificat" : "attInscription")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Honorifique + Titre */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("attHonorific")}</Label>
            <Select value={honorifique} onValueChange={setHonorifique}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HONORIFIQUES.map((h, i) => (
                  <SelectItem key={h} value={HONORIFIQUES_VALUES[i]}>{t(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("attDocType")}</Label>
            <Select value={titre} onValueChange={setTitre}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TITRES.map((tt, i) => (
                  <SelectItem key={tt} value={TITRES_VALUES[i]}>{t(tt)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Niveau → Classe → Élève */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{t("attLevel")}</Label>
            <Select value={niveau} onValueChange={(v) => { setNiveau(v); setClasseId(""); setEleveId(""); }}>
              <SelectTrigger><SelectValue placeholder={t("attLevelAll")} /></SelectTrigger>
              <SelectContent>
                {niveaux.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("attClass")}</Label>
            <Select value={classeId} onValueChange={(v) => { setClasseId(v); setEleveId(""); }}>
              <SelectTrigger><SelectValue placeholder={t("attSelect")} /></SelectTrigger>
              <SelectContent>
                {filteredClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("attStudent")}</Label>
            <Select value={eleveId} onValueChange={setEleveId}>
              <SelectTrigger><SelectValue placeholder={t("attSelect")} /></SelectTrigger>
              <SelectContent>
                {selectedClasse?.eleves.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nom} {e.prenom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Aperçu */}
        {selectedEleve && (
          <div className="rounded-lg border p-4 bg-muted/30">
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">{tenant.name}</p>
              <p className="text-lg font-bold uppercase">{t(titre === "Attestation de scolarité" ? "attScolarite" : titre === "Certificat de scolarité" ? "attCertificat" : "attInscription")}</p>
              <p className="text-sm">
                {t("attBody1", { honorifique, chef: tenant.chefEtablissement ?? "___________", school: tenant.name })}
              </p>
              <p className="text-sm">
                {t("attBody2", { name: `${selectedEleve.nom} ${selectedEleve.prenom}` })}
                {selectedEleve.dateNaissance && (
                  <>{t("attBody2Born", { date: format(new Date(selectedEleve.dateNaissance), "dd/MM/yyyy", { locale: fr }) })}</>
                )}
                {t("attBody2Matricule", { matricule: selectedEleve.matricule })}
              </p>
              <p className="text-sm">
                {t("attBody3", { class: selectedClasse?.nom ?? "", level: selectedClasse?.niveau ?? "" })}
                {t("attBody3Year", { year: tenant.currentYear })}
              </p>
              <p className="text-sm">{t("attBody4")}</p>
              <div className="flex justify-between items-end pt-6">
                <div className="text-left text-xs text-muted-foreground">
                  <p>{t("attMadeIn", { city: tenant.city ?? "________", date: format(new Date(), "dd/MM/yyyy", { locale: fr }) })}</p>
                </div>
                <div className="text-center">
                  {tenant.signatureUrl && (
                    // Signature téléversée par l'établissement : URL arbitraire,
                    // hors des `remotePatterns` de next.config, et rendue dans un
                    // aperçu destiné à l'impression.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tenant.signatureUrl} alt="Signature" className="h-16 object-contain mb-1" />
                  )}
                  <p className="text-xs font-semibold border-t pt-1">{tenant.chefEtablissement ?? t("attDirector")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("attDirectorLabel")}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bouton imprimer */}
        <div className="flex justify-end gap-2">
          <Button onClick={handlePrint} disabled={!eleveId || generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t("attPrint")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
