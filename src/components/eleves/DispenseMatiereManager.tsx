"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";

interface Dispense {
  id: string;
  matiereId: string;
  matiereNom: string;
  motif: string | null;
}

interface EleveInfo {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
}

interface MatiereInfo {
  id: string;
  nom: string;
  code: string;
}

export function DispenseMatiereManager({
  eleve,
  matieres,
  dispenses: initial,
}: {
  eleve: EleveInfo;
  matieres: MatiereInfo[];
  dispenses: Dispense[];
}) {
  const t = useTranslations("dispenses");
  const tCommon = useTranslations("common");
  const [dispenses, setDispenses] = useState(initial);
  const [matiereId, setMatiereId] = useState("");
  const [motif, setMotif] = useState("");
  const [isPending, startTransition] = useTransition();

  async function addDispense() {
    if (!matiereId) {
      toast.error(t("subject"));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/eleves/dispenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eleveId: eleve.id, matiereId, motif }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setDispenses((prev) => [...prev, data]);
        setMatiereId("");
        setMotif("");
        toast.success(t("saved"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  async function removeDispense(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/eleves/dispenses?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setDispenses((prev) => prev.filter((d) => d.id !== id));
        toast.success(t("deleted"));
      } catch {
        toast.error(t("error"));
      }
    });
  }

  const availableMatieres = matieres.filter((m) => !dispenses.some((d) => d.matiereId === m.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5" />
          {t("title")} — {eleve.prenom} {eleve.nom}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="space-y-2 flex-1">
            <Label>{t("subject")}</Label>
            <Select value={matiereId} onValueChange={setMatiereId}>
              <SelectTrigger><SelectValue placeholder={tCommon("search")} /></SelectTrigger>
              <SelectContent>
                {availableMatieres.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nom} ({m.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1">
            <Label>{t("reason")}</Label>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              placeholder="ex: Dispense médicale"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </div>
          <Button onClick={addDispense} disabled={isPending || !matiereId} size="sm" className="gap-2 w-full sm:w-auto">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {tCommon("add")}
          </Button>
        </div>

        {dispenses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dispenses.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                <Badge variant="secondary" className="text-xs">{d.matiereNom}</Badge>
                {d.motif && <span className="text-xs text-muted-foreground">{d.motif}</span>}
                <button onClick={() => removeDispense(d.id)} className="text-destructive hover:text-red-700">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
