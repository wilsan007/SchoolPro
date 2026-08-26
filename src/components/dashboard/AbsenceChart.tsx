"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AccentCard, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Loader2, BarChart3 } from "lucide-react";

interface WeekData {
  semaine: string;
  justifiees: number;
  injustifiees: number;
  retards: number;
}

export function AbsenceChart({ tenantId }: { tenantId: string; siteFilter?: Record<string, unknown> }) {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/absences-chart")
      .then((r) => r.json())
      .then((d) => setData(d.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const hasData = data.length > 0 && !data.every((d) => d.justifiees === 0 && d.injustifiees === 0 && d.retards === 0);

  return (
    <AccentCard accent="amber">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t("absencesChart")}</CardTitle>
        <CardDescription>{t("last8Weeks")} — {new Date().getFullYear()}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[200px] sm:h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <EmptyState
            icon={BarChart3}
            title={t("noAbsences8Weeks")}
            description="Les données d'absences des 8 dernières semaines apparaîtront ici."
            accent="amber"
            size="sm"
          />
        ) : (
          <div className="w-full h-[200px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={10} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="semaine"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: "12px",
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "12px" }}
              />
              <Bar dataKey="justifiees" name={t("justified")} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="injustifiees" name={t("unjustified")} fill="#e11d48" radius={[4, 4, 0, 0]} />
              <Bar dataKey="retards" name={t("late")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </AccentCard>
  );
}
