"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { deleteSite, type DeleteSiteFormData } from "@/lib/actions/parametres";
import { useTranslations } from "next-intl";

interface DeleteSiteDialogProps {
  siteId: string;
  siteNom: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

const REASONS: { value: DeleteSiteFormData["reason"]; key: "FERMETURE" | "FUSION" | "ERREUR" | "AUTRE" }[] = [
  { value: "FERMETURE", key: "FERMETURE" },
  { value: "FUSION", key: "FUSION" },
  { value: "ERREUR", key: "ERREUR" },
  { value: "AUTRE", key: "AUTRE" },
];

export function DeleteSiteDialog({
  siteId,
  siteNom,
  open,
  onOpenChange,
  onDeleted,
}: DeleteSiteDialogProps) {
  const t = useTranslations("parametres");
  const tc = useTranslations("common");
  const [isPending, setIsPending] = useState(false);
  const [reason, setReason] = useState<DeleteSiteFormData["reason"] | "">("");
  const [customReason, setCustomReason] = useState("");
  const [confirmName1, setConfirmName1] = useState("");
  const [confirmName2, setConfirmName2] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);

  const canSubmit =
    reason !== "" &&
    confirmName1 === siteNom &&
    confirmName2 === siteNom &&
    acknowledge &&
    (reason !== "AUTRE" || customReason.trim().length > 0);

  function reset() {
    setReason("");
    setCustomReason("");
    setConfirmName1("");
    setConfirmName2("");
    setAcknowledge(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsPending(true);
    try {
      const result = await deleteSite(siteId, {
        reason: reason as DeleteSiteFormData["reason"],
        customReason: reason === "AUTRE" ? customReason.trim() : undefined,
        confirmName1,
        confirmName2,
        acknowledgeIrreversible: acknowledge,
      });
      toast.success(
        t("siteMarkedForDeletion", { siteNom, date: new Date(result.scheduledPurgeAt).toLocaleDateString("fr-FR") })
      );
      reset();
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errorDeletion"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent closeOnOverlayClick={false} className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-base">{t("deleteSiteTitle", { siteNom })}</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">
            {t("deleteSiteDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Raison */}
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-sm">{t("deletionReason")}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as DeleteSiteFormData["reason"])}>
              <SelectTrigger id="reason">
                <SelectValue placeholder={t("selectReason")} />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{t(`deleteReasons.${r.key}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Raison personnalisée */}
          {reason === "AUTRE" && (
            <div className="space-y-1.5">
              <Label htmlFor="customReason" className="text-sm">{t("specifyReason")}</Label>
              <Input
                id="customReason"
                placeholder={t("describeReason")}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* Confirmation 1 */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm1" className="text-sm">
              {t("enterExactName")} <span className="font-semibold text-red-600">{siteNom}</span>
            </Label>
            <Input
              id="confirm1"
              placeholder={siteNom}
              value={confirmName1}
              onChange={(e) => setConfirmName1(e.target.value)}
              autoComplete="off"
            />
            {confirmName1 && confirmName1 !== siteNom && (
              <p className="text-xs text-red-500">{t("nameMismatch")}</p>
            )}
          </div>

          {/* Confirmation 2 */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm2" className="text-sm">
              {t("confirmAgain")} <span className="font-semibold text-red-600">{siteNom}</span>
            </Label>
            <Input
              id="confirm2"
              placeholder={siteNom}
              value={confirmName2}
              onChange={(e) => setConfirmName2(e.target.value)}
              autoComplete="off"
            />
            {confirmName2 && confirmName2 !== siteNom && (
              <p className="text-xs text-red-500">{t("nameMismatch")}</p>
            )}
          </div>

          {/* Checkbox */}
          <div className="flex items-start gap-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
            <input
              type="checkbox"
              id="acknowledge"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <Label htmlFor="acknowledge" className="text-xs font-normal cursor-pointer leading-relaxed">
              {t("acknowledgeDeletion")}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={isPending}
          >
            {tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            disabled={!canSubmit || isPending}
            onClick={handleSubmit}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("markForDeletion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
