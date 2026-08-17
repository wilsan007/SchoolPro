"use client";

import * as React from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Wrapper de section pour la page « Intelligence du directeur ».
 *
 * Chaque section correspond à un niveau d'analyse (Détection, Diagnostic,
 * Prédiction, Prescription, Mesure) et partage le même en-tête : un titre,
 * une description courte, puis le contenu dans un container `mt-4`.
 *
 * États gérés :
 *  - `loading`    → squelette animé (pas de flash de contenu vide).
 *  - `error`      → message clair + bouton « Réessayer ».
 *  - `onRetry`    → rappelé par le bouton ; la section mère relance son fetch.
 */
export interface SectionIntelligenceProps {
  /** Titre court de la section (ex. « Détection — Risque de décrochage »). */
  titre: string;
  /** Description une ligne, en gris discret. */
  description: string;
  children: React.ReactNode;
  /** Affiche le squelette de chargement à la place des children. */
  loading?: boolean;
  /** Message d'erreur à afficher (couple avec `onRetry`). */
  error?: string | null;
  /** Appelé quand l'utilisateur clique « Réessayer ». */
  onRetry?: () => void;
  /** Classe supplémentaire pour la racine. */
  className?: string;
}

export function SectionIntelligence({
  titre,
  description,
  children,
  loading = false,
  error = null,
  onRetry,
  className,
}: SectionIntelligenceProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
          {titre}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground">{description}</p>
      </div>

      <div className="mt-4">
        {loading ? (
          <SqueletteSection />
        ) : error ? (
          <ErreurSection message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ─── Squelette de chargement ────────────────────────────────────────────────

function SqueletteSection() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-3 sm:p-4 rounded-lg border bg-card animate-pulse"
          >
            <div className="h-3 w-2/3 rounded bg-muted mb-3" />
            <div className="h-6 w-1/2 rounded bg-muted mb-3" />
            <div className="h-2 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-32 w-full rounded-lg border bg-card animate-pulse" />
    </div>
  );
}

// ─── Erreur avec retry ──────────────────────────────────────────────────────

function ErreurSection({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("directionIntelligence");
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 rounded-lg border border-destructive/30 bg-destructive/5 text-sm"
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <span className="flex-1 text-destructive">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-md border border-destructive/40 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("reessayer")}
        </button>
      )}
    </div>
  );
}

// ─── Indicateur de chargement inline (pour boutons) ─────────────────────────

export function IndicateurChargement({ label }: { label?: string }) {
  const t = useTranslations("directionIntelligence");
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? t("chargement")}
    </span>
  );
}
