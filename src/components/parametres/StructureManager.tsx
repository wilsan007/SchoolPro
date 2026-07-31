"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface StructureItem {
  id: string;
  type: string;
  nom: string;
  actif: boolean;
  _count: { classes: number };
}

const TYPE_ICONS: Record<string, string> = {
  MATERNELLE: "🧒",
  PRIMAIRE: "📚",
  COLLEGE: "📘",
  LYCEE: "🎓",
};

const TYPE_ORDER = ["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"];

export function StructureManager({ canManage }: { canManage: boolean }) {
  const t = useTranslations("structures");
  const [structures, setStructures] = useState<StructureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStructures();
  }, []);

  async function fetchStructures() {
    try {
      const res = await fetch("/api/structures");
      if (res.ok) {
        const data = await res.json();
        setStructures(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const existingTypes = new Set(structures.map((s) => s.type));
  const availableTypes = TYPE_ORDER.filter((type) => !existingTypes.has(type));

  async function handleCreate() {
    if (selectedTypes.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: selectedTypes }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }
      const data = await res.json();
      setStructures(data);
      toast.success(t("created"));
      setShowSelector(false);
      setSelectedTypes([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/structures?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur");
      }
      toast.success(t("deleted"));
      fetchStructures();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !==type) : [...prev, type]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t("title")}
          </CardTitle>
          {canManage && availableTypes.length > 0 && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowSelector(!showSelector)}>
              <Plus className="h-4 w-4" />
              {t("addStructure")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {structures.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              {canManage && (
                <Button size="sm" className="gap-2" onClick={() => setShowSelector(true)}>
                  <Plus className="h-4 w-4" />
                  {t("selectStructures")}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {structures.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{TYPE_ICONS[s.type] ?? "📋"}</span>
                    <div>
                      <p className="font-medium text-sm">{s.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {s._count.classes} {t("classes")}
                      </p>
                    </div>
                  </div>
                  {canManage && s._count.classes === 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showSelector && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("selectStructures")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {availableTypes.map((type) => {
                const isSelected = selectedTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="text-3xl">{TYPE_ICONS[type]}</span>
                    <span className="text-sm font-medium">{typeLabel(type, t)}</span>
                    {isSelected && <Badge variant="default" className="text-xs">{t("selected")}</Badge>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="gap-2" onClick={handleCreate} disabled={saving || selectedTypes.length === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("confirm")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowSelector(false); setSelectedTypes([]); }}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function typeLabel(type: string, t: (key: string) => string): string {
  const labels: Record<string, string> = {
    MATERNELLE: t("maternelle"),
    PRIMAIRE: t("primaire"),
    COLLEGE: t("college"),
    LYCEE: t("lycee"),
  };
  return labels[type] ?? type;
}
