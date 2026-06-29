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
      color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    },
    {
      label: "Cette semaine",
      value: semaine,
      icon: CalendarDays,
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    },
    {
      label: "Non justifiées",
      value: nonJustifiees,
      icon: AlertTriangle,
      color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    },
  ];

  return (
    <div className="flex items-center gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${item.color}`}>
            <item.icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xl font-bold">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
