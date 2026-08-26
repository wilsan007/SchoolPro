"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmptyStateAccent = "azure" | "violet" | "teal" | "amber" | "rose" | "emerald" | "sky" | "indigo";

interface EmptyStateProps {
  /** Icône Lucide à afficher */
  icon: LucideIcon;
  /** Titre principal */
  title: string;
  /** Description optionnelle */
  description?: string;
  /** Accent de couleur pour le halo et l'icône */
  accent?: EmptyStateAccent;
  /** Action primaire optionnelle */
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Action secondaire optionnelle */
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  /** Classes supplémentaires */
  className?: string;
  /** Taille de l'état vide */
  size?: "sm" | "md" | "lg";
}

const accentStyles: Record<EmptyStateAccent, { iconBg: string; iconText: string; halo: string }> = {
  azure:   { iconBg: "bg-primary/10",           iconText: "text-primary",         halo: "bg-primary/[0.04]" },
  violet:  { iconBg: "bg-accent/10",            iconText: "text-accent",          halo: "bg-accent/[0.04]" },
  teal:    { iconBg: "bg-teal-500/10",          iconText: "text-teal-600",        halo: "bg-teal-500/[0.04]" },
  amber:   { iconBg: "bg-amber-500/10",         iconText: "text-amber-600",       halo: "bg-amber-500/[0.04]" },
  rose:    { iconBg: "bg-rose-500/10",          iconText: "text-rose-600",        halo: "bg-rose-500/[0.04]" },
  emerald: { iconBg: "bg-emerald-500/10",       iconText: "text-emerald-600",     halo: "bg-emerald-500/[0.04]" },
  sky:     { iconBg: "bg-sky-500/10",           iconText: "text-sky-600",         halo: "bg-sky-500/[0.04]" },
  indigo:  { iconBg: "bg-indigo-500/10",        iconText: "text-indigo-600",      halo: "bg-indigo-500/[0.04]" },
};

const sizeStyles = {
  sm: { icon: "w-10 h-10", iconInner: "w-5 h-5", title: "text-sm", desc: "text-xs", halo: "w-24 h-24 blur-[40px]" },
  md: { icon: "w-14 h-14", iconInner: "w-7 h-7", title: "text-base", desc: "text-sm", halo: "w-32 h-32 blur-[50px]" },
  lg: { icon: "w-20 h-20", iconInner: "w-10 h-10", title: "text-xl", desc: "text-base", halo: "w-40 h-40 blur-[60px]" },
};

/**
 * État vide réutilisable avec halo coloré, icône et actions.
 * Conforme au design system Azure Bloom.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  accent = "azure",
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const styles = accentStyles[accent];
  const sz = sizeStyles[size];

  const ActionButton = action?.href
    ? ({ children, variant }: { children: React.ReactNode; variant?: "default" | "outline" }) => (
        <Button asChild variant={variant ?? "default"} size="sm">
          <a href={action.href}>{children}</a>
        </Button>
      )
    : ({ children, variant }: { children: React.ReactNode; variant?: "default" | "outline" }) => (
        <Button variant={variant ?? "default"} size="sm" onClick={action?.onClick}>
          {children}
        </Button>
      );

  const SecondaryButton = secondaryAction?.href
    ? ({ children }: { children: React.ReactNode }) => (
        <Button asChild variant="ghost" size="sm">
          <a href={secondaryAction.href}>{children}</a>
        </Button>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <Button variant="ghost" size="sm" onClick={secondaryAction?.onClick}>
          {children}
        </Button>
      );

  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-8 px-4", className)}>
      {/* Halo décoratif derrière l'icône */}
      <div className={cn("absolute rounded-full pointer-events-none", sz.halo, styles.halo)} aria-hidden />

      {/* Icône dans un conteneur coloré */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-2xl mb-3",
          sz.icon,
          styles.iconBg
        )}
      >
        <Icon className={cn(sz.iconInner, styles.iconText)} />
      </div>

      {/* Titre */}
      <h3 className={cn("font-display font-semibold text-foreground", sz.title)}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={cn("text-muted-foreground mt-1 max-w-sm", sz.desc)}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 mt-4">
          {action && <ActionButton>{action.label}</ActionButton>}
          {secondaryAction && <SecondaryButton>{secondaryAction.label}</SecondaryButton>}
        </div>
      )}
    </div>
  );
}
