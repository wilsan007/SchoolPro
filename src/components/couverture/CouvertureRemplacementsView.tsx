"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { DrillDownNavigator, type DrillDownItem } from "@/components/classes/DrillDownNavigator";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface RemplacementData extends DrillDownItem {
  id: string;
  classeNom: string;
  matiereNom: string;
  enseignantAbsentNom: string | null;
  enseignantRemplacantNom: string | null;
  statut: string;
}

export function CouvertureRemplacementsView({
  remplacements,
  hierarchie,
}: {
  remplacements: RemplacementData[];
  hierarchie?: ClassesHierarchie;
}) {
  const t = useTranslations("couverture");

  if (!hierarchie) {
    // Fallback: affichage en vrac (comportement original)
    return (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t("classe")}</th>
                  <th className="px-4 py-3 font-medium">{t("matiere")}</th>
                  <th className="px-4 py-3 font-medium">{t("absent")}</th>
                  <th className="px-4 py-3 font-medium">{t("remplacant")}</th>
                  <th className="px-4 py-3 font-medium">{t("statut")}</th>
                </tr>
              </thead>
              <tbody>
                {remplacements.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{r.classeNom}</td>
                    <td className="px-4 py-3">{r.matiereNom}</td>
                    <td className="px-4 py-3">{r.enseignantAbsentNom ?? "—"}</td>
                    <td className="px-4 py-3">{r.enseignantRemplacantNom ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {r.statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <DrillDownNavigator<RemplacementData>
      hierarchie={hierarchie}
      items={remplacements}
      groupByMatiere
      emptyLabel={t("aucunRemplacement")}
      renderItems={(filtered) => (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t("classe")}</th>
                    <th className="px-4 py-3 font-medium">{t("matiere")}</th>
                    <th className="px-4 py-3 font-medium">{t("absent")}</th>
                    <th className="px-4 py-3 font-medium">{t("remplacant")}</th>
                    <th className="px-4 py-3 font-medium">{t("statut")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3">{r.classeNom}</td>
                      <td className="px-4 py-3">{r.matiereNom}</td>
                      <td className="px-4 py-3">{r.enseignantAbsentNom ?? "—"}</td>
                      <td className="px-4 py-3">{r.enseignantRemplacantNom ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {r.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
