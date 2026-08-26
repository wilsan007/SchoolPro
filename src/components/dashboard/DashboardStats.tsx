import { Users, School, ClipboardList, GraduationCap, TrendingUp, TrendingDown } from "lucide-react";
import { AccentCard, CardContent, type CardAccent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const iconMap = {
  users: Users,
  school: School,
  clipboard: ClipboardList,
  graduation: GraduationCap,
};

/**
 * Couleurs par stat — chaque stat porte un accent de catégorie qui teinte
 * la carte (bordure haute + fond teinté + halo vif au survol) et une
 * pastille en dégradé saturé pour l'icône.
 */
const accentMap = {
  azure: { card: "azure" as CardAccent, pastille: "pastille-azure", text: "text-vif-azure" },
  violet: { card: "violet" as CardAccent, pastille: "pastille-violet", text: "text-vif-violet" },
  teal: { card: "teal" as CardAccent, pastille: "pastille-teal", text: "text-vif-teal" },
  amber: { card: "amber" as CardAccent, pastille: "pastille-amber", text: "text-vif-amber" },
  rose: { card: "rose" as CardAccent, pastille: "pastille-rose", text: "text-vif-rose" },
  emerald: { card: "emerald" as CardAccent, pastille: "pastille-emerald", text: "text-vif-emerald" },
  sky: { card: "sky" as CardAccent, pastille: "pastille-sky", text: "text-vif-sky" },
  indigo: { card: "indigo" as CardAccent, pastille: "pastille-indigo", text: "text-vif-indigo" },
};

type StatColor = keyof typeof accentMap;

interface Stat {
  label: string;
  value: string;
  total?: number;
  icon: keyof typeof iconMap;
  color: StatColor;
  change?: string;
  changePositive?: boolean;
}

export function DashboardStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = iconMap[stat.icon];
        const accent = accentMap[stat.color];
        return (
          <AccentCard key={stat.label} accent={accent.card} className="animate-fade-in overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <div className="flex items-baseline gap-1">
                    <p className={cn("text-3xl font-bold tracking-tight font-data", accent.text)}>
                      {stat.value}
                    </p>
                    {stat.total && stat.total !== parseInt(stat.value) && (
                      <span className="text-sm text-muted-foreground">/ {stat.total}</span>
                    )}
                  </div>
                  {stat.change && (
                    <div className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      stat.changePositive === true ? "text-vif-emerald" :
                      stat.changePositive === false ? "text-vif-rose" :
                      "text-muted-foreground"
                    )}>
                      {stat.changePositive === true && <TrendingUp className="h-3 w-3" />}
                      {stat.changePositive === false && <TrendingDown className="h-3 w-3" />}
                      <span>{stat.change}</span>
                    </div>
                  )}
                </div>
                <div className={cn("p-3 rounded-2xl text-white flex-shrink-0", accent.pastille)}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </AccentCard>
        );
      })}
    </div>
  );
}
