"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface RegleAppreciation {
  id: string;
  contexte: string;
  seuilMin: number;
  seuilMax: number;
  libelle: string;
  ordre: number;
}

const CONTEXT_VALUES = ["NOTE_MATIERE", "BULLETIN_PERIODE", "BULLETIN_ANNUEL", "ABSENCE"] as const;

export function ReglesAppreciationManager({ regles: initialRegles }: { regles: RegleAppreciation[] }) {
  const t = useTranslations("appreciations");
  const tCommon = useTranslations("common");
  const [regles, setRegles] = useState(initialRegles);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RegleAppreciation | null>(null);

  // Détecte un chevauchement de plage avec une autre règle du même contexte
  function overlaps(candidate: RegleAppreciation): boolean {
    return regles.some(
      (r) =>
        r.id !== candidate.id &&
        r.contexte === candidate.contexte &&
        candidate.seuilMin <= r.seuilMax &&
        candidate.seuilMax >= r.seuilMin
    );
  }

  function addNew() {
    setEditing({
      id: "",
      contexte: "NOTE_MATIERE",
      seuilMin: 0,
      seuilMax: 10,
      libelle: "",
      ordre: regles.length,
    });
  }

  async function save() {
    if (!editing) return;
    if (editing.seuilMin > editing.seuilMax) {
      toast.error(t("error"));
      return;
    }
    if (overlaps(editing)) {
      toast.error(t("overlapWarning"));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/parametres/regles-appreciation", {
          method: editing.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? t("error"));
        }
        const saved = await res.json();
        if (editing.id) {
          setRegles((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
        } else {
          setRegles((prev) => [...prev, saved]);
        }
        setEditing(null);
        toast.success(t("saved"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  async function remove(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/parametres/regles-appreciation?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setRegles((prev) => prev.filter((r) => r.id !== id));
        toast.success(t("deleted"));
      } catch {
        toast.error(t("deleteError"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <Button size="sm" onClick={addNew} className="gap-2">
            <Plus className="h-4 w-4" /> {tCommon("add")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("context")}</Label>
                <Select value={editing.contexte} onValueChange={(v) => setEditing({ ...editing, contexte: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTEXT_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>{t(`contexts.${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("minThreshold")}</Label>
                <Input
                  type="number" step="0.5" className="h-8"
                  value={editing.seuilMin}
                  onChange={(e) => setEditing({ ...editing, seuilMin: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("maxThreshold")}</Label>
                <Input
                  type="number" step="0.5" className="h-8"
                  value={editing.seuilMax}
                  onChange={(e) => setEditing({ ...editing, seuilMax: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("order")}</Label>
                <Input
                  type="number" className="h-8"
                  value={editing.ordre}
                  onChange={(e) => setEditing({ ...editing, ordre: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("label")}</Label>
              <Input
                placeholder={t("labelPlaceholder")}
                value={editing.libelle}
                onChange={(e) => setEditing({ ...editing, libelle: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>{tCommon("cancel")}</Button>
              <Button size="sm" onClick={save} disabled={isPending || !editing.libelle} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {tCommon("save")}
              </Button>
            </div>
          </div>
        )}

        {regles.length === 0 && !editing ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t("empty")}
          </div>
        ) : (
          <div className="space-y-2">
            {CONTEXT_VALUES.map((ctx) => {
              const ctxRegles = regles.filter((r) => r.contexte === ctx).sort((a, b) => a.seuilMin - b.seuilMin);
              if (ctxRegles.length === 0) return null;
              return (
                <div key={ctx} className="space-y-1">
                  <Badge variant="secondary" className="text-xs">{t(`contexts.${ctx}`)}</Badge>
                  <div className="flex flex-wrap gap-2 pl-2">
                    {ctxRegles.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground text-xs">{r.seuilMin}–{r.seuilMax}</span>
                        <span className="font-medium">{r.libelle}</span>
                        <button onClick={() => remove(r.id)} className="text-destructive hover:text-red-700">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
