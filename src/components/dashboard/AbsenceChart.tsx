"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// Données mockées — à remplacer par de vraies données server
const mockData = [
  { semaine: "S1", justifiees: 4, injustifiees: 2, retards: 3 },
  { semaine: "S2", justifiees: 6, injustifiees: 1, retards: 5 },
  { semaine: "S3", justifiees: 3, injustifiees: 4, retards: 2 },
  { semaine: "S4", justifiees: 7, injustifiees: 2, retards: 4 },
  { semaine: "S5", justifiees: 5, injustifiees: 3, retards: 6 },
  { semaine: "S6", justifiees: 8, injustifiees: 1, retards: 3 },
  { semaine: "S7", justifiees: 4, injustifiees: 5, retards: 2 },
  { semaine: "S8", justifiees: 6, injustifiees: 2, retards: 4 },
];

export function AbsenceChart({ tenantId }: { tenantId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Évolution des absences</CardTitle>
        <CardDescription>8 dernières semaines — {new Date().getFullYear()}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={mockData} barSize={10} barGap={2}>
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
            <Bar dataKey="justifiees" name="Justifiées" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="injustifiees" name="Injustifiées" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="retards" name="Retards" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
