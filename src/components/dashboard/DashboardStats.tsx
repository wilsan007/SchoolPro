import { Users, School, ClipboardList, GraduationCap, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const iconMap = {
  users: Users,
  school: School,
  clipboard: ClipboardList,
  graduation: GraduationCap,
};

const colorMap = {
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
};

interface Stat {
  label: string;
  value: string;
  total?: number;
  icon: keyof typeof iconMap;
  color: keyof typeof colorMap;
  change?: string;
  changePositive?: boolean;
}

export function DashboardStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = iconMap[stat.icon];
        return (
          <Card key={stat.label} className="hover:shadow-md transition-shadow animate-fade-in">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                    {stat.total && stat.total !== parseInt(stat.value) && (
                      <span className="text-sm text-muted-foreground">/ {stat.total}</span>
                    )}
                  </div>
                  {stat.change && (
                    <div className={cn(
                      "flex items-center gap-1 text-xs font-medium",
                      stat.changePositive === true ? "text-green-600 dark:text-green-400" :
                      stat.changePositive === false ? "text-red-500 dark:text-red-400" :
                      "text-muted-foreground"
                    )}>
                      {stat.changePositive === true && <TrendingUp className="h-3 w-3" />}
                      {stat.changePositive === false && <TrendingDown className="h-3 w-3" />}
                      <span>{stat.change}</span>
                    </div>
                  )}
                </div>
                <div className={cn("p-3 rounded-xl", colorMap[stat.color])}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
