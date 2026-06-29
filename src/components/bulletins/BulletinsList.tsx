"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Edit, Trash2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { BulletinEditorModal } from "./BulletinEditorModal";
import { Badge } from "@/components/ui/badge";

export function BulletinsList({ classes, periodes }: { classes: any[]; periodes: any[] }) {
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedClasse, setSelectedClasse] = useState<string>(classes[0]?.id || "");
  const [selectedPeriode, setSelectedPeriode] = useState<string>(
    periodes.find(p => p.isCurrent)?.id || periodes[0]?.id || ""
  );

  const [editingBulletin, setEditingBulletin] = useState<any>(null);

  const loadBulletins = async () => {
    if (!selectedClasse || !selectedPeriode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/list?classeId=${selectedClasse}&periodeId=${selectedPeriode}`);
      const data = await res.json();
      if (res.ok) {
        setBulletins(data.bulletins || []);
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBulletins();
  }, [selectedClasse, selectedPeriode]);

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce bulletin ?")) return;
    try {
      const res = await fetch(`/api/bulletins/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Bulletin supprimé");
        loadBulletins();
      } else {
        const data = await res.json();
        toast.error(data.error || "Erreur");
      }
    } catch {
      toast.error("Erreur de suppression");
    }
  };

  const handlePrint = (eleveId: string, periodeId: string) => {
    // Dans une version complète, on ouvrirait un PDF ou la page de prévisualisation
    // Pour l'instant on ouvre juste un /api/bulletins/preview?eleveId=... en nouvel onglet
    window.open(`/api/bulletins/preview?eleveId=${eleveId}&periodeId=${periodeId}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Classe</label>
            <Select value={selectedClasse} onValueChange={setSelectedClasse}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Période</label>
            <Select value={selectedPeriode} onValueChange={setSelectedPeriode}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une période" />
              </SelectTrigger>
              <SelectContent>
                {periodes.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Liste des bulletins générés ({bulletins.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : bulletins.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Aucun bulletin généré pour ces critères.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Élève</th>
                    <th className="px-4 py-3 font-medium">Matricule</th>
                    <th className="px-4 py-3 font-medium">Moyenne</th>
                    <th className="px-4 py-3 font-medium">Décision</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bulletins.map(b => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{b.eleve.nom} {b.eleve.prenom}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.eleve.matricule}</td>
                      <td className="px-4 py-3">
                        {b.moyenneGenerale ? (
                          <Badge variant={b.moyenneGenerale >= 10 ? "success" : "destructive"}>
                            {b.moyenneGenerale.toFixed(2)}/20
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic">Non calculée</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.decision ? (
                          <Badge variant="outline">{b.decision}</Badge>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handlePrint(b.eleve.id, b.periodeId)} title="Prévisualiser/Imprimer">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingBulletin(b)} title="Éditer">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(b.id)} title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <BulletinEditorModal
        bulletin={editingBulletin}
        isOpen={!!editingBulletin}
        onClose={() => setEditingBulletin(null)}
        onSuccess={loadBulletins}
      />
    </div>
  );
}
