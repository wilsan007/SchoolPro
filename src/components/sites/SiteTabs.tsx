"use client";

import { useTranslations } from "next-intl";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SiteColor } from "@/lib/site-colors";

interface SiteTabsProps {
  sites: { id: string; nom: string }[];
  siteColors: Record<string, SiteColor>;
  activeSiteId: string | "all";
  className?: string;
}

export function SiteTabs({ sites, siteColors, activeSiteId, className }: SiteTabsProps) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const all = [{ id: "all" as const, nom: t("all") }];
  const options = [...all, ...sites];

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") {
      params.delete("siteId");
    } else {
      params.set("siteId", id);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((site) => {
        const isActive = activeSiteId === site.id;
        const color = site.id === "all" ? undefined : siteColors[site.id];
        return (
          <button
            key={site.id}
            onClick={() => select(site.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              isActive && !color ? "bg-primary text-primary-foreground border-primary shadow-sm" : "",
              !isActive && !color ? "bg-background border-border text-muted-foreground hover:bg-muted" : "",
              isActive && color ? "shadow-sm" : "",
              !isActive && color ? "hover:opacity-90" : ""
            )}
            style={
              color
                ? {
                    backgroundColor: isActive ? color.base : color.light,
                    borderColor: color.border,
                    color: isActive ? "#fff" : color.text,
                  }
                : undefined
            }
          >
            {site.nom}
          </button>
        );
      })}
    </div>
  );
}
