import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Accent de couleur par catégorie — utilisé par `AccentCard` pour teinter
 * le bord supérieur et le fond des cartes selon leur rôle sémantique.
 */
export type CardAccent =
  | "azure"
  | "violet"
  | "teal"
  | "amber"
  | "rose"
  | "emerald"
  | "sky"
  | "indigo";

const accentBorder: Record<CardAccent, string> = {
  azure: "border-accent-azure",
  violet: "border-accent-violet",
  teal: "border-accent-teal",
  amber: "border-accent-amber",
  rose: "border-accent-rose",
  emerald: "border-accent-emerald",
  sky: "border-accent-sky",
  indigo: "border-accent-indigo",
};

const accentTint: Record<CardAccent, string> = {
  azure: "bg-tint-azure",
  violet: "bg-tint-violet",
  teal: "bg-tint-teal",
  amber: "bg-tint-amber",
  rose: "bg-tint-rose",
  emerald: "bg-tint-emerald",
  sky: "bg-tint-sky",
  indigo: "bg-tint-indigo",
};

const accentHalo: Record<CardAccent, string> = {
  azure: "halo-vif-azure",
  violet: "halo-vif-violet",
  teal: "halo-vif-teal",
  amber: "halo-vif-amber",
  rose: "halo-vif-rose",
  emerald: "halo-vif-emerald",
  sky: "halo-vif-sky",
  indigo: "halo-vif-indigo",
};

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-[22px] border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-md", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

/**
 * Carte de statistique — halo coloré au survol (conforme DESIGN.md).
 * Un dégradé flou (filter blur) sous la carte passe d'opacity 0.12 à 0.2.
 */
const StatCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative rounded-[22px] border border-border bg-card text-card-foreground transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
        className
      )}
      {...props}
    />
  )
);
StatCard.displayName = "StatCard";

/**
 * Carte accent — bordure colorée + fond teinté + halo vif au survol.
 * Utiliser `accent` pour catégoriser visuellement la carte (azure, violet,
 * teal, amber, rose, emerald, sky, indigo).
 */
const AccentCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { accent?: CardAccent }
>(({ className, accent, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative rounded-[22px] border border-border bg-card text-card-foreground transition-all duration-300",
      accent && accentBorder[accent],
      accent && accentTint[accent],
      accent && accentHalo[accent],
      className
    )}
    {...props}
  />
));
AccentCard.displayName = "AccentCard";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, StatCard, AccentCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
