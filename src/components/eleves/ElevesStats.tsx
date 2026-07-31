"use client";

import { useTranslations } from "next-intl";

interface Stats {
  total: number;
  actifs: number;
  filles: number;
  garcons: number;
  internes: number;
}

export function ElevesStats({ stats }: { stats: Stats }) {
  const t = useTranslations("eleves");
  const items = [
    { key: "statTotal", value: stats.total, color: "text-foreground" },
    { key: "statActive", value: stats.actifs, color: "text-green-600 dark:text-green-400" },
    { key: "statGirls", value: stats.filles, color: "text-pink-600 dark:text-pink-400" },
    { key: "statBoys", value: stats.garcons, color: "text-blue-600 dark:text-blue-400" },
    { key: "statBoarders", value: stats.internes, color: "text-orange-600 dark:text-orange-400" },
  ];

  return (
    <div className="flex items-center gap-6">
      {items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-3">
          {i > 0 && <div className="w-px h-8 bg-border" />}
          <div>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground">{t(item.key)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
