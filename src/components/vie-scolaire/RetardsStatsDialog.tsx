"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Clock } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface ParEleve {
  eleveId: string;
  nom: string;
  prenom: string;
  classe: string | null;
  retards: number;
  dernierRetard: string;
}

interface RetardsData {
  totalRetards: number;
  parEleve: ParEleve[];
  parJour: { jour: number; retards: number }[];
}

const JOUR_KEYS: Record<number, string> = {
  0: "dim", 1: "lun", 2: "mar", 3: "mer", 4: "jeu", 5: "ven", 6: "sam",
};

export function RetardsStatsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("vieScolaire");
  const [data, setData] = useState<RetardsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/vie-scolaire/retards-stats")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open]);

  const maxRetardsJour = data ? Math.max(...data.parJour.map((j) => j.retards), 1) : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t("retardsStats")}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-3xl font-bold">{data.totalRetards}</p>
              <p className="text-sm text-muted-foreground">{t("totalRetards")}</p>
            </div>

            {data.parJour.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">{t("parJour")}</h3>
                <div className="flex items-end gap-2 h-32">
                  {data.parJour.map((j) => (
                    <div key={j.jour} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={cn("w-full rounded-t bg-blue-500 transition-all", j.retards === 0 && "bg-muted")}
                        style={{ height: `${(j.retards / maxRetardsJour) * 100}%`, minHeight: j.retards > 0 ? "4px" : "0" }}
                      />
                      <span className="text-xs text-muted-foreground">{JOUR_KEYS[j.jour]}</span>
                      <span className="text-xs font-medium">{j.retards}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2">{t("parEleve")}</h3>
              {data.parEleve.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("aucunRetard")}</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  <div className="flex items-center gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/50">
                    <span className="flex-1">{t("student")}</span>
                    <span className="w-20 text-center">{t("totalRetards")}</span>
                    <span className="w-28 text-right">{t("date")}</span>
                  </div>
                  {data.parEleve.map((e) => (
                    <div key={e.eleveId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{e.nom} {e.prenom}</span>
                        {e.classe && <span className="text-muted-foreground ml-2 text-xs">{e.classe}</span>}
                      </div>
                      <span className="w-20 text-center font-bold text-orange-600">{e.retards}</span>
                      <span className="w-28 text-right text-xs text-muted-foreground">{formatDate(e.dernierRetard, "dd/MM/yyyy")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">{t("aucunRetard")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
