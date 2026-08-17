"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: { id: string; nom: string; prenom: string; matricule: string; dateNaissance: Date | null; photoUrl?: string | null }[];
}

export function CartesScolairesForm({ classes }: { classes: Classe[] }) {
  const t = useTranslations("eleves");
  const [classeId, setClasseId] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handlePrint() {
    if (!classeId) {
      toast.error(t("cardsSelectErr"));
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch(`/api/eleves/cartes-scolaires?classeId=${classeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(data.html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
      }
      toast.success(t("cardsGenerated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("cardsError"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("cardsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label>{t("cardsClass")}</Label>
          <Select value={classeId} onValueChange={setClasseId}>
            <SelectTrigger><SelectValue placeholder={t("cardsSelectClass")} /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nom} ({c.niveau})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={handlePrint} disabled={!classeId || generating} className="gap-2 w-full sm:w-auto">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {t("cardsPrint")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
