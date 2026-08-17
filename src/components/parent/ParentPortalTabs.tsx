"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ParentTab =
  | "overview"
  | "notes"
  | "absences"
  | "edt"
  | "documents"
  | "messages"
  | "factures"
  | "evolution";

const TAB_ICONS: Record<ParentTab, string> = {
  overview: "📊",
  notes: "📝",
  absences: "📅",
  edt: "🗓️",
  documents: "📄",
  messages: "💬",
  factures: "💳",
  evolution: "📈",
};

interface ParentPortalTabsProps {
  panels: Partial<Record<ParentTab, React.ReactNode>>;
  defaultTab?: ParentTab;
  hasFactures: boolean;
}

export function ParentPortalTabs({
  panels,
  defaultTab = "overview",
  hasFactures,
}: ParentPortalTabsProps) {
  const t = useTranslations("parentPortal");
  const [tab, setTab] = useState<ParentTab>(defaultTab);
  const [, startTransition] = useTransition();

  const tabs: { key: ParentTab; label: string }[] = [
    { key: "overview", label: t("tabOverview") },
    { key: "notes", label: t("tabNotes") },
    { key: "absences", label: t("tabAbsences") },
    { key: "edt", label: t("tabEdt") },
    { key: "documents", label: t("tabDocuments") },
    { key: "messages", label: t("tabMessages") },
    { key: "evolution", label: t("tabEvolution") },
    ...(hasFactures ? [{ key: "factures" as ParentTab, label: t("tabFactures") }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar — scrollable horizontalement sur mobile */}
      <div
        className="flex gap-1 overflow-x-auto scrollbar-thin rounded-xl bg-muted p-1"
        role="tablist"
        aria-label={t("tabAriaLabel")}
      >
        {tabs.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => startTransition(() => setTab(tb.key))}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === tb.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden>{TAB_ICONS[tb.key]}</span>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">{panels[tab] ?? null}</div>
    </div>
  );
}
