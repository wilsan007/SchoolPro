"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target, TrendingUp, TrendingDown, Minus, Loader2, HelpCircle,
  AlertTriangle, Sparkles, Link2, ChevronDown, ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { TexteRegle } from "@/components/learnos/TexteRegle";

type MasteryStatus =
  | "UNKNOWN" | "EMERGING" | "DEVELOPING" | "PROFICIENT" | "MASTERED" | "NEEDS_REVIEW";

interface Prerequis {
  competenceId: string;
  code: string;
  libelle: string;
  masteryScore: number | null;
  acquis: boolean;
}

interface Profil {
  competenceId: string;
  masteryScore: number;
  confidenceScore: number;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  lastEvidenceAt: string | null;
  trend: string;
  prerequisiteStatus: Prerequis[] | null;
  competence: {
    code: string;
    libelle: string;
    chapitre: {
      nom: string;
      niveau: string;
      matiere: { id: string; nom: string; couleur: string | null };
    } | null;
  };
}

interface ExigenceAVenir {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  semaineDebut: number;
  semainesAvant: number;
  competencesVisees: { id: string; libelle: string }[];
  prerequis: { id: string; libelle: string; masteryScore: number | null; acquis: boolean }[];
}

interface Recommandation {
  id: string;
  competenceId: string;
  niveau: string;
  statut: string;
  motif: string;
  actionProposee: string;
  regleDeclenchee: string;
  motifParams: unknown;
  competencesBloquees: number;
}

/**
 * Sémantique visuelle des statuts.
 *
 * `UNKNOWN` est délibérément neutre — gris, sans barre de progression : il ne
 * signale pas une difficulté mais une absence de mesure. Le colorer en rouge
 * ferait passer une ignorance pour un échec.
 */
const STATUTS: Record<MasteryStatus, { classe: string; barre: string }> = {
  UNKNOWN: {
    classe: "bg-muted text-muted-foreground border-border",
    barre: "bg-muted-foreground/30",
  },
  EMERGING: {
    classe: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    barre: "bg-red-500",
  },
  DEVELOPING: {
    classe: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    barre: "bg-orange-500",
  },
  PROFICIENT: {
    classe: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    barre: "bg-emerald-500",
  },
  MASTERED: {
    classe: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    barre: "bg-blue-500",
  },
  NEEDS_REVIEW: {
    classe: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    barre: "bg-amber-500",
  },
};

function Tendance({ valeur, t }: { valeur: string; t: (k: string) => string }) {
  if (valeur === "hausse")
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <TrendingUp className="h-3.5 w-3.5" /> {t("tendanceHausse")}
      </span>
    );
  if (valeur === "baisse")
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <TrendingDown className="h-3.5 w-3.5" /> {t("tendanceBaisse")}
      </span>
    );
  if (valeur === "stable")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> {t("tendanceStable")}
      </span>
    );
  return null; // « indéterminé » : ne rien affirmer plutôt qu'afficher « stable »
}

