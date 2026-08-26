"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AccentCard, CardContent, CardHeader, CardTitle, type CardAccent } from "@/components/ui/card";
import { UserPlus, ClipboardCheck, PenLine, CalendarPlus } from "lucide-react";
import { roleHasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Chaque raccourci porte la permission d'**écriture** qu'il déclenche, pas
 * celle de la page d'arrivée : « Inscrire un élève » suppose `eleves:write`,
 * alors qu'un enseignant n'a que `eleves:read`. Proposer une action qu'on ne
 * peut pas mener revient à promettre puis refuser.
 */
const actions = [
  {
    labelKey: "eleves.register",
    icon: UserPlus,
    href: "/eleves",
    permission: "eleves:write",
    accent: "violet" as CardAccent,
    pastille: "pastille-violet",
  },
  {
    labelKey: "absences.call",
    icon: ClipboardCheck,
    href: "/absences/appel",
    permission: "absences:write",
    accent: "amber" as CardAccent,
    pastille: "pastille-amber",
  },
  {
    labelKey: "notes.enter",
    icon: PenLine,
    href: "/notes",
    permission: "notes:write",
    accent: "emerald" as CardAccent,
    pastille: "pastille-emerald",
  },
  {
    labelKey: "examens.schedule",
    icon: CalendarPlus,
    href: "/evaluations",
    permission: "evaluations:write",
    accent: "sky" as CardAccent,
    pastille: "pastille-sky",
  },
];

export function QuickActions({ role }: { role: string }) {
  const t = useTranslations();
  const visibles = actions.filter((a) => roleHasPermission(role, a.permission));

  // Aucune action disponible : la carte disparaît plutôt que de rester vide.
  if (visibles.length === 0) return null;

  return (
    <AccentCard accent="azure">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t("dashboard.quickActions")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {visibles.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-2xl border border-border transition-all duration-200 group text-center",
                "hover:-translate-y-0.5 hover:shadow-md hover:border-transparent"
              )}
            >
              <div className={cn("p-2.5 rounded-xl text-white group-hover:scale-110 transition-transform", action.pastille)}>
                <action.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-foreground leading-tight">
                {t(action.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </AccentCard>
  );
}
