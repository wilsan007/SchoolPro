"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { texteErreur } from "@/lib/erreurs-client";
import type { CorrectionDeLaFile } from "@/lib/learnos/entrainement/file-corrections";
import type { FiabiliteCorrecteur } from "@/lib/learnos/entrainement/fiabilite-correcteur";

interface CritereLecture {
  id: string;
  libelle: string;
  points: number;
  propose: boolean;
  retenu?: boolean;
}

interface ErreurLecture {
  type?: string;
  description?: string;
}

interface BudgetAffiche {
  reste: number;
  total: number;
}

export interface CorrectionsAValiderProps {
  corrections: CorrectionDeLaFile[];
  budget: BudgetAffiche;
  fiabilite: FiabiliteCorrecteur | null;
  onCountChange?: (n: number) => void;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)} %`;
}

function fmtDateISO(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Critères que le modèle a proposés comme réussis.
 *
 * `reussi` et non `reussie` : c'est la clé que le prompt écrit
 * (`prompt-correction.ts`) et que `correction-assistee.ts` valide au
 * stockage. Lire une autre clé rendait la proposition invisible : les
 * critères proposés n'étaient jamais pré-cochés, et « Valider » sans
 * toucher à la grille partait toujours avec zéro critère.
 */
function proposesDe(correction: { details: unknown }): string[] {
  const details = Array.isArray(correction.details)
    ? (correction.details as unknown[])
    : [];
  const proposes: string[] = [];
  for (const d of details) {
    const o = d as Record<string, unknown>;
    if (o.reussi === true && typeof o.id === "string") proposes.push(o.id);
  }
  return proposes;
}

/**
 * File des corrections assistées à valider par un adulte.
 *
 * Chaque ligne est une proposition de modèle : rien n'est écrit dans le profil
 * de l'élève tant qu'un enseignant n'a pas cliqué « Valider » ou « Rejeter ».
 * L'enseignant peut reprendre les critères avant de valider — la note découle
 * de la grille, jamais d'un score envoyé par le client.
 */
export function CorrectionsAValider({
  corrections,
  budget,
  fiabilite,
  onCountChange,
}: CorrectionsAValiderProps) {
  const t = useTranslations("learnos.corrections");
  const tc = useTranslations("learnos.commun");
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [traites, setTraites] = useState<Set<string>>(new Set());
  const [choix, setChoix] = useState<
    Record<string, { criteresValides: string[] | null }>
  >(() => {
    // Pré-remplis avec la proposition du modèle : le rendu ne voit jamais
    // d'état vide, et « Valider » sans toucher à la grille confirme la
    // proposition plutôt que d'envoyer zéro critère.
    const init: Record<string, { criteresValides: string[] | null }> = {};
    for (const c of corrections) init[c.id] = { criteresValides: proposesDe(c) };
    return init;
  });

  const restants = corrections.filter((c) => !traites.has(c.id));
  if (restants.length === 0) return null;

  /**
   * Choix effectifs d'une carte : l'adulte a touché la grille, ou la
   * proposition du modèle vaut. Le rendu ne voit JAMAIS `undefined` (qui
   * faisait jeter `.includes()` au premier affichage) et une carte apparue
   * après `router.refresh()` confirme la proposition si on la valide sans
   * la toucher — jamais une liste vide.
   */
  function choixEffectifs(id: string): string[] {
    const connu = choix[id]?.criteresValides;
    if (Array.isArray(connu)) return connu;
    return proposesDe(corrections.find((x) => x.id === id) ?? { details: null });
  }

  function toggleCritere(correctionId: string, critereId: string) {
    demarrer(() => {
      setChoix((prev) => {
        const actuel = prev[correctionId]?.criteresValides ?? [];
        const set = new Set(actuel);
        if (set.has(critereId)) set.delete(critereId);
        else set.add(critereId);
        return { ...prev, [correctionId]: { criteresValides: [...set] } };
      });
    });
  }

  function decider(id: string, action: "valider" | "rejeter") {
    demarrer(async () => {
      try {
        const body =
          action === "rejeter"
            ? { criteresValides: null }
            : {
                // L'état est pré-rempli à la proposition du modèle : valider
                // sans toucher la grille la confirme, jamais une liste vide.
                criteresValides: choixEffectifs(id),
              };

        const res = await fetch(`/api/learnos/corrections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            texteErreur(data, tc, tc("erreurServeur") ?? "Erreur serveur")
          );

        setTraites((s) => new Set(s).add(id));
        setChoix((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        toast.success(t(action === "valider" ? "validee" : "rejetee"));
        router.refresh();
        onCountChange?.(restants.length - 1);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }
  return (
    <section className="space-y-4">
      {/* En-tête de synthèse : budget + fiabilité */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-primary bg-primary/5 p-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("titre")}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {t("sousTitre", { n: restants.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {restants.length}
              </span>
              <span className="text-xs text-muted-foreground">{t("enAttente")}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-amber-500/5 p-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("budget")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xs text-muted-foreground">
              {t("budgetReste", { reste: budget.reste, total: budget.total })}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="h-1.5 bg-amber-500 rounded-full"
                style={{
                  width: Math.min(
                    100,
                    Math.max(0, (budget.reste / Math.max(1, budget.total)) * 100)
                  ),
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 bg-indigo-500/5 p-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("fiabilite")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {fiabilite === null ? (
              <div className="text-xs text-muted-foreground">
                {t("fiabilitePasDonnees")}
              </div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {t("fiabiliteTauxConfirmees", {
                    pct: Math.round(fiabilite.tauxConfirmees * 100),
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("fiabiliteRelues", { n: fiabilite.relues })}
                </div>
                {!fiabilite.suffisant && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />
                    {t("fiabiliteInsuffisante")}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {restants.map((c) => {
        const q = c.question;
        const grilleVersionChangee = c.grilleVersion !== q?.grilleVersion;
        const criteres: CritereLecture[] = [];
        const details = Array.isArray(c.details) ? (c.details as unknown[]) : [];
        const critiquesMap = new Map<
          string,
          { libelle: string; points: number; propose: boolean }
        >();
        if (q?.grille) {
          const g = q.grille as Record<string, unknown>;
          const liste = Array.isArray(g.criteres) ? g.criteres : [];
          for (const item of liste) {
            const it = item as Record<string, unknown>;
            if (typeof it.id === "string") {
              critiquesMap.set(it.id, {
                libelle:
                  typeof it.libelle === "string" ? it.libelle : String(it.id),
                points: typeof it.points === "number" ? it.points : 0,
                propose: false,
              });
            }
          }
        }
        for (const d of details) {
          const o = d as Record<string, unknown>;
          if (typeof o.id !== "string") continue;
          const base = critiquesMap.get(o.id) ?? {
            libelle: String(o.id),
            points: 0,
            propose: false,
          };
          critiquesMap.set(o.id, { ...base, propose: o.reussi === true });
        }
        critiquesMap.forEach((v, id) => criteres.push({ id, ...v }));

        const erreurs: ErreurLecture[] = [];
        const erreursBrutes = Array.isArray(c.erreurs)
          ? (c.erreurs as unknown[])
          : [];
        for (const e of erreursBrutes) {
          const o = e as Record<string, unknown>;
          erreurs.push({
            type: typeof o.type === "string" ? o.type : undefined,
            description:
              typeof o.description === "string" ? o.description : undefined,
          });
        }

        return (
          <Card
            key={c.id}
            data-testid={`correction-${c.id}`}
            className={cn(
              "border-l-4",
              c.statut === "INCERTAINE"
                ? "border-l-amber-500"
                : "border-l-indigo-500"
            )}
          >
            <CardHeader
              className="flex flex-row items-start justify-between gap-2 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium hover:underline text-primary cursor-pointer">
                    {c.eleve.prenom} {c.eleve.nom}
                  </span>
                  {c.eleve.classe && (
                    <Badge variant="outline">{c.eleve.classe.nom}</Badge>
                  )}
                  {grilleVersionChangee && (
                    <Badge variant="destructive" className="text-xs">
                      {t("grilleModifiee")}
                    </Badge>
                  )}
                  <Badge variant="secondary">{fmtPct(c.confiance)}</Badge>
                </div>
                <CardTitle className="text-sm font-medium leading-none">
                  {q?.enonce ?? t("questionInconnue")}
                </CardTitle>
                {q?.competence && (
                  <p className="text-xs text-muted-foreground">
                    {q.competence.libelle}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-medium text-muted-foreground block">
                  {fmtDateISO(
                    typeof c.createdAt === "string"
                      ? c.createdAt
                      : c.createdAt.toISOString()
                  )}
                </span>
                <span className="text-sm font-bold">
                  {c.score ?? 0} / {c.maxScore ?? q?.bareme ?? 0}
                </span>
              </div>
            </CardHeader>

            <CardContent className="px-4 py-3 space-y-3">
              <div className="rounded-lg border bg-muted/30 p-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("reponseEleve")}
                </p>
                <p className="text-sm whitespace-pre-wrap text-foreground">
                  {c.reponse ?? t("aucuneReponse")}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t("criteres")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {criteres.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("aucunCritere")}
                    </p>
                  ) : (
                    criteres.map((cr) => {
                      const selection = choixEffectifs(c.id);
                      const estSelectionne = selection.includes(cr.id);
                      const affichePropose =
                        cr.propose && choix[c.id] === undefined;
                      return (
                        <label
                          key={cr.id}
                          className={cn(
                            "flex items-center gap-2 rounded border p-2 text-sm cursor-pointer",
                            estSelectionne
                              ? "bg-primary/10 border-primary"
                              : "bg-white border-gray-200 hover:border-gray-300"
                          )}
                          onClick={() => toggleCritere(c.id, cr.id)}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0"
                            defaultChecked={estSelectionne}
                            readOnly
                            aria-label={cr.libelle}
                          />
                          <span className="line-clamp-1">
                            {cr.libelle}
                            {cr.points > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (+{cr.points})
                              </span>
                            )}
                          </span>
                          {affichePropose && (
                            <Check className="h-3 w-3 text-primary ml-auto shrink-0" />
                          )}
                          {!cr.propose && estSelectionne && (
                            <Check className="h-3 w-3 text-emerald-600 ml-auto shrink-0" />
                          )}
                          {cr.propose && !estSelectionne && choix[c.id] !== undefined && (
                            <X className="h-3 w-3 text-red-500 ml-auto shrink-0" />
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {erreurs.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {t("erreursDetectees")}
                  </p>
                  <ul className="text-xs space-y-0.5 list-disc list-inside text-red-600 dark:text-red-400">
                    {erreurs.map((e, i) => (
                      <li key={i}>
                        {e.type && e.description
                          ? `${e.type}: ${e.description}`
                          : e.description ?? e.type ?? t("erreurSansType")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.motifs && Array.isArray(c.motifs) && c.motifs.length > 0 && (
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs">
                  <p className="font-semibold text-amber-800 mb-1">
                    {t("motifs")}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    {(c.motifs as unknown[]).map((m, i) => (
                      <li key={i}>{String(m)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {c.questionVerification && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-xs">
                  <p className="font-semibold text-indigo-800 mb-1">
                    {t("questionVerification")}
                  </p>
                  <p className="text-indigo-700 whitespace-pre-wrap">
                    {c.questionVerification}
                  </p>
                </div>
              )}
            </CardContent>

            <CardContent className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  {c.modele && (
                    <span className="text-muted-foreground">
                      {t("modele", { modele: c.modele })}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => decider(c.id, "rejeter")}
                    variant="ghost"
                    disabled={enCours}
                    title={t("rejeterAide")}
                  >
                    {enCours && traites.has(c.id) ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t("rejeter")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => decider(c.id, "valider")}
                    disabled={enCours || traites.has(c.id)}
                  >
                    {enCours && traites.has(c.id) ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t("valider")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

