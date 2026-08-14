"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Route, Sparkles, Check, X, Loader2, CalendarClock, User,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";
import { TexteRegle } from "@/components/learnos/TexteRegle";

export interface PlanAValider {
  id: string;
  type: string;
  motif: string;
  regleDeclenchee: string;
  motifParams: unknown;
  dateRevue: string | Date | null;
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string } | null };
  matiere: { nom: string } | null;
  etapes: {
    id: string;
    ordre: number;
    action: string;
    responsable: string;
    echeance: string | Date | null;
    competence: { libelle: string };
  }[];
}

/**
 * Parcours en attente de décision.
 *
 * Placés **avant** les recommandations : engager un accompagnement est une
 * décision plus lourde qu'accepter une suggestion isolée, et elle porte sur
 * plusieurs semaines. La noyer au milieu d'une liste la ferait manquer.
 */
export function PlansAValider({ plans }: { plans: PlanAValider[] }) {
  const t = useTranslations("learnos.plans");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [traites, setTraites] = useState<Set<string>>(new Set());

  const restants = plans.filter((p) => !traites.has(p.id));
  if (restants.length === 0) return null;

  function decider(id: string, action: "valider" | "refuser") {
    demarrer(async () => {
      try {
        const res = await fetch(`/api/learnos/plans/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        setTraites((s) => new Set(s).add(id));
        toast.success(t(action === "valider" ? "valide" : "refuse"));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        <Route className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {t("titre")}
            <Badge variant="secondary">{restants.length}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
        </div>
      </div>

      {restants.map((plan) => {
        const approfondissement = plan.type === "approfondissement";
        return (
          <Card
            key={plan.id}
            className={cn(
              "border-l-4",
              approfondissement ? "border-l-violet-500" : "border-l-indigo-500"
            )}
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {approfondissement ? (
                  <Sparkles className="h-4 w-4 text-violet-600" />
                ) : (
                  <Route className="h-4 w-4 text-indigo-600" />
                )}
                <Link
                  href={`/eleves/${plan.eleve.id}`}
                  className="font-medium hover:underline"
                >
                  {plan.eleve.prenom} {plan.eleve.nom}
                </Link>
                {plan.eleve.classe && (
                  <Badge variant="outline">{plan.eleve.classe.nom}</Badge>
                )}
                {plan.matiere && <Badge variant="secondary">{plan.matiere.nom}</Badge>}
                <Badge variant={approfondissement ? "secondary" : "outline"}>
                  {t(approfondissement ? "typeApprofondissement" : "typeRemediation")}
                </Badge>
              </div>

              <p className="text-sm">
                <TexteRegle
                  regle={plan.regleDeclenchee}
                  params={plan.motifParams}
                  secours={plan.motif}
                />
              </p>

              {/* Les étapes sont montrées AVANT la décision : on ne demande pas
                  d'engager un accompagnement sans dire ce qu'il contient. */}
              <ol className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                {plan.etapes
                  .slice()
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((e, i) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{i + 1}.</span>
                      <span className="font-medium">{e.competence.libelle}</span>
                      <span className="text-muted-foreground">— {e.action}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {t(`responsable_${e.responsable}`)}
                        {e.echeance && (
                          <>
                            {" · "}
                            <CalendarClock className="h-3 w-3" />
                            {new Date(e.echeance).toLocaleDateString()}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
              </ol>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {plan.dateRevue &&
                    t("pointEtape", {
                      date: new Date(plan.dateRevue).toLocaleDateString(),
                    })}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => decider(plan.id, "valider")}
                    disabled={enCours}
                  >
                    {enCours ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-4 w-4" />
                    )}
                    {t("engager")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decider(plan.id, "refuser")}
                    disabled={enCours}
                    title={t("ecarterAide")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">{t("noteBas")}</p>
    </section>
  );
}
