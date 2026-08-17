"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

/**
 * Tableau des scénarios de remédiation priorisés par ROI.
 *
 * Le tableau est trié par ROI décroissant (le scénario le plus rentable
 * pédagogiquement en premier). Sur mobile, le conteneur défile
 * horizontalement (`overflow-x-auto min-w-[640px]`) pour garder les cinq
 * colonnes lisibles sur 375px.
 */

export interface ScenarioRemediation {
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  elevesConcernes: number;
  elevesSauvesEstime: number;
  competencesLiberees: number;
  coutEstime: number;
  roi: number;
  deltaMoyenApplique: number;
  typeIntervention: string;
}

export interface TableauScenariosProps {
  scenarios: ScenarioRemediation[];
  /** Devise du tenant (défaut DJF). */
  devise?: string;
}

/** Couleur du badge ROI selon l'ordre (le 1er est mis en avant). */
function badgeRoi(index: number): string {
  if (index === 0) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  if (index < 3) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  }
  return "bg-muted text-muted-foreground";
}

export function TableauScenarios({ scenarios, devise = "DJF" }: TableauScenariosProps) {
  const t = useTranslations("directionIntelligence");
  // Tri par ROI décroissant (sécurité : l'API renvoie déjà scenariosPriorises).
  const tries = React.useMemo(
    () => [...scenarios].sort((a, b) => b.roi - a.roi),
    [scenarios]
  );

  if (tries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("aucunScenario")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[640px] w-full text-sm sm:text-base">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-muted-foreground">{t("colCompetence")}</th>
            <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-muted-foreground">{t("colElevesConcernes")}</th>
            <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-muted-foreground">{t("colElevesSauves")}</th>
            <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-muted-foreground">{t("colCout")}</th>
            <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-muted-foreground">{t("colROI")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tries.map((s, i) => (
            <tr key={s.competenceId} className="hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5">
                <div className="font-medium text-foreground leading-tight">
                  {s.competenceLibelle}
                </div>
                <div className="text-xs text-muted-foreground">
                  {s.matiereNom}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {s.elevesConcernes}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {s.elevesSauvesEstime}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {formatCurrency(s.coutEstime, devise)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                    badgeRoi(i)
                  )}
                >
                  {i === 0 && <TrendingUp className="h-3 w-3" />}
                  {s.roi.toFixed(2)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
