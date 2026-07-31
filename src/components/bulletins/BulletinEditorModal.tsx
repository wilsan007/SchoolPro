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
import { useTranslations } from "next-intl";

interface BulletinEditorModalProps {
  bulletin: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulletinEditorModal({ bulletin, isOpen, onClose, onSuccess }: BulletinEditorModalProps) {
  const t = useTranslations("bulletins");
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

      if (!res.ok) throw new Error(t("errUpdate"));

      toast.success(t("updateSuccess"));
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(t("errEdit"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("editBulletinTitle", { nom: bulletin.eleve.nom, prenom: bulletin.eleve.prenom })}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("forcedAvg")}</Label>
              <Input
                type="number"
                step="0.01"
                placeholder={t("leaveEmptyAuto")}
                value={formData.moyenneGenerale}
                onChange={(e) => setFormData({ ...formData, moyenneGenerale: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("rankLabel")}</Label>
              <Input
                type="number"
                placeholder={t("rankPlaceholder")}
                value={formData.rang}
                onChange={(e) => setFormData({ ...formData, rang: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("councilDecision")}</Label>
            <Select 
              value={formData.decision} 
              onValueChange={(val: string) => setFormData({ ...formData, decision: val === "NONE" ? "" : val })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectDecision")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">{t("none")}</SelectItem>
                <SelectItem value="PASSAGE">{t("passingUpper")}</SelectItem>
                <SelectItem value="REDOUBLEMENT">{t("repeating")}</SelectItem>
                <SelectItem value="FELICITATIONS">{t("felicitations")}</SelectItem>
                <SelectItem value="ENCOURAGEMENTS">{t("encouragements")}</SelectItem>
                <SelectItem value="AVERTISSEMENT">{t("warning")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("generalAppreciation")}</Label>
            <Textarea
              placeholder={t("appreciationPlaceholderInput")}
              className="resize-none"
              rows={4}
              value={formData.appreciation}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, appreciation: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