export function CompetencesEleve({ eleveId }: { eleveId: string }) {
  const t = useTranslations("learnos.competencesEleve");
  const [chargement, setChargement] = useState(true);
  const [profils, setProfils] = useState<Profil[]>([]);
  const [recos, setRecos] = useState<Recommandation[]>([]);
  const [aVenir, setAVenir] = useState<ExigenceAVenir[]>([]);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    let annule = false;
    fetch(`/api/learnos/eleves/${eleveId}/competences`)
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        setProfils(d.profils ?? []);
        setRecos(d.recommandations ?? []);
        setAVenir(d.aVenir ?? []);
      })
      .catch(() => {})
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [eleveId]);

  const recoParCompetence = useMemo(
    () => new Map(recos.map((r) => [r.competenceId, r])),
    [recos]
  );

  /** Regroupement par matière : un élève raisonne par discipline, pas par identifiant. */
  const parMatiere = useMemo(() => {
    const groupes = new Map<string, { nom: string; couleur: string | null; profils: Profil[] }>();
    for (const p of profils) {
      const m = p.competence.chapitre?.matiere;
      const cle = m?.id ?? "sans-matiere";
      if (!groupes.has(cle)) {
        groupes.set(cle, { nom: m?.nom ?? t("sansMatiere"), couleur: m?.couleur ?? null, profils: [] });
      }
      groupes.get(cle)!.profils.push(p);
    }
    return [...groupes.entries()];
  }, [profils, t]);

  const synthese = useMemo(() => {
    const mesures = profils.filter((p) => p.masteryStatus !== "UNKNOWN");
    return {
      total: profils.length,
      mesurees: mesures.length,
      aReprendre: mesures.filter((p) => p.masteryStatus === "EMERGING").length,
      maitrisees: mesures.filter((p) => p.masteryStatus === "MASTERED").length,
      actions: recos.filter((r) => r.statut === "OBLIGATOIRE" || r.statut === "RECOMMANDEE").length,
      ouvertures: recos.filter((r) => r.statut === "PROPOSEE").length,
    };
  }, [profils, recos]);

  function basculer(id: string) {
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (chargement) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // État vide pédagogique : il explique la marche à suivre plutôt que de
  // laisser l'utilisateur devant un écran muet.
  if (profils.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{t("aucunProfil")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("aucunProfilAide")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Ce qui arrive, avant le bilan : un élève a plus besoin de savoir sur
          quoi travailler maintenant que de contempler son passé. */}
      {aVenir.length > 0 && <AVenir exigences={aVenir} />}

      {/* Synthèse — ce qu'on retient en trois secondes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold text-red-600">{synthese.aReprendre}</p>
            <p className="text-xs text-muted-foreground">{t("aReprendre")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold text-blue-600">{synthese.maitrisees}</p>
            <p className="text-xs text-muted-foreground">{t("maitrisees")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{synthese.actions}</p>
            <p className="text-xs text-muted-foreground">{t("actionsAMener")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold text-violet-600">{synthese.ouvertures}</p>
            <p className="text-xs text-muted-foreground">{t("ouvertures")}</p>
          </CardContent>
        </Card>
      </div>

      {synthese.mesurees < synthese.total && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" />
          {t("nonMesurables", { n: synthese.total - synthese.mesurees })}
        </p>
      )}

      {/* Détail par matière */}
      {parMatiere.map(([cle, groupe]) => (
        <div key={cle} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: groupe.couleur ?? "hsl(var(--muted-foreground))" }}
            />
            {groupe.nom}
          </h3>

          <div className="space-y-2">
            {groupe.profils.map((p) => {
              const statut = STATUTS[p.masteryStatus];
              const reco = recoParCompetence.get(p.competenceId);
              const inconnu = p.masteryStatus === "UNKNOWN";
              const manquants = (p.prerequisiteStatus ?? []).filter((q) => !q.acquis);
              const ouvert = deplies.has(p.competenceId);

              return (
                <Card key={p.competenceId} className="overflow-hidden">
                  <button
                    className="w-full p-4 text-left transition-colors hover:bg-muted/50"
                    onClick={() => basculer(p.competenceId)}
                  >
                    <div className="flex items-start gap-3">
                      {ouvert ? (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.competence.libelle}</span>
                          <Badge variant="outline" className={cn("text-xs", statut.classe)}>
                            {t(`statut${p.masteryStatus}`)}
                          </Badge>
                          <Tendance valeur={p.trend} t={t} />
                        </div>

                        {/* Maîtrise et fiabilité, jamais confondues.
                            Sous le seuil de confiance, aucun chiffre n'est
                            affiché : montrer « 23 % » à partir d'une seule note
                            donnerait une fausse impression de précision. */}
                        {inconnu ? (
                          <p className="text-xs text-muted-foreground">
                            {p.evidenceCount === 0
                              ? t("aucuneEvaluation")
                              : t("pasAssez", { n: p.evidenceCount })}
                          </p>
                        ) : (
                          <div className="space-y-1">
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full transition-all", statut.barre)}
                                style={{ width: `${Math.round(p.masteryScore * 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{t("pctMaitrise", { pct: Math.round(p.masteryScore * 100) })}</span>
                              <span title={t("fiabiliteAide")}>
                                {t("fiabilite", { pct: Math.round(p.confidenceScore * 100) })}
                                {" · "}
                                {t("nbEval", { n: p.evidenceCount })}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Le prérequis manquant est la réponse au « pourquoi ». */}
                        {manquants.length > 0 && (
                          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {t("bloquePar", { liste: manquants.map((q) => q.libelle).join(", ") })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  {ouvert && (
                    <div className="space-y-3 border-t bg-muted/30 px-4 py-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.competence.code}</span>
                        {p.competence.chapitre &&
                          ` · ${p.competence.chapitre.nom} (${p.competence.chapitre.niveau})`}
                      </p>

                      {reco ? (
                        <div
                          className={cn(
                            "rounded-lg border p-3",
                            reco.statut === "PROPOSEE"
                              ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
                              : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                          )}
                        >
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                            {reco.statut === "PROPOSEE" ? (
                              <>
                                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                                {t("pourAllerPlusLoin")}
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                {t(reco.statut === "OBLIGATOIRE" ? "accompagnementNecessaire" : "accompagnementRecommande")}
                              </>
                            )}
                          </p>
                          <p className="text-sm">
                            <TexteRegle
                              regle={reco.regleDeclenchee}
                              params={reco.motifParams}
                              secours={reco.motif}
                            />
                          </p>
                          <p className="mt-1.5 text-sm font-medium">
                            →{" "}
                            <TexteRegle
                              regle={reco.regleDeclenchee}
                              params={reco.motifParams}
                              secours={reco.actionProposee}
                              action
                            />
                          </p>
                        </div>
                      ) : (
                        !inconnu && (
                          <p className="text-xs text-muted-foreground">
                            {t("aucuneAction")}
                          </p>
                        )
                      )}

                      {p.lastEvidenceAt && (
                        <p className="text-xs text-muted-foreground">
                          {t("derniereEvaluation", {
                            date: new Date(p.lastEvidenceAt).toLocaleDateString(),
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Ce que l'élève devra maîtriser dans les prochaines semaines.
 *
 * Répond à la question qu'aucun élève en difficulté ne sait poser : « sur quoi
 * dois-je travailler maintenant, et pourquoi ? ». C'est ici que le programme de
 * l'année rejoint le profil individuel.
 */
function AVenir({ exigences }: { exigences: ExigenceAVenir[] }) {
  const t = useTranslations("learnos.planification");

  return (
    <Card className="border-l-4 border-l-sky-500">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-medium">{t("aVenirTitre")}</p>
          <p className="text-xs text-muted-foreground">{t("aVenirAide")}</p>
        </div>

        {exigences.map((e) => (
          <div key={e.chapitreId} className="space-y-1.5 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{e.chapitreNom}</span>
              <Badge variant="outline">{e.matiereNom}</Badge>
              <span className="text-xs text-muted-foreground">
                {t("demarreDans", { semaine: e.semaineDebut, n: Math.max(0, e.semainesAvant) })}
              </span>
            </div>

            {e.competencesVisees.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("competencesVisees")} : {e.competencesVisees.map((c) => c.libelle).join(" · ")}
              </p>
            )}

            {e.prerequis.map((p) => (
              <p
                key={p.id}
                className={cn(
                  "flex items-center gap-1.5 text-sm",
                  p.acquis ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                )}
              >
                {p.acquis ? "✓" : "○"} {p.libelle}
                <span className="text-xs opacity-80">
                  {p.acquis ? t("prerequisAcquis") : t("prerequisManquant")}
                  {p.masteryScore !== null && ` · ${Math.round(p.masteryScore * 100)} %`}
                </span>
              </p>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
