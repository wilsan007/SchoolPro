"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, ClipboardCheck, PenLine, CalendarPlus } from "lucide-react";

const actions = [
  {
    labelKey: "eleves.register",
    icon: UserPlus,
    href: "/eleves",
    color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  },
  {
    labelKey: "absences.call",
    icon: ClipboardCheck,
    href: "/absences/appel",
    color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  },
  {
    labelKey: "notes.enter",
    icon: PenLine,
    href: "/notes",
    color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
  {
    labelKey: "examens.schedule",
    icon: CalendarPlus,
    href: "/evaluations",
    color: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
];

export function QuickActions() {
  const t = useTranslations();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t("dashboard.quickActions")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all duration-150 group text-center"
            >
              <div className={`p-2.5 rounded-lg ${action.color} group-hover:scale-110 transition-transform`}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">
                {t(action.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
