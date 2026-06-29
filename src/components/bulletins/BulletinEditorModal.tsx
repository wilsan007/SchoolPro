"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BulletinEditorModalProps {
  bulletin: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulletinEditorModal({ bulletin, isOpen, onClose, onSuccess }: BulletinEditorModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    moyenneGenerale: bulletin?.moyenneGenerale ?? "",
    rang: bulletin?.rang ?? "",
    appreciation: bulletin?.appreciation ?? "",
    decision: bulletin?.decision ?? "",
  });

  if (!bulletin) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/bulletins/${bulletin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moyenneGenerale: formData.moyenneGenerale ? parseFloat(formData.moyenneGenerale as string) : null,
          rang: formData.rang ? parseInt(formData.rang as string) : null,
          appreciation: formData.appreciation,
          decision: formData.decision,
        }),
      });

      if (!res.ok) throw new Error("Erreur lors de la mise à jour");

      toast.success("Bulletin mis à jour avec succès");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error("Impossible de modifier le bulletin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Éditer le bulletin - {bulletin.eleve.nom} {bulletin.eleve.prenom}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Moyenne Générale (forcée)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Laisser vide pour auto"
                value={formData.moyenneGenerale}
                onChange={(e) => setFormData({ ...formData, moyenneGenerale: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Rang</Label>
              <Input
                type="number"
                placeholder="Ex: 1"
                value={formData.rang}
                onChange={(e) => setFormData({ ...formData, rang: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Décision du conseil</Label>
            <Select 
              value={formData.decision} 
              onValueChange={(val: string) => setFormData({ ...formData, decision: val === "NONE" ? "" : val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une décision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Aucune</SelectItem>
                <SelectItem value="PASSAGE">Passage en classe supérieure</SelectItem>
                <SelectItem value="REDOUBLEMENT">Redoublement</SelectItem>
                <SelectItem value="FELICITATIONS">Félicitations</SelectItem>
                <SelectItem value="ENCOURAGEMENTS">Encouragements</SelectItem>
                <SelectItem value="AVERTISSEMENT">Avertissement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Appréciation générale</Label>
            <Textarea
              placeholder="Saisissez l'appréciation du professeur principal ou du directeur..."
              className="resize-none"
              rows={4}
              value={formData.appreciation}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, appreciation: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
