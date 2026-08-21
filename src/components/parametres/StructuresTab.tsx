"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, Trash2, Loader2, GraduationCap } from "lucide-react";

interface Site {
  id: string;
  nom: string;
  code?: string | null;
}

interface Structure {
  id: string;
  type: string;
  nom: string;
  actif: boolean;
  siteId: string | null;
  _count: { classes: number };
}

interface Props {
  sites: Site[];
  canManage: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  MATERNELLE: "Maternelle",
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

const ALL_TYPES = ["MATERNELLE", "PRIMAIRE", "COLLEGE", "LYCEE"] as const;

export function StructuresTab({ canManage }: Props) {
  const [structures, setStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/structures");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStructures(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erreur lors du chargement des structures");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function createStructures(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTypes.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: selectedTypes }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStructures(Array.isArray(data) ? data : []);
      toast.success("Structure(s) créée(s)");
      setSelectedTypes([]);
      setShowForm(false);
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStructure(id: string) {
    if (!confirm("Supprimer cette structure ?")) return;
    try {
      const res = await fetch(`/api/structures?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur");
      }
      setStructures((prev) => prev.filter((s) => s.id !== id));
      toast.success("Structure supprimée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Structures pédagogiques</h3>
          <p className="text-sm text-gray-500">
            {structures.length} structure{structures.length > 1 ? "s" : ""} définie{structures.length > 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Ajouter
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={createStructures} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <p className="text-sm text-gray-600">Sélectionnez les structures à créer :</p>
          <div className="flex gap-2 flex-wrap">
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedTypes.includes(type)
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <Button type="submit" size="sm" disabled={saving || selectedTypes.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Créer ${selectedTypes.length} structure(s)`}
          </Button>
        </form>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {structures.length === 0 && (
          <p className="col-span-full text-center py-8 text-gray-400 text-sm">
            Aucune structure définie.
          </p>
        )}
        {structures.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{s.nom}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  {s.type}
                </Badge>
                <span className="text-xs text-gray-400">
                  {s._count.classes} classe{s._count.classes > 1 ? "s" : ""}
                </span>
                {!s.actif && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-gray-50 text-gray-500">
                    Inactif
                  </Badge>
                )}
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => deleteStructure(s.id)}
                className="text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
