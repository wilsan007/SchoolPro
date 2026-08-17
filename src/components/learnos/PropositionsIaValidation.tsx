"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, CheckCircle2, XCircle, Eye, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface PropositionResume {
  id: string;
  type: "plan_lecon" | "rubrique";
  competenceId: string;
  competenceLibelle: string;
  matiereNom: string;
  statut: string;
  titre: string;
  proposePar: string | null;
  ajustePar: string | null;
  validePar: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Liste et validation des propositions IA (plans de leçon + rubriques).
 *
 * Workflow :
 *   PROPOSE → l'enseignant ajuste → AJUSTE
 *   AJUSTE  → la direction valide → VALIDE
 *   N'importe quelle étape peut rejeter → REJETE
 */
export function PropositionsIaValidation({
  canValidate,
}: {
  /** `true` si l'utilisateur peut valider (direction). */
  canValidate: boolean;
}) {
  const t = useTranslations("learnos.propositionsIa");
  const [propositions, setPropositions] = useState<{
    plans: PropositionResume[];
    rubriques: PropositionResume[];
  }>({ plans: [], rubriques: [] });
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState<string>("");
  const [rejetDialog, setRejetDialog] = useState<{
    type: "plan_lecon" | "rubrique";
    id: string;
  } | null>(null);
  const [motifRejet, setMotifRejet] = useState("");

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const params = filtreStatut ? `?statut=${filtreStatut}` : "";
      const res = await fetch(`/api/learnos/propositions${params}`);
      if (res.ok) {
        const data = await res.json();
        setPropositions(data);
      }
    } finally {
      setLoading(false);
    }
  }, [filtreStatut]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function valider(type: "plan_lecon" | "rubrique", id: string) {
    const endpoint =
      type === "plan_lecon"
        ? `/api/learnos/plans-lecon/${id}/valider`
        : `/api/learnos/rubriques/${id}/valider`;

    const res = await fetch(endpoint, { method: "POST" });
    if (res.ok) charger();
  }

  async function rejeter() {
    if (!rejetDialog || !motifRejet.trim()) return;

    const endpoint =
      rejetDialog.type === "plan_lecon"
        ? `/api/learnos/plans-lecon/${rejetDialog.id}/rejeter`
        : `/api/learnos/rubriques/${rejetDialog.id}/rejeter`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motif: motifRejet }),
    });

    if (res.ok) {
      setRejetDialog(null);
      setMotifRejet("");
      charger();
    }
  }

  const statutBadge = (statut: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
      PROPOSE: { variant: "secondary", icon: Clock },
      AJUSTE: { variant: "outline", icon: Eye },
      VALIDE: { variant: "default", icon: CheckCircle2 },
      REJETE: { variant: "destructive", icon: XCircle },
    };
    const c = config[statut] ?? config.PROPOSE;
    const Icon = c.icon;
    return (
      <Badge variant={c.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {t(`statut.${statut}`)}
      </Badge>
    );
  };

  const toutes = [...propositions.plans, ...propositions.rubriques].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["", "PROPOSE", "AJUSTE", "VALIDE", "REJETE"].map((s) => (
          <Button
            key={s}
            variant={filtreStatut === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltreStatut(s)}
          >
            {s ? t(`statut.${s}`) : t("tous")}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("chargement")}</p>
      ) : toutes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("aucune")}</p>
          </CardContent>
        </Card>
      ) : (
        toutes.map((p) => (
          <Card key={`${p.type}-${p.id}`}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.titre}</span>
                  {statutBadge(p.statut)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.matiereNom} — {p.competenceLibelle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(p.type === "plan_lecon" ? "type.plan" : "type.rubrique")} ·{" "}
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex gap-2">
                {p.statut === "PROPOSE" && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/learnos/propositions/${p.type}/${p.id}`}>
                      {t("ajuster")}
                    </a>
                  </Button>
                )}
                {p.statut === "AJUSTE" && canValidate && (
                  <>
                    <Button size="sm" onClick={() => valider(p.type, p.id)}>
                      <CheckCircle2 className="h-4 w-4" />
                      {t("valider")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejetDialog({ type: p.type, id: p.id })}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {p.statut === "VALIDE" && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/learnos/propositions/${p.type}/${p.id}`}>
                      {t("voir")}
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!rejetDialog} onOpenChange={(o) => !o && setRejetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("motifRejet")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={motifRejet}
            onChange={(e) => setMotifRejet(e.target.value)}
            placeholder={t("motifRejetPlaceholder")}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejetDialog(null)}>
              {t("annuler")}
            </Button>
            <Button variant="destructive" onClick={rejeter} disabled={!motifRejet.trim()}>
              {t("rejeter")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
