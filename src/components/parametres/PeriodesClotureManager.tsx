"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

interface Periode {
  id: string;
  nom: string;
  numero: number;
  dateDebut: string;
  dateFin: string;
  isCurrent: boolean;
  statut: string;
  cloturedAt: string | null;
  dateLimiteSaisie: string | null;
}

export function PeriodesClotureManager({ periodes: initial }: { periodes: Periode[] }) {
  const t = useTranslations("periodes");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : fr;
  const [periodes, setPeriodes] = useState(initial);
  const [isPending, startTransition] = useTransition();

  async function toggleCloture(periode: Periode) {
    const newStatut = periode.statut === "CLOTUREE" ? "OUVERTE" : "CLOTUREE";
    startTransition(async () => {
      try {
        const res = await fetch("/api/parametres/periodes-cloture", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodeId: periode.id,
            statut: newStatut,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? t("error"));
        }
        setPeriodes((prev) =>
          prev.map((p) =>
            p.id === periode.id
              ? { ...p, statut: newStatut, cloturedAt: newStatut === "CLOTUREE" ? new Date().toISOString() : null }
              : p
          )
        );
        toast.success(newStatut === "CLOTUREE" ? t("closedSuccess") : t("reopenedSuccess"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {periodes.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.nom}</span>
                {p.isCurrent && <Badge variant="default" className="text-xs">{t("current")}</Badge>}
                <Badge variant={p.statut === "CLOTUREE" ? "destructive" : "secondary"} className="text-xs">
                  {p.statut === "CLOTUREE" ? t("closed") : t("open")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(p.dateDebut), "dd/MM/yyyy", { locale: dateLocale })} — {format(new Date(p.dateFin), "dd/MM/yyyy", { locale: dateLocale })}
                {p.cloturedAt && ` · ${t("closedOn")} ${format(new Date(p.cloturedAt), "dd/MM/yyyy", { locale: dateLocale })}`}
              </div>
            </div>
            <Button
              variant={p.statut === "CLOTUREE" ? "outline" : "destructive"}
              size="sm"
              onClick={() => toggleCloture(p)}
              disabled={isPending}
              className="gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : p.statut === "CLOTUREE" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {p.statut === "CLOTUREE" ? t("reopen") : t("close")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
