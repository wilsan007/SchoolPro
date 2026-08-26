"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Gavel, Ban, Loader2, Clock } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface TimelineItem {
  type: "incident" | "sanction" | "exclusion";
  id: string;
  date: string;
  nature?: string;
  description?: string | null;
  gravite?: number;
  statut?: string;
  sanctionType?: string;
  dateDebut?: string;
  dateFin?: string | null;
  rapportePar?: string | null;
  resoluPar?: string | null;
  actionPrise?: string | null;
  decideePar?: string | null;
}

interface Stats {
  totalIncidents: number;
  incidentsOuverts: number;
  incidentsResolus: number;
  totalSanctions: number;
  exclusionsEnCours: number;
  graviteMoyenne: number;
}

interface HistoriqueData {
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string } | null };
  timeline: TimelineItem[];
  stats: Stats;
}

const GRAVITE_COLOR: Record<number, string> = {
  1: "text-yellow-600 bg-yellow-50 border-yellow-200",
  2: "text-orange-600 bg-orange-50 border-orange-200",
  3: "text-red-600 bg-red-50 border-red-200",
};

const TYPE_KEYS: Record<string, string> = {
  RETARD: "typeRetard", BAVARDAGE: "typeBavardage", INSOLENCE: "typeInsolence",
  BAGARRE: "typeBagarre", TRICHE: "typeTriche", VANDALISM: "typeVandalism",
  ABSENTEISME: "typeAbsentéisme", AUTRE: "typeAutre",
};

const SANCTION_KEYS: Record<string, string> = {
  AVERTISSEMENT: "sanctionAvertissement", BLAME: "sanctionBlame", EXCLUSION_COURS: "sanctionExclusionCours",
  EXCLUSION_TEMP: "sanctionExclusionTemp", CONVOCATION_PARENTS: "sanctionConvocationParents",
  TRAVAUX_INTERET_GENERAL: "sanctionTIG", AUTRE: "sanctionAutre",
};

export function HistoriqueDisciplinaireDialog({
  eleveId,
  eleveNom,
  open,
  onOpenChange,
}: {
  eleveId: string;
  eleveNom: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("vieScolaire");
  const [data, setData] = useState<HistoriqueData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !eleveId) return;
    setLoading(true);
    fetch(`/api/vie-scolaire/historique-disciplinaire?eleveId=${eleveId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, eleveId]);

  const statCards = data ? [
    { label: t("totalIncidents"), value: data.stats.totalIncidents, color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-50 dark:bg-gray-800" },
    { label: t("incidentsOuverts"), value: data.stats.incidentsOuverts, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
    { label: t("incidentsResolus"), value: data.stats.incidentsResolus, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
    { label: t("totalSanctions"), value: data.stats.totalSanctions, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/20" },
    { label: t("exclusionsEnCours"), value: data.stats.exclusionsEnCours, color: "text-red-700", bg: "bg-red-100 dark:bg-red-950/30" },
    { label: t("graviteMoyenne"), value: data.stats.graviteMoyenne, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/20" },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t("historiqueDisciplinaire")} — {eleveNom}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {statCards.map((s) => (
                <div key={s.label} className={cn("rounded-lg p-3 text-center", s.bg)}>
                  <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">{t("timeline")}</h3>
              {data.timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("aucunHistorique")}</p>
              ) : (
                <div className="space-y-3">
                  {data.timeline.map((item) => {
                    const icon = item.type === "incident" ? AlertTriangle : item.type === "sanction" ? Gavel : Ban;
                    const Icon = icon;
                    const iconColor = item.type === "incident" ? "text-red-500" : item.type === "sanction" ? "text-orange-500" : "text-red-700";
                    return (
                      <div key={`${item.type}-${item.id}`} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-muted", iconColor)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {data.timeline.indexOf(item) < data.timeline.length - 1 && (
                            <div className="w-px h-full bg-border flex-1 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium capitalize">{item.type}</span>
                            {item.gravite != null && (
                              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", GRAVITE_COLOR[item.gravite] ?? GRAVITE_COLOR[1])}>
                                {t("gravityLevel", { val: item.gravite, label: t(item.gravite === 1 ? "low" : item.gravite === 2 ? "medium" : "high") })}
                              </span>
                            )}
                            {item.statut && (
                              <Badge variant="outline" className="text-xs">{item.statut}</Badge>
                            )}
                            {item.sanctionType && (
                              <Badge variant="warning" className="text-xs">{t(SANCTION_KEYS[item.sanctionType] ?? "sanctionAutre")}</Badge>
                            )}
                            <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                              <Clock className="w-3 h-3" />
                              {formatDate(item.date, "dd/MM/yyyy")}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          )}
                          {item.nature && item.type === "incident" && (
                            <p className="text-xs text-muted-foreground">{t(TYPE_KEYS[item.nature] ?? "typeAutre")}</p>
                          )}
                          {item.rapportePar && (
                            <p className="text-xs text-muted-foreground mt-1">👤 {item.rapportePar}</p>
                          )}
                          {item.actionPrise && (
                            <p className="text-xs text-green-600 mt-1">✓ {item.actionPrise}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">{t("aucunHistorique")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
