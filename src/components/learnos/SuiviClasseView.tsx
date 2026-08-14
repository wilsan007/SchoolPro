"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Users, Route, Info, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SyntheseClasse } from "@/lib/learnos/suivi-classe";

/**
 * Vue du professeur principal.
 *
 * Les élèves à surveiller remontent en tête : une liste alphabétique de trente
 * noms enterrerait les trois qui comptent.
 */
export function SuiviClasseView({ synthese }: { synthese: SyntheseClasse }) {
  const t = useTranslations("learnos.classe");

  const tries = [...synthese.eleves].sort(
    (a, b) => b.signaux.length - a.signaux.length
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-2xl font-semibold">
              <Users className="h-5 w-5 text-muted-foreground" />
              {synthese.effectif}
            </p>
            <p className="text-xs text-muted-foreground">{t("effectif")}</p>
          </CardContent>
        </Card>
        <Card className={cn(synthese.aSurveiller > 0 && "border-amber-300 dark:border-amber-800")}>
          <CardContent className="p-4">
            <p className={cn("text-2xl font-semibold", synthese.aSurveiller > 0 && "text-amber-600")}>
              {synthese.aSurveiller}
            </p>
            <p className="text-xs text-muted-foreground">{t("aSurveiller")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-2xl font-semibold">
              <Route className="h-5 w-5 text-muted-foreground" />
              {synthese.parcoursActifs}
            </p>
            <p className="text-xs text-muted-foreground">{t("parcours")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Où porter l'effort collectif, avant le suivi individuel. */}
      {synthese.competencesFaibles.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="font-medium">{t("competencesFaibles")}</p>
            <ul className="space-y-1 text-sm">
              {synthese.competencesFaibles.map((c) => (
                <li key={c.competenceId} className="flex items-center justify-between gap-3">
                  <span>{c.libelle}</span>
                  <Badge variant="outline">{t("nbElevesConcernes", { n: c.nbEleves })}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-blue-900 dark:text-blue-200">{t("pourquoiCumul")}</p>
      </div>

      <div className="space-y-2">
        {tries.map((e) => (
          <Card
            key={e.id}
            className={cn("border-l-4", e.aSurveiller ? "border-l-amber-500" : "border-l-transparent")}
          >
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {e.aSurveiller && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                  <span className="font-medium">{e.prenom} {e.nom}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {e.signaux.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("aucunSignal")}</span>
                  ) : (
                    e.signaux.map((s) => (
                      <Badge
                        key={s.type}
                        variant="outline"
                        className={cn("text-xs", e.aSurveiller && "border-amber-300 text-amber-700 dark:text-amber-400")}
                      >
                        {t(`signal_${s.type}`, { n: s.valeur })}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <Link href={`/eleves/${e.id}`} title={t("voirFiche")}>
                <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
