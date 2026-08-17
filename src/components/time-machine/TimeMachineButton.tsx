"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeMachineModal } from "./TimeMachineModal";
import { useTranslations } from "next-intl";

/**
 * Bouton Time Machine pour la barre de navigation.
 * Affiche une icône horloge et ouvre le modal de réglage de date.
 * Si le mode démo est activé, l'icône est en bleu avec un point.
 */
export function TimeMachineButton() {
  const t = useTranslations("timeMachine");
  const [open, setOpen] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    // Vérifier si le mode démo est activé au chargement
    fetch("/api/demo-now")
      .then((r) => r.json())
      .then((data) => setDemoEnabled(data.enabled))
      .catch(() => {});
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className={`relative gap-1.5 ${demoEnabled ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
        title={t("titre")}
      >
        <Clock className="h-4 w-4" />
        {demoEnabled && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-background" />
        )}
        <span className="hidden sm:inline">{t("bouton")}</span>
      </Button>
      <TimeMachineModal open={open} onOpenChange={setOpen} />
    </>
  );
}
