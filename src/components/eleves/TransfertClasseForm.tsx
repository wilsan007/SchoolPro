"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface EleveSimple {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
}

interface ClasseSimple {
  id: string;
  nom: string;
  niveau: string;
  eleves: EleveSimple[];
}

export function TransfertClasseForm({ classes }: { classes: ClasseSimple[] }) {
  const t = useTranslations("eleves");
  const [sourceClasseId, setSourceClasseId] = useState("");
  const [targetClasseId, setTargetClasseId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transferring, setTransferring] = useState(false);

  const sourceClasse = classes.find((c) => c.id === sourceClasseId);
  const targetClasse = classes.find((c) => c.id === targetClasseId);

  function toggleEleve(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (sourceClasse) setSelected(new Set(sourceClasse.eleves.map((e) => e.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleTransfer() {
    if (!targetClasseId || selected.size === 0) {
      toast.error(t("transfertSelectErr"));
      return;
    }
    setTransferring(true);
    try {
      const res = await fetch("/api/eleves/changer-classe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eleveIds: Array.from(selected),
          nouvelleClasseId: targetClasseId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("transfertError"));
      toast.success(t("transfertSuccess", { count: data.count, class: targetClasse?.nom ?? "" }));
      setSelected(new Set());
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("transfertError"));
    } finally {
      setTransferring(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("transfertTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("transfertSource")}</Label>
            <Select value={sourceClasseId} onValueChange={(v) => { setSourceClasseId(v); setSelected(new Set()); }}>
              <SelectTrigger><SelectValue placeholder={t("transfertSelect")} /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom} ({c.niveau})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("transfertTarget")}</Label>
            <Select value={targetClasseId} onValueChange={setTargetClasseId}>
              <SelectTrigger><SelectValue placeholder={t("transfertSelect")} /></SelectTrigger>
              <SelectContent>
                {classes.filter((c) => c.id !== sourceClasseId).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom} ({c.niveau})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sourceClasse && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Label>{t("transfertStudents", { selected: selected.size, total: sourceClasse.eleves.length })}</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>{t("transfertSelectAll")}</Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>{t("transfertDeselectAll")}</Button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm min-w-[400px]">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-8"></th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("transfertColMatricule")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("transfertColName")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceClasse.eleves.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleEleve(e.id)}>
                      <td className="px-3 py-2 border-b">
                        <input type="checkbox" checked={selected.has(e.id)} readOnly className="rounded" />
                      </td>
                      <td className="px-3 py-2 border-b">{e.matricule}</td>
                      <td className="px-3 py-2 border-b font-medium">{e.nom} {e.prenom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleTransfer}
            disabled={!targetClasseId || selected.size === 0 || transferring}
            className="gap-2 w-full sm:w-auto"
          >
            {transferring ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                {t("transfertTransfer")} {selected.size > 0 ? `(${selected.size})` : ""}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
