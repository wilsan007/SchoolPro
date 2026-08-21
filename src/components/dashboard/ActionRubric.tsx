"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  UserPlus, FileText, ClipboardList, UserCheck, Bell, Calendar,
  Receipt, ShieldAlert, UserX, Briefcase,
  Lightbulb, TrendingUp, BookOpen, FileEdit, AlertTriangle,
  type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  UserPlus, FileText, ClipboardList, UserCheck, Bell, Calendar,
  Receipt, ShieldAlert, UserX, Briefcase,
  Lightbulb, TrendingUp, BookOpen, FileEdit, AlertTriangle,
};

export interface RubricData {
  key: string;
  label: string;
  href: string;
  count: number;
  icon: string;
  color: string;
}

/**
 * Carte de rubrique — compteur cliquable qui mène à l'écran d'action.
 *
 * Le compteur est coloré en ambre quand > 0 (appelle l'attention),
 * en muted quand = 0 (rien à faire, ne stresse pas l'utilisateur).
 */
export function ActionRubric({ rubric }: { rubric: RubricData }) {
  const Icone = ICONES[rubric.icon] ?? FileText;

  return (
    <Link href={rubric.href} className="block">
      <Card
        className={cn(
          "h-full border p-4 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer",
          rubric.count > 0 && "border-l-4 border-l-amber-500/40"
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn("flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-muted/50")}>
            <Icone className={cn("w-5 h-5", rubric.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  rubric.count > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                )}
              >
                {rubric.count}
              </span>
            </div>
            <p className="text-sm font-medium truncate">{rubric.label}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/**
 * Grille de rubriques — affiche les cartes d'action côte à côte.
 */
export function ActionRubricGrid({ rubrics }: { rubrics: RubricData[] }) {
  const total = rubrics.reduce((acc, r) => acc + r.count, 0);

  if (total === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3 p-4">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Tout est à jour
            </p>
            <p className="text-sm text-muted-foreground">
              Aucune action en attente pour le moment.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {rubrics.map((r) => (
        <ActionRubric key={r.key} rubric={r} />
      ))}
    </div>
  );
}
