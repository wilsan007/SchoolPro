"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, CircleDashed, AlertTriangle, TrendingUp, TrendingDown,
  Minus, CalendarClock, Route, HandHeart, CalendarX2, Wallet, Link2,
} from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { cn } from "@/lib/utils";
import { TexteRegle } from "@/components/learnos/TexteRegle";
import type { CompetenceDuDossier, DossierEleve } from "@/lib/learnos/dossier-eleve";

/**
 * Le dossier d'un enfant, tel que sa famille le lit.
 *
 * ORDRE DE LECTURE ASSUMÉ
 * -----------------------
 * L'action à faire vient **en premier**, avant tout constat. C'est l'inverse
 * d'un bulletin, et c'est délibéré : un parent qui descend une page de chiffres
 * avant d'atteindre « voici quoi faire » a déjà décroché. Les difficultés
 * viennent ensuite, les réussites les encadrent — on ne présente pas un enfant
 * par ses manques.
 *
 * Aucun pourcentage de maîtrise n'est affiché en chiffre : ce sont des
 * estimations, pas des notes, et les confondre est le plus sûr moyen de faire
 * perdre confiance dans les deux.
 */
export function DossierEnfant({
  dossier,
  perspective,
}: {
  dossier: DossierEleve;
  /** `parent` ou `eleve` — change l'adresse, pas les données. */
  perspective: "parent" | "eleve";
}) {
  const t = useTranslations("learnos.dossier");
  const format = useFormatter();

  const rienDeMesure =
    dossier.acquis.length === 0 &&
    dossier.enCours.length === 0 &&
    dossier.aReprendre.length === 0;

  return (
    <div className="space-y-6">
      {/* 1. L'action de la semaine — la seule chose qui donne prise. */}
      {dossier.prochaineAction ? (
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
            <HandHeart className="h-6 w-6 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">
                {t(perspective === "parent" ? "aiderTitre" : "aiderTitreEleve")}
              </p>
              <p className="text-sm">
                <span className="font-medium">
                  {dossier.prochaineAction.competence}
                </span>
                {" — "}
                {dossier.prochaineAction.action}
              </p>
              {dossier.prochaineAction.echeance && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {t("avantLe", {
                    date: format.dateTime(new Date(dossier.prochaineAction.echeance), {
                      dateStyle: "long",
                    }),
                  })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Le silence est une information : rien à faire cette semaine se dit,
        // sinon l'écran paraît cassé — ou pire, on invente une tâche.
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t(perspective === "parent" ? "rienAFaire" : "rienAFaireEleve")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2. Le récit : à reprendre, en cours, acquis. */}
      {rienDeMesure ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CircleDashed className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{t("rienMesure")}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t("rienMesureAide")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <ColonneCompetences
            titre={t("aReprendre")}
            aide={t("aReprendreAide")}
            items={dossier.aReprendre}
            icone={AlertTriangle}
            accent="text-red-600"
            bordure="border-l-red-500"
            libelleBloquante={t("bloqueLaSuite")}
            vide={t("aReprendreVide")}
          />
          <ColonneCompetences
            titre={t("enCours")}
            aide={t("enCoursAide")}
            items={dossier.enCours}
            icone={CircleDashed}
            accent="text-amber-600"
            bordure="border-l-amber-500"
            vide={t("enCoursVide")}
          />
          <ColonneCompetences
            titre={t("acquis")}
            aide={t("acquisAide")}
            items={dossier.acquis}
            icone={CheckCircle2}
            accent="text-emerald-600"
            bordure="border-l-emerald-500"
            vide={t("acquisVide")}
          />
        </div>
      )}

      {/* 3. Le parcours engagé, s'il existe. */}
      {dossier.plans.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-start gap-2">
            <Route className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <h2 className="font-semibold">{t("parcoursTitre")}</h2>
              <p className="text-sm text-muted-foreground">
                {t(perspective === "parent" ? "parcoursAide" : "parcoursAideEleve")}
              </p>
            </div>
          </div>

          {dossier.plans.map((plan) => (
            <Card key={plan.id} className="border-l-4 border-l-indigo-500">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {plan.matiere && <Badge variant="secondary">{plan.matiere}</Badge>}
                  <Badge variant="outline">{t(`type_${plan.type}`)}</Badge>
                  {plan.dateRevue && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {t("pointEtape", {
                        date: format.dateTime(new Date(plan.dateRevue), {
                          dateStyle: "medium",
                        }),
                      })}
                    </span>
                  )}
                </div>

                <p className="text-sm">
                  <TexteRegle
                    regle={plan.regleDeclenchee}
                    params={plan.motifParams}
                    secours={plan.motif}
                  />
                </p>

                {plan.etapes.length > 0 && (
                  <ol className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
                    {plan.etapes.map((e, i) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{i + 1}.</span>
                        <span className="font-medium">{e.competence}</span>
                        <span className="text-muted-foreground">— {e.action}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {t(`responsable_${e.responsable}`)}
                        </Badge>
                        {e.echeance && (
                          <span className="text-xs text-muted-foreground">
                            {format.dateTime(new Date(e.echeance), { dateStyle: "short" })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* 4. Le factuel, en bas et sans dramatisation. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Tendance valeur={dossier.tendance} />
            <div>
              <p className="text-sm font-medium">{t(`tendance_${dossier.tendance}`)}</p>
              <p className="text-xs text-muted-foreground">{t("tendanceAide")}</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            dossier.assiduite.absencesInjustifiees > 0 &&
              "border-amber-300 dark:border-amber-800"
          )}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarX2 className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {t("absences", { n: dossier.assiduite.absencesInjustifiees })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("absencesAide", { jours: dossier.assiduite.fenetreJours })}
              </p>
            </div>
          </CardContent>
        </Card>

        {dossier.finance && (
          <Card
            className={cn(
              dossier.finance.facturesEnRetard > 0 &&
                "border-amber-300 dark:border-amber-800"
            )}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {dossier.finance.facturesEnRetard === 0
                    ? t("soldeAJour")
                    : t("soldeDu", {
                        // La devise reste celle de l'établissement ; c'est le
                        // format du nombre qui suit la langue du lecteur.
                        montant: format.number(dossier.finance.montantDu, {
                          style: "currency",
                          currency: "DJF",
                          maximumFractionDigits: 0,
                        }),
                      })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("soldeAide", { n: dossier.finance.facturesEnRetard })}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Le rappel qui protège la confiance dans les deux sens. */}
      <p className="text-xs text-muted-foreground">{t("avertissement")}</p>
    </div>
  );
}

function Tendance({ valeur }: { valeur: string }) {
  if (valeur === "hausse") return <TrendingUp className="h-5 w-5 text-emerald-600" />;
  if (valeur === "baisse") return <TrendingDown className="h-5 w-5 text-red-600" />;
  if (valeur === "stable") return <Minus className="h-5 w-5 text-muted-foreground" />;
  return <CircleDashed className="h-5 w-5 text-muted-foreground" />;
}

function ColonneCompetences({
  titre,
  aide,
  items,
  icone: Icone,
  accent,
  bordure,
  libelleBloquante,
  vide,
}: {
  titre: string;
  aide: string;
  items: CompetenceDuDossier[];
  icone: typeof CheckCircle2;
  accent: string;
  bordure: string;
  libelleBloquante?: string;
  vide: string;
}) {
  return (
    <Card className={cn("border-l-4", bordure)}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", accent)} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              {titre}
              <Badge variant="secondary">{items.length}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">{aide}</p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vide}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {items.map((c) => (
              <li key={c.competenceId} className="space-y-0.5">
                <p className="leading-snug">{c.libelle}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {c.matiere}
                  {c.bloquante && libelleBloquante && (
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <Link2 className="h-3 w-3" />
                      {libelleBloquante}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
