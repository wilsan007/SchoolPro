import { AlertTriangle, Calendar, CalendarDays } from "lucide-react";

interface AbsencesStatsProps {
  auJourdhui: number;
  semaine: number;
  nonJustifiees: number;
}

export function AbsencesStats({ auJourdhui, semaine, nonJustifiees }: AbsencesStatsProps) {
  const items = [
    {
      label: "Aujourd'hui",
      value: auJourdhui,
      icon: Calendar,
      pastille: "pastille-azure",
      border: "border-accent-azure",
      tint: "bg-tint-azure",
      halo: "halo-vif-azure",
      text: "text-vif-azure",
    },
    {
      label: "Cette semaine",
      value: semaine,
      icon: CalendarDays,
      pastille: "pastille-violet",
      border: "border-accent-violet",
      tint: "bg-tint-violet",
      halo: "halo-vif-violet",
      text: "text-vif-violet",
    },
    {
      label: "Non justifiées",
      value: nonJustifiees,
      icon: AlertTriangle,
      pastille: "pastille-rose",
      border: "border-accent-rose",
      tint: "bg-tint-rose",
      halo: "halo-vif-rose",
      text: "text-vif-rose",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`relative rounded-[18px] border border-border bg-card p-4 shadow-sm transition-all duration-300 ${item.border} ${item.tint} ${item.halo}`}
        >
          <div className="flex items-center gap-3">
            <div className={`${item.pastille} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0`}>
              <item.icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className={`text-2xl font-bold font-data ${item.text}`}>{item.value}</p>
              <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
