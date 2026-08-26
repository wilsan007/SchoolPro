"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Lock, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

  // Réinitialiser le formulaire quand le bulletin change
  useEffect(() => {
    if (bulletin) {
      setFormData({
        moyenneGenerale: bulletin?.moyenneGenerale ?? "",
        rang: bulletin?.rang ?? "",
        appreciation: bulletin?.appreciation ?? "",
        decision: bulletin?.decision ?? "",
      });
    }
  }, [bulletin]);

  if (!bulletin) return null;

  const verrouille = bulletin.statut === "VERROUILLE" || bulletin.statut === "PUBLIE" || bulletin.verrouille;
  const publie = bulletin.statut === "PUBLIE" || bulletin.isPublie;

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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("errUpdate"));
      }

      toast.success(t("updateSuccess"));
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errEdit"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("editBulletinTitle", { nom: bulletin.eleve.nom, prenom: bulletin.eleve.prenom })}
            {verrouille && (
              <Badge variant={publie ? "success" : "secondary"} className="gap-1">
                <Lock className="h-3 w-3" />
                {publie ? t("published") : t("locked")}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Avertissement si le bulletin est verrouillé */}
        {verrouille && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-amber-800 dark:text-amber-300">
              {t("lockedWarning")}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
