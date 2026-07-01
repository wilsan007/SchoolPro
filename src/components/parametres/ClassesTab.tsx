"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClasse, deleteClasse, type ClasseFormData } from "@/lib/actions/parametres";

interface ClasseItem {
  id: string;
  nom: string;
  niveau: string;
  filiere: string | null;
  effectifMax: number;
  annee: string;
  _count: { eleves: number };
  profPrincipal: { user: { name: string } } | null;
}

export function ClassesTab({ classes, canManage }: { classes: ClasseItem[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<ClasseFormData>({
    nom: "",
    niveau: "",
    filiere: "",
    effectifMax: 40,
    annee: "2025-2026",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsPending(true);
    try {
      await createClasse(form);
      toast.success("Classe créée");
      setShowForm(false);
      setForm({ nom: "", niveau: "", filiere: "", effectifMax: 40, annee: "2025-2026" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette classe ?")) return;
    try {
      await deleteClasse(id);
      toast.success("Classe supprimée");
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
            Ajouter une classe
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nouvelle classe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nom">Nom *</Label>
                <Input id="nom" placeholder="Ex: 6ème A" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="niveau">Niveau *</Label>
                <Input id="niveau" placeholder="Ex: 6ème" value={form.niveau} onChange={(e) => setForm({ ...form, niveau: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filiere">Filière</Label>
                <Input id="filiere" placeholder="Ex: Scientifique" value={form.filiere ?? ""} onChange={(e) => setForm({ ...form, filiere: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="effectifMax">Effectif max</Label>
                <Input id="effectifMax" type="number" min="1" value={form.effectifMax}
                  onChange={(e) => setForm({ ...form, effectifMax: parseInt(e.target.value) || 40 })} />
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
                  <th className="text-left px-4 py-3 font-medium">Classe</th>
                  <th className="text-left px-4 py-3 font-medium">Niveau</th>
                  <th className="text-left px-4 py-3 font-medium">Filière</th>
                  <th className="text-right px-4 py-3 font-medium">Élèves</th>
                  <th className="text-right px-4 py-3 font-medium">Max</th>
                  <th className="text-left px-4 py-3 font-medium">Prof. principal</th>
                  <th className="text-left px-4 py-3 font-medium">Année</th>
                  {canManage && <th className="text-right px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Aucune classe</td></tr>
                ) : (
                  classes.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.nom}</td>
                      <td className="px-4 py-3">{c.niveau}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.filiere ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="info">{c._count.eleves}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{c.effectifMax}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.profPrincipal?.user.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{c.annee}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
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
