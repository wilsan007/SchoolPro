"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, GraduationCap, ArrowRight, Users, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { cn } from "@/lib/utils";
import {
  previewPromotionCampagne,
  executerPromotionCampagne,
} from "@/app/(dashboard)/parametres/reinscription/actions";

interface PromotionEleve {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  action: "promouvoir" | "redoubler" | "diplome";
}

interface PromotionClasse {
  classeId: string;
  classeNom: string;
  niveau: string;
  niveauSuivant: string | null;
  effectif: number;
  eleves: PromotionEleve[];
}

export function PromotionPreview({
  campagneId,
  anneeSource,
  anneeCible,
  isAdmin,
  onExecuted,
}: {
  campagneId: string;
  anneeSource: string;
  anneeCible: string;
  isAdmin: boolean;
  onExecuted: () => void;
}) {
  const t = useTranslations("reinscription");
  const libelleNiveau = useLibelleNiveau();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PromotionClasse[]>([]);
  const [decisions, setDecisions] = useState<Record<string, "promouvoir" | "redoubler" | "diplome">>({});
  const [executed, setExecuted] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      try {
        const result = await previewPromotionCampagne(campagneId);
        setPreview(result as PromotionClasse[]);
        // Initialiser les décisions avec les valeurs par défaut
        const initial: Record<string, "promouvoir" | "redoubler" | "diplome"> = {};
        for (const classe of result as PromotionClasse[]) {
          for (const eleve of classe.eleves) {
            initial[eleve.id] = eleve.action;
          }
        }
        setDecisions(initial);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      } finally {
        setLoading(false);
      }
    });
  }, [campagneId, t]);

  function setDecision(eleveId: string, decision: "promouvoir" | "redoubler" | "diplome") {
    setDecisions((p) => ({ ...p, [eleveId]: decision }));
  }

  function setAllForClasse(classe: PromotionClasse, decision: "promouvoir" | "redoubler" | "diplome") {
    setDecisions((p) => {
      const next = { ...p };
      for (const eleve of classe.eleves) {
        next[eleve.id] = decision;
      }
      return next;
    });
  }

  async function handleExecute() {
    if (!confirm(t("step3.confirmExecute"))) return;
    startTransition(async () => {
      try {
        const result = await executerPromotionCampagne(campagneId, decisions);
        toast.success(t("step3.executed", { diplomes: result.nbDiplomes }));
        setExecuted(true);
        setTimeout(onExecuted, 1500);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  // Statistiques
  const stats = {
    promouvoir: Object.values(decisions).filter((d) => d === "promouvoir").length,
    redoubler: Object.values(decisions).filter((d) => d === "redoubler").length,
    diplome: Object.values(decisions).filter((d) => d === "diplome").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (executed) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <p className="font-medium">{t("step3.success")}</p>
      </div>
    );
  }

  if (preview.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        {t("step3.noClasses")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.promouvoir}</div>
          <div className="text-xs text-muted-foreground">{t("step3.promote")}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.redoubler}</div>
          <div className="text-xs text-muted-foreground">{t("step3.repeat")}</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-violet-600">{stats.diplome}</div>
          <div className="text-xs text-muted-foreground">{t("step3.graduate")}</div>
        </div>
      </div>

      {/* Matrice par classe */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
        {preview.map((classe) => (
          <div key={classe.classeId} className="rounded-lg border overflow-hidden">
            {/* En-tête classe */}
            <div className="flex items-center justify-between bg-muted/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{classe.classeNom}</span>
                <Badge variant="outline" className="text-xs">{libelleNiveau(classe.niveau)}</Badge>
                {classe.niveauSuivant && (
                  <>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs">{classe.niveauSuivant}</Badge>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{classe.effectif} {t("students")}</span>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAllForClasse(classe, "promouvoir")}>
                      {t("step3.allPromote")}
                    </Button>
                    {classe.niveauSuivant && classe.niveauSuivant !== "Diplômé" && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAllForClasse(classe, "redoubler")}>
                        {t("step3.allRepeat")}
                      </Button>
                    )}
                    {classe.niveauSuivant === "Diplômé" && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAllForClasse(classe, "diplome")}>
                        {t("step3.allGraduate")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Liste élèves */}
            <div className="divide-y">
              {classe.eleves.map((eleve) => {
                const decision = decisions[eleve.id] ?? eleve.action;
                return (
                  <div key={eleve.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{eleve.prenom} {eleve.nom}</span>
                      <span className="text-xs text-muted-foreground font-mono">{eleve.matricule}</span>
                    </div>
                    {isAdmin ? (
                      <div className="flex gap-1 shrink-0">
                        <DecisionButton
                          active={decision === "promouvoir"}
                          onClick={() => setDecision(eleve.id, "promouvoir")}
                          color="green"
                          label={t("step3.promote")}
                        />
                        <DecisionButton
                          active={decision === "redoubler"}
                          onClick={() => setDecision(eleve.id, "redoubler")}
                          color="amber"
                          label={t("step3.repeat")}
                        />
                        <DecisionButton
                          active={decision === "diplome"}
                          onClick={() => setDecision(eleve.id, "diplome")}
                          color="violet"
                          label={t("step3.graduate")}
                        />
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {t(`step3.${decision}`)}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bouton exécuter */}
      {isAdmin && (
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={handleExecute} disabled={isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
            {t("step3.execute")}
          </Button>
        </div>
      )}
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  color,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: "green" | "amber" | "violet";
  label: string;
}) {
  const colors = {
    green: "border-green-500 bg-green-500/10 text-green-700",
    amber: "border-amber-500 bg-amber-500/10 text-amber-700",
    violet: "border-violet-500 bg-violet-500/10 text-violet-700",
  };
  const inactive = "border-muted-foreground/20 text-muted-foreground hover:bg-muted/30";

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md border text-xs font-medium transition-all",
        active ? colors[color] : inactive
      )}
    >
      {label}
    </button>
  );
}
