"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calculator, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function BilanAnnuelManager({ classes }: { classes: any[] }) {
  const [selectedClasse, setSelectedClasse] = useState<string>(classes[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [bilans, setBilans] = useState<any[]>([]);

  const genererBilan = async () => {
    if (!selectedClasse) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/annuel?classeId=${selectedClasse}`);
      const data = await res.json();
      if (res.ok) {
        setBilans(data.bilans || []);
        toast.success("Bilan annuel calculé avec succès");
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error("Erreur lors du calcul du bilan annuel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Génération des Bilans Annuels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Le bilan annuel calcule la moyenne des trimestres précédents pour déterminer la moyenne finale de l'année scolaire et propose une décision d'orientation automatique (Passage ou Redoublement).
          </p>
          <div className="flex gap-4 items-end">
            <div className="flex-1 max-w-sm">
              <label className="text-sm font-medium mb-1.5 block">Sélectionnez la classe</label>
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
            <Button onClick={genererBilan} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Calculer le bilan de la classe
            </Button>
          </div>
        </CardContent>
      </Card>

      {bilans.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Résultats de fin d'année</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.success("Impression des bilans (Fonctionnalité PDF à venir)")}>
              <CheckCircle className="h-4 w-4 text-green-500" />
              Valider et Archiver
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Élève</th>
                    <th className="px-4 py-3 font-medium text-center">Rang Annuel</th>
                    <th className="px-4 py-3 font-medium text-center">Moyenne Annuelle</th>
                    <th className="px-4 py-3 font-medium">Décision Proposée</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bilans.map(b => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{b.nom} {b.prenom}</td>
                      <td className="px-4 py-3 text-center font-semibold">{b.rangAnnuel ? `${b.rangAnnuel}${b.rangAnnuel === 1 ? 'er' : 'ème'}` : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {b.moyenneAnnuelle ? (
                          <Badge variant={b.moyenneAnnuelle >= 10 ? "success" : "destructive"}>
                            {b.moyenneAnnuelle.toFixed(2)}/20
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic">Insuffisant</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={b.decisionProposee === "PASSAGE" ? "default" : "destructive"}>
                          {b.decisionProposee}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
