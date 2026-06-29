"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface Props {
  classes: { id: string; nom: string }[];
  matieres: { id: string; nom: string }[];
  periodes: { id: string; nom: string }[];
}

export function CreateEvaluationForm({ classes, matieres, periodes }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    startTransition(async () => {
      try {
        const res = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titre: data.titre,
            type: data.type,
            classeId: data.classeId,
            matiereId: data.matiereId,
            periodeId: data.periodeId,
            date: data.date,
            duree: Number(data.duree),
            coefficient: Number(data.coefficient),
            description: data.description,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erreur de création");
        }

        toast.success("Évaluation planifiée avec succès");
        setOpen(false);
        router.refresh();
      } catch (error: any) {
        toast.error(error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
          <PlusCircle className="h-5 w-5" />
          Ajouter un examen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-white border-none shadow-2xl rounded-xl">
        <DialogHeader className="bg-gray-50 -mx-6 -mt-6 p-6 border-b rounded-t-xl mb-4">
          <DialogTitle className="text-xl text-gray-800 font-bold flex items-center gap-2">
            <PlusCircle className="h-6 w-6 text-blue-600" />
            Ajouter un examen
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">Créez un nouvel examen pour une classe et une matière spécifiques.</p>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800 mb-4">Informations de l'examen</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="titre" className="text-red-500 font-medium">Titre de l'examen *</Label>
                <Input id="titre" name="titre" required placeholder="Controle 1 math test" className="bg-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type" className="text-red-500 font-medium">Type d'examen *</Label>
                <Select name="type" required defaultValue="CONTROLE">
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONTROLE">Contrôle</SelectItem>
                    <SelectItem value="DEVOIR">Devoir</SelectItem>
                    <SelectItem value="EXAMEN">Examen</SelectItem>
                    <SelectItem value="TP">TP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="classeId" className="text-red-500 font-medium">Classe *</Label>
                <Select name="classeId" required>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner une classe" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="matiereId" className="text-red-500 font-medium">Matière *</Label>
                <Select name="matiereId" required>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner une matière" /></SelectTrigger>
                  <SelectContent>
                    {matieres.map(m => <SelectItem key={m.id} value={m.id}>{m.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="periodeId" className="text-red-500 font-medium">Période *</Label>
                <Select name="periodeId" required>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner la période" /></SelectTrigger>
                  <SelectContent>
                    {periodes.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date" className="text-red-500 font-medium">Date et heure *</Label>
                <Input type="datetime-local" id="date" name="date" required className="bg-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duree" className="text-red-500 font-medium">Durée (min) *</Label>
                <Input type="number" id="duree" name="duree" defaultValue={60} required className="bg-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coefficient" className="text-red-500 font-medium">Coefficient *</Label>
                <Input type="number" step="0.1" id="coefficient" name="coefficient" defaultValue={1} required className="bg-white" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description / Instructions</Label>
            <Textarea id="description" name="description" placeholder="Instructions pour les élèves..." className="bg-gray-50" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
