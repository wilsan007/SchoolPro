"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wand2, Loader2, Check, X, ArrowLeft, Info, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";

interface AreteProposee {
  competenceId: string;
  competenceCode: string;
  competenceLibelle: string;
  prerequisId: string;
  prerequisCode: string;
  prerequisLibelle: string;
  justification: string;
}

interface AreteEcartee {
  competenceCode: string;
  prerequisCode: string;
  motif: string;
}

/**
 * Revue des liaisons proposées par le modèle.
 *
 * CHAQUE ARÊTE EST UNE DÉCISION SÉPARÉE
 * -------------------------------------
 * Il n'y a pas de « tout accepter » en un clic, et c'est délibéré : un
 * prérequis erroné déclare des élèves bloqués à tort et déclenche des
 * parcours de remédiation inutiles. Le coût d'une relecture est très
 * inférieur à celui d'une remédiation injustifiée.
 *
 * Les liaisons écartées sont montrées avec leur motif. Ce n'est pas du
 * journal technique : « ce prérequis est enseigné après » signale souvent
 * que c'est l'ordre des chapitres qu'il faut corriger, pas la proposition.
 */
export function PrerequisProposes({ matiereId }: { matiereId: string }) {
  const t = useTranslations("learnos.prerequis");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();

  const [enCours, demarrer] = useTransition();
  const [proposees, setProposees] = useState<AreteProposee[] | null>(null);
  const [ecartees, setEcartees] = useState<AreteEcartee[]>([]);
  const [retenues, setRetenues] = useState<Set<string>>(new Set());
  const [modele, setModele] = useState<string | null>(null);

  const cle = (a: AreteProposee) => `${a.competenceId}|${a.prerequisId}`;

  function proposer() {
    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/prerequis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matiereId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        setProposees(data.proposees ?? []);
        setEcartees(data.ecartees ?? []);
        setModele(data.modele ?? null);
        // Rien n'est coché par défaut : accepter doit être un geste, pas un
        // oubli de décocher.
        setRetenues(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function appliquer() {
    if (!proposees || retenues.size === 0) return;
    const aretes = proposees
      .filter((a) => retenues.has(cle(a)))
      .map((a) => ({ competence: a.competenceCode, prerequis: a.prerequisCode }));

    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/prerequis", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matiereId, aretes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        toast.success(t("appliquees", { n: data.appliquees ?? 0 }));
        setProposees(null);
        setRetenues(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function basculer(a: AreteProposee) {
    setRetenues((prev) => {
      const s = new Set(prev);
      const k = cle(a);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });
  }

  if (proposees === null) {
    return (
      <Button variant="outline" size="sm" onClick={proposer} disabled={enCours}>
        {enCours ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="mr-1.5 h-4 w-4" />
        )}
        {t("proposer")}
      </Button>
    );
  }

  return (
    <Card className="border-l-4 border-l-fuchsia-500">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{t("titre")}</p>
            <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setProposees(null)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t("fermer")}
          </Button>
        </div>

        {proposees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("aucuneProposition")}
          </p>
        ) : (
          <ul className="space-y-2">
            {proposees.map((a) => {
              const coche = retenues.has(cle(a));
              return (
                <li key={cle(a)}>
                  <button
                    type="button"
                    aria-pressed={coche}
                    onClick={() => basculer(a)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      coche
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        coche ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"
                      )}
                    >
                      {coche && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm">
                        <span className="font-medium">{a.competenceLibelle}</span>
                        <span className="text-muted-foreground"> {t("exige")} </span>
                        <span className="font-medium">{a.prerequisLibelle}</span>
                      </span>
                      {a.justification && (
                        <span className="block text-xs text-muted-foreground">
                          {a.justification}
                        </span>
                      )}
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[11px]">
                          {a.competenceCode}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          ← {a.prerequisCode}
                        </Badge>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Les écartées disent pourquoi une liaison plausible a été refusée —
            parfois c'est le programme qu'il faut corriger. */}
        {ecartees.length > 0 && (
          <details className="rounded-lg border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
              {t("ecartees", { n: ecartees.length })}
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {ecartees.map((e, i) => (
                <li key={`${e.competenceCode}-${e.prerequisCode}-${i}`}>
                  {e.competenceCode} ← {e.prerequisCode} — {t(`motif_${e.motif}`)}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            {modele ? t("origine", { modele }) : t("origineInconnue")}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRetenues(new Set())}
              disabled={enCours || retenues.size === 0}
            >
              <X className="mr-1.5 h-4 w-4" />
              {t("toutDecocher")}
            </Button>
            <Button size="sm" onClick={appliquer} disabled={enCours || retenues.size === 0}>
              {enCours ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {t("appliquer", { n: retenues.size })}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
