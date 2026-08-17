"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calculator, CheckCircle, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

export function BilanAnnuelManager({ classes, anneeId }: { classes: any[]; anneeId?: string }) {
  const t = useTranslations("bulletins");
  const [selectedClasse, setSelectedClasse] = useState<string>(classes[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [bilans, setBilans] = useState<any[]>([]);

  const genererBilan = async () => {
    if (!selectedClasse) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/annuel?classeId=${selectedClasse}`);
      const data = await res.json();
      if (res.ok) {
        setBilans(data.bilans || []);
        toast.success(t("annualSuccess"));
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error(t("errAnnualCalc"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{t("annualGenTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("annualGenDesc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 max-w-sm">
              <label className="text-sm font-medium mb-1.5 block">{t("selectClassLabel")}</label>
              <Select value={selectedClasse} onValueChange={setSelectedClasse}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClass")} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={genererBilan} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              {t("calculateAnnual")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {bilans.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base font-semibold">{t("annualResults")}</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.success(t("validateArchive"))}>
              <CheckCircle className="h-4 w-4 text-green-500" />
              {t("validateArchive")}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[640px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t("student")}</th>
                    <th className="px-4 py-3 font-medium text-center">{t("annualRank")}</th>
                    <th className="px-4 py-3 font-medium text-center">{t("annualAverage")}</th>
                    <th className="px-4 py-3 font-medium">{t("proposedDecision")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bilans.map(b => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{b.nom} {b.prenom}</td>
                      <td className="px-4 py-3 text-center font-semibold">{b.rangAnnuel ? `${b.rangAnnuel}${b.rangAnnuel === 1 ? 'er' : 'ème'}` : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {b.moyenneAnnuelle ? (
                          <Badge variant={b.moyenneAnnuelle >= 10 ? "success" : "destructive"}>
                            {b.moyenneAnnuelle.toFixed(2)}/20
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic">{t("insufficient")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={b.decisionProposee === "PASSAGE" ? "default" : "destructive"}>
                          {b.decisionProposee}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {anneeId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => window.open(`/bulletin-annuel/${b.id}/${anneeId}`, "_blank")}
                            title={t("viewAnnualReport")}
                          >
                            <Eye className="h-4 w-4" />
                            {t("reportCard")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
