interface Stats {
  total: number;
  actifs: number;
  filles: number;
  garcons: number;
  internes: number;
}

export function ElevesStats({ stats }: { stats: Stats }) {
  const items = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Actifs", value: stats.actifs, color: "text-green-600 dark:text-green-400" },
    { label: "Filles", value: stats.filles, color: "text-pink-600 dark:text-pink-400" },
    { label: "Garçons", value: stats.garcons, color: "text-blue-600 dark:text-blue-400" },
    { label: "Internes", value: stats.internes, color: "text-orange-600 dark:text-orange-400" },
  ];

  return (
    <div className="flex items-center gap-6">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3">
          {i > 0 && <div className="w-px h-8 bg-border" />}
          <div>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
