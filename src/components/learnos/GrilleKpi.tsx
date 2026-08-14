"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/learnos/kpi";

/**
 * Grille d'indicateurs, triée par ce qui appelle une action.
 *
 * Les indicateurs en alerte remontent en tête : un tableau de bord se lit en
 * quelques secondes, et l'ordre décide de ce qui sera vu. Trier par ordre
 * alphabétique ou par catégorie enterrerait l'urgent sous l'anodin.
 */
export function GrilleKpi({ kpis }: { kpis: Kpi[] }) {
  const t = useTranslations("learnos.kpi");

  const tries = [...kpis].sort((a, b) => Number(b.alerte) - Number(a.alerte));
  const aucuneAlerte = kpis.every((k) => !k.alerte);

  return (
    <div className="space-y-4">
      {aucuneAlerte && (
        <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {t("rienAsignaler")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tries.map((kpi) => {
          const contenu = (
            <CardContent className="space-y-1 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{t(kpi.cle)}</p>
                {kpi.alerte && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                )}
              </div>

              <p
                className={cn(
                  "text-3xl font-semibold",
                  kpi.alerte && "text-amber-600 dark:text-amber-400"
                )}
              >
                {kpi.valeur}
                {kpi.unite === "pourcentage" && " %"}
              </p>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {/* `null` = pas d'historique. Afficher « stable » serait une
                    conclusion qu'on n'a pas les moyens de tirer. */}
                {kpi.variation === null ? (
                  <span>{t("aucuneVariation")}</span>
                ) : kpi.variation === 0 ? (
                  <span>—</span>
                ) : (
                  <span
                    className={cn(
                      "flex items-center gap-0.5",
                      kpi.variation > 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {kpi.variation > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {kpi.variation > 0 ? "+" : ""}
                    {Math.round(kpi.variation)}
                    {kpi.unite === "pourcentage" && " pts"}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">{t(`${kpi.cle}Aide`)}</p>
            </CardContent>
          );

          return kpi.lien ? (
            <Link key={kpi.cle} href={kpi.lien} className="block">
              <Card className={cn("h-full transition-colors hover:bg-muted/50", kpi.alerte && "border-amber-300 dark:border-amber-800")}>
                {contenu}
              </Card>
            </Link>
          ) : (
            <Card key={kpi.cle} className={cn("h-full", kpi.alerte && "border-amber-300 dark:border-amber-800")}>
              {contenu}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
