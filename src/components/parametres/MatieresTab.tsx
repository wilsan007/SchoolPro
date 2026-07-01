"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createMatiere, deleteMatiere, type MatiereFormData } from "@/lib/actions/parametres";

interface MatiereItem {
  id: string;
  nom: string;
  code: string;
  coefficient: number;
  couleur: string | null;
  niveau: string | null;
}

export function MatieresTab({ matieres, canManage }: { matieres: MatiereItem[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<MatiereFormData>({
    nom: "",
    code: "",
    coefficient: 1,
    couleur: "",
    niveau: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createMatiere(form);
      toast.success("Matière créée");
      setShowForm(false);
      setForm({ nom: "", code: "", coefficient: 1, couleur: "", niveau: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette matière ?")) return;
    try {
      await deleteMatiere(id);
      toast.success("Matière supprimée");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            Ajouter une matière
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nouvelle matière</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nom">Nom *</Label>
                <Input id="nom" placeholder="Ex: Mathématiques" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Code *</Label>
                <Input id="code" placeholder="Ex: MATH" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coefficient">Coefficient</Label>
                <Input id="coefficient" type="number" min="0.5" step="0.5" value={form.coefficient}
                  onChange={(e) => setForm({ ...form, coefficient: parseFloat(e.target.value) || 1 })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="niveau">Niveau concerné</Label>
                <Input id="niveau" placeholder="Laisser vide pour tous" value={form.niveau ?? ""}
                  onChange={(e) => setForm({ ...form, niveau: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="couleur">Couleur (hex)</Label>
                <div className="flex gap-2">
                  <Input id="couleur" placeholder="#3b82f6" value={form.couleur ?? ""}
                    onChange={(e) => setForm({ ...form, couleur: e.target.value })} />
                  {form.couleur && (
                    <div className="h-10 w-10 rounded-md border" style={{ backgroundColor: form.couleur }} />
                  )}
                </div>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Créer
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Matière</th>
                  <th className="text-left px-4 py-3 font-medium">Code</th>
                  <th className="text-right px-4 py-3 font-medium">Coef.</th>
                  <th className="text-left px-4 py-3 font-medium">Niveau</th>
                  <th className="text-left px-4 py-3 font-medium">Couleur</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {matieres.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Aucune matière</td></tr>
                ) : (
                  matieres.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{m.nom}</td>
                      <td className="px-4 py-3 font-mono text-xs">{m.code}</td>
                      <td className="px-4 py-3 text-right">{m.coefficient}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.niveau ?? "Tous"}</td>
                      <td className="px-4 py-3">
                        {m.couleur ? (
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded" style={{ backgroundColor: m.couleur }} />
                            <span className="text-xs font-mono">{m.couleur}</span>
                          </div>
                        ) : "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
