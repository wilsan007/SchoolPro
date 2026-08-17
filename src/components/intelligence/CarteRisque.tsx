"use client";

import * as React from "react";
import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Carte pour un élève à risque de décrochage.
 *
 * Le score (0-100) est coloré :
 *   - rouge  si niveau "ELEVE" (score ≥ 61)
 *   - orange si niveau "MODERE"
 *
 * Un badge « silencieux » (violet) signale un décrochage silencieux : un
 * élève dont la maîtrise baisse sans avoir encore basculé en échec visible.
 */

export interface EleveRisque {
  nom: string;
  prenom: string;
  classeNom: string;
  /** Score agrégé 0-100. */
  score: number;
  /** Niveau de risque. */
  niveau: string;
  /** `true` si décrochage silencieux. */
  decrochageSilencieux: boolean;
}

export interface CarteRisqueProps {
  eleve: EleveRisque;
}

/** Couleur de la barre et du score selon le niveau. */
function stylePourNiveau(niveau: string): {
  barre: string;
  texte: string;
} {
  if (niveau === "ELEVE") {
    return {
      barre: "bg-red-500",
      texte: "text-red-600 dark:text-red-400",
    };
  }
  if (niveau === "MODERE") {
    return {
      barre: "bg-orange-500",
      texte: "text-orange-600 dark:text-orange-400",
    };
  }
  return {
    barre: "bg-emerald-500",
    texte: "text-emerald-600 dark:text-emerald-400",
  };
}

export function CarteRisque({ eleve }: CarteRisqueProps) {
  const t = useTranslations("directionIntelligence");
  const style = stylePourNiveau(eleve.niveau);
  const pct = Math.min(100, Math.max(0, Math.round(eleve.score)));

  return (
    <div className="p-3 sm:p-4 rounded-lg border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {/* Identité */}
        <div className="min-w-0">
          <p className="truncate text-sm sm:text-base font-medium text-foreground">
            {eleve.prenom} {eleve.nom}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {eleve.classeNom}
          </p>
        </div>

        {/* Badge silencieux */}
        {eleve.decrochageSilencieux && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-transparent bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
            <Volume2 className="h-3 w-3" />
            {t("badgeSilencieux")}
          </span>
        )}
      </div>

      {/* Score + mini barre */}
      <div className="mt-3 flex items-center gap-3">
        <span
          className={cn(
            "text-base sm:text-lg font-bold tabular-nums",
            style.texte
          )}
        >
          {Math.round(eleve.score)}
          <span className="text-xs font-normal text-muted-foreground">{t("sur100")}</span>
        </span>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", style.barre)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
