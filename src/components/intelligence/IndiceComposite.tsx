"use client";

import * as React from "react";
import { Info, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Carte pour un indice composite du tableau de bord du directeur
 * (ISP, IEIS, IVF, ICS, ROI, Vitesse, IRO).
 *
 * La barre de progression est colorée selon le seuil :
 *   - rouge   si valeur < 0.4  (critique)
 *   - orange  si 0.4 ≤ valeur < 0.7 (à surveiller)
 *   - vert    si valeur ≥ 0.7  (sain)
 *
 * `unite` :
 *   - "pourcentage" → la valeur est affichée en % (×100).
 *   - "score"        → la valeur est affichée brute (0-1), arrondie à 2 décimales.
 *
 * Quand `donneesInsuffisantes` est vrai, un drapeau « données insuffisantes »
 * remplace la barre : on n'affiche pas un faux score vert sur une donnée
 * manquante.
 */
export interface IndiceCompositeProps {
  /** Nom lisible de l'indice (ex. « ISP — Santé pédagogique »). */
  nom: string;
  /** Valeur 0-1 (ou non bornée pour le ROI / la vitesse). */
  valeur: number | null;
  /** Description courte affichée dans l'info-bulle. */
  description: string;
  /** `true` quand une sous-composante manque — la valeur n'est pas fiable. */
  donneesInsuffisantes?: boolean;
  /** Unité d'affichage. Défaut : "score". */
  unite?: "pourcentage" | "score";
}

/** Seuil couleur pour une valeur 0-1. */
function couleurPourValeur(v: number): string {
  if (v < 0.4) return "bg-red-500";
  if (v < 0.7) return "bg-orange-500";
  return "bg-emerald-500";
}

/** Couleur du texte de la valeur. */
function texteCouleurPourValeur(v: number): string {
  if (v < 0.4) return "text-red-600 dark:text-red-400";
  if (v < 0.7) return "text-orange-600 dark:text-orange-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/** Formate la valeur selon l'unité. */
function formaterValeur(v: number, unite: "pourcentage" | "score"): string {
  if (unite === "pourcentage") return `${Math.round(v * 100)} %`;
  // Score : 2 décimales.
  return v.toFixed(2);
}

export function IndiceComposite({
  nom,
  valeur,
  description,
  donneesInsuffisantes = false,
  unite = "score",
}: IndiceCompositeProps) {
  const t = useTranslations("directionIntelligence");
  const [ouverte, setOuverte] = React.useState(false);
  const valeurNulle = valeur === null || valeur === undefined || Number.isNaN(valeur as number);
  // Pour la barre, on borne à [0, 1] (le ROI et la vitesse peuvent dépasser 1).
  const valeurBarre = valeurNulle ? 0 : Math.min(1, Math.max(0, valeur as number));
  const pctBarre = Math.round(valeurBarre * 100);

  return (
    <div className="relative p-3 sm:p-4 rounded-lg border bg-card shadow-sm">
      {/* En-tête : nom + info-bulle */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-medium leading-tight text-foreground/90">
          {nom}
        </h3>
        <button
          type="button"
          aria-label={t("detailIndice")}
          className="shrink-0 rounded p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          onClick={() => setOuverte((o) => !o)}
          onBlur={() => setOuverte(false)}
        >
          <Info className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>

      {/* Info-bulle description */}
      {ouverte && (
        <div
          role="tooltip"
          className="absolute right-2 top-9 z-20 max-w-[15rem] sm:max-w-[20rem] rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-md"
        >
          {description}
        </div>
      )}

      {/* Valeur */}
      <div className="mt-2 flex items-baseline gap-1.5">
        {donneesInsuffisantes || valeurNulle ? (
          <span className="text-lg sm:text-xl font-semibold text-muted-foreground">
            —
          </span>
        ) : (
          <span
            className={cn(
              "text-lg sm:text-xl font-bold tabular-nums",
              texteCouleurPourValeur(valeur as number)
            )}
          >
            {formaterValeur(valeur as number, unite)}
          </span>
        )}
      </div>

      {/* Barre de progression OU drapeau données insuffisantes */}
      <div className="mt-3">
        {donneesInsuffisantes || valeurNulle ? (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{t("donneesInsuffisantes")}</span>
          </div>
        ) : (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pctBarre}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                couleurPourValeur(valeur as number)
              )}
              style={{ width: `${pctBarre}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
