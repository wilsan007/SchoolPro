"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Printer, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    parents: { parent: { id: string; nom: string; prenom: string; phone: string; email: string | null } }[];
  }[];
}

const MOTIFS_PREDEFINIS = [
  "violence",
  "degradation",
  "insolence",
  "exclusion",
  "absences",
  "travail",
  "autre",
];

interface TenantInfo {
  name: string;
  city: string | null;
  chefEtablissement: string | null;
  currentYear: string;
}

export function ConvocationForm({ classes, tenant, hierarchie }: { classes: Classe[]; tenant: TenantInfo; hierarchie?: ClassesHierarchie }) {
  const t = useTranslations("vieScolaire");
  const libelleNiveau = useLibelleNiveau();
  const [classeId, setClasseId] = useState("");
  const [eleveId, setEleveId] = useState("");
  const [motif, setMotif] = useState(MOTIFS_PREDEFINIS[0]);
  const [motifDetail, setMotifDetail] = useState("");
  const [dateConvocation, setDateConvocation] = useState("");
  const [generating, setGenerating] = useState(false);

  const selectedClasse = classes.find((c) => c.id === classeId);
  const selectedEleve = selectedClasse?.eleves.find((e) => e.id === eleveId);
  const parent = selectedEleve?.parents[0]?.parent;

  async function handlePrint() {
    if (!eleveId) {
      toast.error(t("convocationSelectStudentErr"));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/vie-scolaire/convocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId, motif, motifDetail, dateConvocation }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? t("convocationError"));
      }
      const data = await res.json();
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(data.html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
      }
      toast.success(t("convocationGenerated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("convocationError"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("convocationTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("convocationClass")}</Label>
            <Select value={classeId} onValueChange={(v) => { setClasseId(v); setEleveId(""); }}>
              <SelectTrigger><SelectValue placeholder={t("convocationSelect")} /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom} ({libelleNiveau(c.niveau)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("convocationStudent")}</Label>
            <Select value={eleveId} onValueChange={setEleveId}>
              <SelectTrigger><SelectValue placeholder={t("convocationSelect")} /></SelectTrigger>
              <SelectContent>
                {selectedClasse?.eleves.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nom} {e.prenom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("convocationMotif")}</Label>
            <Select value={motif} onValueChange={setMotif}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIFS_PREDEFINIS.map((m) => (
                  <SelectItem key={m} value={m}>{t(`convocationMotifs.${m}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("convocationDate")}</Label>
            <Input
              type="date"
              value={dateConvocation}
              onChange={(e) => setDateConvocation(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("convocationDetails")}</Label>
          <Textarea
            placeholder={t("convocationDetailsPlaceholder")}
            value={motifDetail}
            onChange={(e) => setMotifDetail(e.target.value)}
            rows={4}
          />
        </div>

        {selectedEleve && parent && (
          <div className="rounded-lg border p-3 bg-muted/30 text-sm">
            <p><strong>{t("convocationParent")}</strong> {parent.prenom} {parent.nom}</p>
            <p><strong>{t("convocationPhone")}</strong> {parent.phone}</p>
            {parent.email && <p><strong>{t("convocationEmail")}</strong> {parent.email}</p>}
          </div>
        )}

        <div className="flex justify-end w-full sm:w-auto">
          <Button onClick={handlePrint} disabled={!eleveId || generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t("convocationPrint")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
