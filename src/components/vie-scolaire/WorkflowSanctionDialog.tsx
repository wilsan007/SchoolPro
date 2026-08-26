"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, FileText, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Incident {
  id: string;
  type: string;
  statut: string;
  gravite: number;
  description: string;
  eleve: { id: string; nom: string; prenom: string };
}

export function WorkflowSanctionDialog({
  incident,
  open,
  onOpenChange,
}: {
  incident: Incident | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("vieScolaire");
  const [isPending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  if (!incident) return null;

  function runAction(action: "notifier-parents" | "convocation" | "escalade") {
    const confirmKey = action === "notifier-parents" ? "confirmNotifierParents" : action === "convocation" ? "confirmConvocation" : "confirmEscalade";
    if (!confirm(t(confirmKey))) return;
    setBusyAction(action);
    startTransition(async () => {
      try {
        const res = await fetch("/api/vie-scolaire/workflow-sanction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId: incident!.id, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("workflowError"));
        toast.success(t("workflowSuccess"));
        onOpenChange(false);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("workflowError"));
      } finally {
        setBusyAction(null);
      }
    });
  }

  const actions = [
    { id: "notifier-parents" as const, icon: Bell, labelKey: "notifierParents", color: "text-blue-600", bg: "hover:bg-blue-50" },
    { id: "convocation" as const, icon: FileText, labelKey: "convocationParents", color: "text-orange-600", bg: "hover:bg-orange-50" },
    { id: "escalade" as const, icon: TrendingUp, labelKey: "escalade", color: "text-red-600", bg: "hover:bg-red-50" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t("workflowSanction")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{incident.eleve.nom} {incident.eleve.prenom}</span>
              <Badge variant="destructive" className="text-xs">{t("gravityLevel", { val: incident.gravite, label: t(incident.gravite === 1 ? "low" : incident.gravite === 2 ? "medium" : "high") })}</Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{incident.description}</p>
          </div>

          <div className="space-y-2">
            {actions.map((a) => (
              <Button
                key={a.id}
                variant="outline"
                className={`w-full justify-start gap-3 h-auto py-3 ${a.bg}`}
                disabled={isPending}
                onClick={() => runAction(a.id)}
              >
                {busyAction === a.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <a.icon className={`w-5 h-5 ${a.color}`} />
                )}
                <span className="text-sm font-medium">{t(a.labelKey)}</span>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
