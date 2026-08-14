"use client";

import { MapPin, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface Site {
  id: string;
  nom: string;
  code?: string | null;
}

interface SiteIndicatorProps {
  currentSiteId?: string | null;
  sites: Site[];
  variant?: "default" | "subtle";
  className?: string;
}

export function SiteIndicator({
  currentSiteId,
  sites,
  variant = "default",
  className,
}: SiteIndicatorProps) {
  const t = useTranslations("common");
  const current = sites.find((s) => s.id === currentSiteId);

  if (sites.length === 0) return null;

  const isAllSites = !currentSiteId || sites.length === 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        variant === "subtle"
          ? "bg-muted/50 text-muted-foreground border-border"
          : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800",
        className
      )}
      title={t("currentSiteTooltip")}
    >
      {isAllSites ? (
        <Layers className="h-3 w-3 flex-shrink-0" />
      ) : (
        <MapPin className="h-3 w-3 flex-shrink-0" />
      )}
      <span className="truncate max-w-[200px]">
        {isAllSites ? t("allSites") : current?.nom ?? t("unknownSite")}
      </span>
      {current?.code && (
        <span className="text-[10px] opacity-70">({current.code})</span>
      )}
    </div>
  );
}
