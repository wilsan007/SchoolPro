"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Loader2 } from "lucide-react";

interface WeekData {
  semaine: string;
  justifiees: number;
  injustifiees: number;
  retards: number;
}

export function AbsenceChart({ tenantId }: { tenantId: string }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t("absencesChart")}</CardTitle>
        <CardDescription>{t("last8Weeks")} — {new Date().getFullYear()}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[220px]">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 || data.every((d) => d.justifiees === 0 && d.injustifiees === 0 && d.retards === 0) ? (
          <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
            {t("noAbsences8Weeks")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
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
              <Bar dataKey="justifiees" name={t("justified")} fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="injustifiees" name={t("unjustified")} fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="retards" name={t("late")} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
