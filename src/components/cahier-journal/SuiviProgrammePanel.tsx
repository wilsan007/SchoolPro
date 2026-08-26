"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  TrendingDown,
  Calendar,
  BookOpen,
  CheckCircle2,
  Loader2,
  Users2,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MobileCard, MobileList, MobileEmptyState } from "@/components/mobile/MobileUI";

// ──────────────────────────────────────────────────────────────
// Types (miroir de ResultatSuivi côté serveur)
// ──────────────────────────────────────────────────────────────

interface LigneCouverture {
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  prevu: number;
  traite: number;
  ecart: number;
  taux: number;
}

interface LigneDecalage {
  chapitreNom: string;
  matiereNom: string;
  classeNom: string | null;
  niveauDecalage: string;
  explication: string;
}

interface LigneTenueCahier {
  enseignantId: string;
  enseignantNom: string;
  attendu: number;
  realise: number;
  taux: number;
  alerte: boolean;
}

interface LigneEcartPlanning {
  chapitreNom: string;
  classeNom: string | null;
  matiereNom: string;
  drift: number;
}

interface ResultatSuivi {
  semaine: number;
  couverture: LigneCouverture[];
  decalages: LigneDecalage[];
  tenueCahier: LigneTenueCahier[];
  ecartsPlanning: LigneEcartPlanning[];
  resume: {
    tauxCouvertureMoyen: number;
    nbDecalages: number;
    nbEnseignantsAlerte: number;
    nbEcartsPlanning: number;
  };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Couleur de la barre de progression selon le taux (0-1). */
function couleurBarre(taux: number): string {
  if (taux >= 0.8) return "bg-emerald-500";
  if (taux >= 0.6) return "bg-orange-500";
  return "bg-red-500";
}

/** Couleur du texte du taux. */
function couleurTexte(taux: number): string {
  if (taux >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (taux >= 0.6) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

// ──────────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────────

interface SuiviProgrammePanelProps {
  /** Semaine initiale à afficher (défaut: 1). */
  semaineInitiale?: number;
}

export function SuiviProgrammePanel({
  semaineInitiale = 1,
}: SuiviProgrammePanelProps) {
  const t = useTranslations("suiviProgramme");
  const [semaine, setSemaine] = useState(semaineInitiale);
  const [data, setData] = useState<ResultatSuivi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (s: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cahier-journal/suivi-programme?semaine=${s}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const json = (await res.json()) as ResultatSuivi;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(semaine);
  }, [semaine, fetchData]);

  return (
    <div className="space-y-6">
      {/* ── En-tête : sélecteur de semaine + résumé ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">
            {t("selectSemaine")}
          </label>
          <select
            value={semaine}
            onChange={(e) => setSemaine(parseInt(e.target.value, 10))}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Array.from({ length: 36 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>
                {t("selectSemaine")} {s}
              </option>
            ))}
          </select>
        </div>

        {/* Résumé rapide */}
        {data && !loading && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">
              {t("tauxCouverture")} : {Math.round(data.resume.tauxCouvertureMoyen * 100)} %
            </Badge>
            <Badge variant={data.resume.nbDecalages > 0 ? "destructive" : "success"}>
              {t("nbDecalages")} : {data.resume.nbDecalages}
            </Badge>
            <Badge variant={data.resume.nbEnseignantsAlerte > 0 ? "warning" : "success"}>
              {t("nbAlertes")} : {data.resume.nbEnseignantsAlerte}
            </Badge>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── 1. Couverture du programme ──────────────────────── */}
          <SectionCouverture couverture={data.couverture} />

          {/* ── 2. Décalages détectés ───────────────────────────── */}
          <SectionDecalages decalages={data.decalages} />

          {/* ── 3. Tenue du cahier journal ──────────────────────── */}
          <SectionTenueCahier tenueCahier={data.tenueCahier} />

          {/* ── 4. Écarts planning ──────────────────────────────── */}
          <SectionEcartsPlanning ecarts={data.ecartsPlanning} />
        </>
      )}
    </div>
  );

  // ── Sous-composants (inline pour partager les traductions) ──

