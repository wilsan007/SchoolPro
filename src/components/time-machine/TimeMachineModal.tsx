"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, RotateCcw, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DEMO_PRESETS } from "@/lib/demo-presets";

interface TimeMachineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Time Machine — modal pour fixer la date "maintenant" de la démo.
 *
 * La Time Machine n'est PAS un simulateur : chaque preset pointe sur un
 * snapshot de données déjà calculé en amont (seed). On n'affiche que le
 * résultat, on ne recalcule pas.
 */
export function TimeMachineModal({ open, onOpenChange }: TimeMachineModalProps) {
  const t = useTranslations("timeMachine");
  const [enabled, setEnabled] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const findPresetByDate = (date: string | null) =>
    DEMO_PRESETS.find((p) => p.date === date)?.id ?? null;

  const selectedPreset = DEMO_PRESETS.find((p) => p.id === selectedPresetId);

  // Charger l'état actuel
  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-now");
      if (!res.ok) return;
      const data = await res.json();
      setEnabled(data.enabled);
      setSelectedPresetId(findPresetByDate(data.enabled ? data.date : null));
    } catch (e) {
      console.warn("[non-fatal]", e);
      // Erreur silencieuse
    }
  }, []);

  useEffect(() => {
    if (open) loadState();
  }, [open, loadState]);

  // Sauvegarder le preset
  const saveDate = async (date: string | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/demo-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error("demo-now-save-failed");
      const data = await res.json();
      setEnabled(data.enabled);
      if (data.enabled) {
        toast.success(t("dateActivee", { date: new Date(data.date).toLocaleDateString("fr-FR") }));
      } else {
        toast.success(t("dateDesactivee"));
      }
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      toast.error(t("erreur"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            {t("titre")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* État actuel */}
        <div className="rounded-lg border bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("etatActuel")}</span>
            <span className={`font-medium ${enabled ? "text-blue-600" : "text-muted-foreground"}`}>
              {enabled ? t("modeDemo") : t("modeReel")}
            </span>
          </div>
          {enabled && selectedPreset && (
            <div className="mt-1 flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Calendar className="h-3 w-3" />
              <span className="font-medium">{t(selectedPreset.label)}</span>
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("presets")}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`flex flex-col items-start rounded-lg border p-2 text-left text-xs transition-colors hover:bg-accent ${
                  selectedPresetId === preset.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""
                }`}
              >
                <span className="font-medium">{t(preset.label)}</span>
                <span className="text-muted-foreground">{t(preset.description)}</span>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {enabled && (
            <Button
              variant="outline"
              onClick={() => saveDate(null)}
              disabled={loading}
              className="mr-auto"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t("retourReel")}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("annuler")}
          </Button>
          <Button
            onClick={() => saveDate(selectedPreset?.date ?? null)}
            disabled={loading || !selectedPreset}
          >
            {loading ? t("chargement") : (
              <>
                <ChevronRight className="h-4 w-4 mr-1" />
                {t("appliquer")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
