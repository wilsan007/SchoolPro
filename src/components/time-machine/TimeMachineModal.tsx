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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, RotateCcw, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface TimeMachineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Time Machine — modal pour fixer la date "maintenant" de la démo.
 *
 * Permet de:
 *  - Choisir une date précise
 *  - Utiliser des presets (octobre 2025, janvier 2026, août 2026, etc.)
 *  - Désactiver le mode démo (retour à la vraie heure)
 *  - Avancer/reculer de 30 jours
 *
 * La date est stockée dans un cookie et lue par `getDemoNow()`.
 */
export function TimeMachineModal({ open, onOpenChange }: TimeMachineModalProps) {
  const t = useTranslations("timeMachine");
  const [enabled, setEnabled] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [realNow, setRealNow] = useState("");
  const [loading, setLoading] = useState(false);

  // Charger l'état actuel
  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-now");
      const data = await res.json();
      setEnabled(data.enabled);
      setRealNow(data.realNow);
      if (data.enabled && data.date) {
        // Formater pour l'input datetime-local: "YYYY-MM-DDTHH:MM"
        const d = new Date(data.date);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        setDateStr(local.toISOString().slice(0, 16));
      } else {
        setDateStr("");
      }
    } catch {
      // Erreur silencieuse
    }
  }, []);

  useEffect(() => {
    if (open) loadState();
  }, [open, loadState]);

  // Sauvegarder la date
  const saveDate = async (date: string | null) => {
    setLoading(true);
    try {
      const iso = date ? new Date(date).toISOString() : null;
      const res = await fetch("/api/demo-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: iso }),
      });
      const data = await res.json();
      setEnabled(data.enabled);
      if (data.enabled) {
        toast.success(t("dateActivee", { date: new Date(data.date).toLocaleDateString("fr-FR") }));
      } else {
        toast.success(t("dateDesactivee"));
      }
      // Recharger la page pour que tous les composants utilisent la nouvelle date
      setTimeout(() => window.location.reload(), 500);
    } catch {
      toast.error(t("erreur"));
    } finally {
      setLoading(false);
    }
  };

  // Presets de dates clés pour la démo
  const presets = [
    {
      label: t("presetOctobre2025"),
      description: t("presetOctobre2025Desc"),
      date: "2025-10-15T10:00",
    },
    {
      label: t("presetJanvier2026"),
      description: t("presetJanvier2026Desc"),
      date: "2026-01-15T10:00",
    },
    {
      label: t("presetMars2026"),
      description: t("presetMars2026Desc"),
      date: "2026-03-15T10:00",
    },
    {
      label: t("presetJuin2026"),
      description: t("presetJuin2026Desc"),
      date: "2026-06-15T10:00",
    },
    {
      label: t("presetAout2026"),
      description: t("presetAout2026Desc"),
      date: "2026-08-16T10:00",
    },
    {
      label: t("presetOctobre2026"),
      description: t("presetOctobre2026Desc"),
      date: "2026-10-15T10:00",
    },
  ];

  // Avancer/reculer de N jours
  const shiftDays = (days: number) => {
    let base: Date;
    if (dateStr) {
      base = new Date(dateStr);
    } else {
      base = new Date(realNow || Date.now());
    }
    base.setDate(base.getDate() + days);
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
    setDateStr(local.toISOString().slice(0, 16));
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
          {enabled && dateStr && (
            <div className="mt-1 flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Calendar className="h-3 w-3" />
              <span className="font-medium">
                {new Date(dateStr).toLocaleDateString("fr-FR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("presets")}
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.date}
                onClick={() => setDateStr(preset.date)}
                className={`flex flex-col items-start rounded-lg border p-2 text-left text-xs transition-colors hover:bg-accent ${
                  dateStr === preset.date ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""
                }`}
              >
                <span className="font-medium">{preset.label}</span>
                <span className="text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date personnalisée */}
        <div className="space-y-2">
          <Label htmlFor="demo-date">{t("datePersonnalisee")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="demo-date"
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => shiftDays(-30)}
              disabled={loading}
            >
              -30{t("jours")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shiftDays(30)}
              disabled={loading}
            >
              +30{t("jours")}
            </Button>
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
            onClick={() => saveDate(dateStr)}
            disabled={loading || !dateStr}
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