  function SectionCouverture({ couverture }: { couverture: LigneCouverture[] }) {
    return (
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <BookOpen className="h-5 w-5 text-blue-500" />
          <h3 className="text-sm font-semibold">{t("couverture")}</h3>
        </div>
        {couverture.length === 0 ? (
          <div className="p-4">
            <MobileEmptyState icon={<BookOpen className="h-8 w-8" />} title={t("couverture")} />
          </div>
        ) : (
          <>
            {/* Table desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("classe")}</th>
                    <th className="px-4 py-2 font-medium">{t("matiere")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("prevu")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("realise")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("ecart")}</th>
                    <th className="px-4 py-2 font-medium">{t("taux")}</th>
                  </tr>
                </thead>
                <tbody>
                  {couverture.map((c, i) => (
                    <tr key={`${c.classeId}-${c.matiereId}`} className={cn("border-b", i % 2 === 1 && "bg-muted/30")}>
                      <td className="px-4 py-2">{c.classeNom}</td>
                      <td className="px-4 py-2">{c.matiereNom}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{c.prevu}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{c.traite}</td>
                      <td className="px-4 py-2 text-center tabular-nums">
                        {c.ecart > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{c.ecart}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full transition-all", couleurBarre(c.taux))}
                              style={{ width: `${Math.round(c.taux * 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-xs font-semibold tabular-nums", couleurTexte(c.taux))}>
                            {Math.round(c.taux * 100)} %
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards mobile */}
            <div className="md:hidden">
              <MobileList>
                {couverture.map((c) => (
                  <MobileCard key={`${c.classeId}-${c.matiereId}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{c.classeNom}</p>
                        <p className="text-xs text-muted-foreground">{c.matiereNom}</p>
                      </div>
                      <span className={cn("text-sm font-bold tabular-nums", couleurTexte(c.taux))}>
                        {Math.round(c.taux * 100)} %
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", couleurBarre(c.taux))}
                        style={{ width: `${Math.round(c.taux * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{t("prevu")}: {c.prevu}</span>
                      <span>{t("realise")}: {c.traite}</span>
                      <span>{t("ecart")}: {c.ecart}</span>
                    </div>
                  </MobileCard>
                ))}
              </MobileList>
            </div>
          </>
        )}
      </div>
    );
  }

  function SectionDecalages({ decalages }: { decalages: LigneDecalage[] }) {
    return (
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="text-sm font-semibold">{t("decalages")}</h3>
          {decalages.length > 0 && (
            <Badge variant="destructive">{decalages.length}</Badge>
          )}
        </div>
        {decalages.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>—</span>
          </div>
        ) : (
          <div className="divide-y">
            {decalages.map((d, i) => {
              const isDecalage = d.niveauDecalage === "DECALAGE";
              const borderColor = isDecalage ? "border-l-red-500" : "border-l-orange-500";
              return (
                <div
                  key={i}
                  className={cn("border-l-4 px-4 py-3", borderColor)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.chapitreNom}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.matiereNom}
                        {d.classeNom ? ` · ${d.classeNom}` : ""}
                      </p>
                    </div>
                    <Badge variant={isDecalage ? "destructive" : "warning"}>
                      {d.niveauDecalage}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{d.explication}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function SectionTenueCahier({ tenueCahier }: { tenueCahier: LigneTenueCahier[] }) {
    return (
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Users2 className="h-5 w-5 text-purple-500" />
          <h3 className="text-sm font-semibold">{t("tenueCahier")}</h3>
        </div>
        {tenueCahier.length === 0 ? (
          <div className="p-4">
            <MobileEmptyState icon={<Users2 className="h-8 w-8" />} title={t("tenueCahier")} />
          </div>
        ) : (
          <>
            {/* Table desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("enseignant")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("attendu")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("realise")}</th>
                    <th className="px-4 py-2 font-medium">{t("taux")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenueCahier.map((e, i) => (
                    <tr key={e.enseignantId} className={cn("border-b", i % 2 === 1 && "bg-muted/30")}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{e.enseignantNom}</span>
                          {e.alerte && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center tabular-nums">{e.attendu}</td>
                      <td className="px-4 py-2 text-center tabular-nums">{e.realise}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full transition-all", couleurBarre(e.taux))}
                              style={{ width: `${Math.round(e.taux * 100)}%` }}
                            />
                          </div>
                          <span className={cn("text-xs font-semibold tabular-nums", couleurTexte(e.taux))}>
                            {e.attendu > 0 ? `${Math.round(e.taux * 100)} %` : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards mobile */}
            <div className="md:hidden">
              <MobileList>
                {tenueCahier.map((e) => (
                  <MobileCard key={e.enseignantId}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{e.enseignantNom}</span>
                        {e.alerte && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <span className={cn("text-sm font-bold tabular-nums", couleurTexte(e.taux))}>
                        {e.attendu > 0 ? `${Math.round(e.taux * 100)} %` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", couleurBarre(e.taux))}
                        style={{ width: `${Math.round(e.taux * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{t("attendu")}: {e.attendu}</span>
                      <span>{t("realise")}: {e.realise}</span>
                    </div>
                  </MobileCard>
                ))}
              </MobileList>
            </div>
          </>
        )}
      </div>
    );
  }

  function SectionEcartsPlanning({ ecarts }: { ecarts: LigneEcartPlanning[] }) {
    return (
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <GitBranch className="h-5 w-5 text-indigo-500" />
          <h3 className="text-sm font-semibold">{t("ecartsPlanning")}</h3>
          {ecarts.length > 0 && (
            <Badge variant="warning">{ecarts.length}</Badge>
          )}
        </div>
        {ecarts.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>—</span>
          </div>
        ) : (
          <>
            {/* Table desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Chapitre</th>
                    <th className="px-4 py-2 font-medium">{t("classe")}</th>
                    <th className="px-4 py-2 font-medium">{t("matiere")}</th>
                    <th className="px-4 py-2 text-center font-medium">{t("derive")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ecarts.map((e, i) => (
                    <tr key={i} className={cn("border-b", i % 2 === 1 && "bg-muted/30")}>
                      <td className="px-4 py-2">{e.chapitreNom}</td>
                      <td className="px-4 py-2">{e.classeNom ?? "—"}</td>
                      <td className="px-4 py-2">{e.matiereNom}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400 tabular-nums">
                          <TrendingDown className="h-3.5 w-3.5" />
                          +{e.drift} {t("semaines")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards mobile */}
            <div className="md:hidden">
              <MobileList>
                {ecarts.map((e, i) => (
                  <MobileCard key={i}>
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">{e.chapitreNom}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.matiereNom}
                          {e.classeNom ? ` · ${e.classeNom}` : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        <TrendingDown className="h-3.5 w-3.5" />
                        +{e.drift} {t("semaines")}
                      </span>
                    </div>
                  </MobileCard>
                ))}
              </MobileList>
            </div>
          </>
        )}
      </div>
    );
  }
}
