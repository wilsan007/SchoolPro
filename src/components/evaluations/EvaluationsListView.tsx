"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { DrillDownNavigator, type DrillDownItem } from "@/components/classes/DrillDownNavigator";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useLocale } from "next-intl";

export interface EvaluationData extends DrillDownItem {
  id: string;
  titre: string;
  classeNom: string;
  classeNiveau: string | null;
  matiereNom: string;
  coefficient: number;
  date: string;
  duree: number;
  type: string;
  statut: string;
  periodeNom: string;
  nbNotes: number;
}

export function EvaluationsListView({
  evaluations,
  hierarchie,
}: {
  evaluations: EvaluationData[];
  hierarchie?: ClassesHierarchie;
}) {
  const t = useTranslations("evaluations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dateLocale = locale === "en" ? undefined : fr;

  function getTypeColor(type: string) {
    switch (type) {
      case "CONTROLE": return "bg-cyan-500 hover:bg-cyan-600";
      case "DEVOIR": return "bg-orange-500 hover:bg-orange-600";
      case "EXAMEN": return "bg-red-500 hover:bg-red-600";
      default: return "bg-blue-500 hover:bg-blue-600";
    }
  }

  const renderTable = (items: EvaluationData[]) => (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="bg-[#0f4c75] dark:bg-gray-800 text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("colTitle")}</th>
              <th className="px-4 py-3 font-semibold">{t("colClass")}</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">{t("colLevel")}</th>
              <th className="px-4 py-3 font-semibold">{t("colSubject")}</th>
              <th className="px-4 py-3 font-semibold">{t("colDate")}</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">{t("colDuration")}</th>
              <th className="px-4 py-3 font-semibold hidden md:table-cell">{t("colCoef")}</th>
              <th className="px-4 py-3 font-semibold">{t("colType")}</th>
              <th className="px-4 py-3 font-semibold hidden sm:table-cell">{t("colStatus")}</th>
              <th className="px-4 py-3 font-semibold hidden lg:table-cell">{t("colPeriod")}</th>
              <th className="px-4 py-3 font-semibold text-center hidden sm:table-cell">{t("colNotes")}</th>
              <th className="px-4 py-3 font-semibold text-center">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((ev, idx) => (
              <tr key={ev.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/50"}>
                <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-100 truncate max-w-[160px]">{ev.titre}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ev.classeNom}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <Badge className="bg-orange-500 hover:bg-orange-600">{ev.classeNiveau ?? tc("defaultLevel")}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[140px]">{ev.matiereNom}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Coef: {ev.coefficient}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  <div className="font-medium">{format(new Date(ev.date), "dd/MM/yyyy", { locale: dateLocale })}</div>
                  <div className="text-xs">{format(new Date(ev.date), "HH:mm", { locale: dateLocale })}</div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{ev.duree} min</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {ev.coefficient.toFixed(1)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className={getTypeColor(ev.type)}>{ev.type}</Badge>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <Badge className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 border-none">
                    {ev.statut === "PLANIFIE" ? t("statusPlanned") : t("statusCompleted")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{ev.periodeNom}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <Badge className={ev.nbNotes > 0 ? "bg-green-500" : "bg-orange-500"}>
                    {ev.nbNotes}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <Link href={`/evaluations/${ev.id}`}>
                      <Button className="bg-[#10b981] hover:bg-[#059669] text-white gap-1.5 h-8 px-3 text-xs font-semibold shadow-sm border-none">
                        <PenLine className="h-3.5 w-3.5" />
                        {t("enterGrades")}
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {t("noExams")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!hierarchie) {
    return renderTable(evaluations);
  }

  return (
    <DrillDownNavigator<EvaluationData>
      hierarchie={hierarchie}
      items={evaluations}
      groupByMatiere
      emptyLabel={t("noExams")}
      renderItems={(filtered) => renderTable(filtered)}
    />
  );
}
