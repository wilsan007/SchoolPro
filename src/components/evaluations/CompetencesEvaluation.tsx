"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, Loader2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";

interface Disponible {
  id: string;
  code: string;
  libelle: string;
  chapitre: { nom: string; niveau: string } | null;
}

interface Rattachement {
  competenceId: string;
  poids: number;
  competence: { code: string; libelle: string };
}

/**
 * Rattache une évaluation aux compétences qu'elle mesure.
 *
 * Sans ce rattachement, les notes de cette évaluation ne produisent qu'une
 * preuve de granularité « matière » : aucun profil de maîtrise n'est constitué,
 * donc aucune recommandation ne peut être émise. Le composant le dit
 * explicitement plutôt que de laisser l'enseignant deviner l'enjeu.
 */
export function CompetencesEvaluation({
  evaluationId,
  peutModifier,
}: {
  evaluationId: string;
  peutModifier: boolean;
}) {
  const t = useTranslations("learnos.competencesEvaluation");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [enCours, demarrer] = useTransition();

  const [disponibles, setDisponibles] = useState<Disponible[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [initiales, setInitiales] = useState<Set<string>>(new Set());

  useEffect(() => {
    let annule = false;
    fetch(`/api/curriculum/evaluations/${evaluationId}/competences`)
      .then((r) => r.json())
      .then((d: { rattachements?: Rattachement[]; disponibles?: Disponible[] }) => {
        if (annule) return;
        const ids = new Set((d.rattachements ?? []).map((r) => r.competenceId));
        setDisponibles(d.disponibles ?? []);
        setSelection(ids);
        setInitiales(ids);
      })
      .catch(() => !annule && toast.error(t("chargementImpossible")))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [evaluationId, t]);

  const modifie =
    selection.size !== initiales.size ||
    [...selection].some((id) => !initiales.has(id));

  function basculer(id: string) {
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function enregistrer() {
    demarrer(async () => {
      try {
        const res = await fetch(`/api/curriculum/evaluations/${evaluationId}/competences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            competences: [...selection].map((competenceId) => ({
              competenceId,
              // Répartition égale : une évaluation qui mesure trois compétences
              // ne pèse pas son poids entier sur chacune.
              poids: selection.size > 0 ? Number((1 / selection.size).toFixed(4)) : 1,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        setInitiales(new Set(selection));
        toast.success(
          selection.size === 0
            ? t("rattachementRetire")
            : t("rattachees_toast", { n: selection.size })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer py-3" onClick={() => setOuvert((o) => !o)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-fuchsia-500" />
            <CardTitle className="text-base">{t("titre")}</CardTitle>
            {!chargement && (
              <Badge variant={initiales.size > 0 ? "secondary" : "outline"}>
                {initiales.size > 0 ? t("rattachees", { n: initiales.size }) : t("aucune")}
              </Badge>
            )}
          </div>
          {ouvert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>

      {ouvert && (
        <CardContent className="space-y-4 pt-0">
          {chargement ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : disponibles.length === 0 ? (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <Info className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-amber-900 dark:text-amber-200">
                {t("aucuneDisponible")}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("enjeu")}
              </p>

              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                {disponibles.map((c) => {
                  const choisie = selection.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded p-2 text-sm hover:bg-muted",
                        !peutModifier && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={choisie}
                        disabled={!peutModifier || enCours}
                        onChange={() => basculer(c.id)}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {c.code}
                          </Badge>
                          <span className="font-medium">{c.libelle}</span>
                        </span>
                        {c.chapitre && (
                          <span className="block text-xs text-muted-foreground">
                            {c.chapitre.nom} · {c.chapitre.niveau}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              {peutModifier && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {selection.size > 1 && t("repartitionPoids", { n: selection.size })}
                  </p>
                  <Button size="sm" onClick={enregistrer} disabled={!modifie || enCours}>
                    {enCours && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {tc("enregistrer")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
