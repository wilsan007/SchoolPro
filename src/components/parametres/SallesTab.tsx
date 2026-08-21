"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, Plus, Trash2, Loader2, Users } from "lucide-react";

interface Site {
  id: string;
  nom: string;
  code?: string | null;
}

interface Salle {
  id: string;
  nom: string;
  capacite: number;
  type: string | null;
  batiment: string | null;
  siteId: string | null;
}

interface Props {
  sites: Site[];
  canManage: boolean;
}

export function SallesTab({ canManage }: Props) {
  const [salles, setSalles] = useState<Salle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("30");
  const [type, setType] = useState("");
  const [batiment, setBatiment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/salles");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSalles(Array.isArray(data) ? data : data.salles ?? []);
    } catch {
      toast.error("Erreur lors du chargement des salles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSalle(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/salles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          capacite: parseInt(capacite) || 30,
          type: type || undefined,
          batiment: batiment || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const salle = await res.json();
      setSalles((prev) => [...prev, salle].sort((a, b) => a.nom.localeCompare(b.nom)));
      toast.success("Salle créée");
      setNom("");
      setType("");
      setBatiment("");
      setCapacite("30");
      setShowForm(false);
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSalle(id: string) {
    if (!confirm("Supprimer cette salle ?")) return;
    try {
      const res = await fetch(`/api/salles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSalles((prev) => prev.filter((s) => s.id !== id));
      toast.success("Salle supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
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
          <h3 className="text-lg font-semibold">Salles</h3>
          <p className="text-sm text-gray-500">
            {salles.length} salle{salles.length > 1 ? "s" : ""} configurée{salles.length > 1 ? "s" : ""}
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
        <form onSubmit={createSalle} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Nom de la salle"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="flex-1 min-w-40 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              required
            />
            <input
              type="number"
              placeholder="Capacité"
              value={capacite}
              onChange={(e) => setCapacite(e.target.value)}
              className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              min={1}
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            >
              <option value="">Type…</option>
              <option value="cours">Salle de cours</option>
              <option value="labo">Laboratoire</option>
              <option value="informatique">Salle informatique</option>
              <option value="sport">Gymnase</option>
            </select>
            <input
              type="text"
              placeholder="Bâtiment"
              value={batiment}
              onChange={(e) => setBatiment(e.target.value)}
              className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Créer"}
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {salles.length === 0 && (
          <p className="col-span-full text-center py-8 text-gray-400 text-sm">
            Aucune salle configurée.
          </p>
        )}
        {salles.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
              <DoorOpen className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{s.nom}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="flex items-center gap-0.5 text-xs text-gray-400">
                  <Users className="w-3 h-3" />
                  {s.capacite}
                </span>
                {s.type && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {s.type}
                  </Badge>
                )}
                {s.batiment && (
                  <span className="text-xs text-gray-400">{s.batiment}</span>
                )}
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => deleteSalle(s.id)}
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
