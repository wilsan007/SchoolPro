"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, Target, Grid3x3, BarChart3, Loader2, ChevronDown, ChevronRight,
  BookOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type MasteryStatus =
  | "UNKNOWN" | "EMERGING" | "DEVELOPING" | "PROFICIENT" | "MASTERED" | "NEEDS_REVIEW";

interface Eleve {
  id: string;
  nom: string;
  prenom: string;
}

interface Competence {
  id: string;
  code: string;
  libelle: string;
  ordre: number;
  chapitre: {
    id: string;
    nom: string;
    ordre: number;
    niveau: string;
    matiere: { id: string; nom: string; couleur: string | null };
  } | null;
}

interface Profil {
  eleveId: string;
  competenceId: string;
  masteryScore: number;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  trend: string;
}

type Vue = "matriciel" | "barres" | "heatmap";

/**
 * Sémantique visuelle des statuts — cohérente avec CompetencesEleve.
 */
const STATUTS: Record<MasteryStatus, { classe: string; bg: string; text: string; barre: string; label: string }> = {
  UNKNOWN: {
    classe: "bg-muted text-muted-foreground border-border",
    bg: "bg-gray-200 dark:bg-gray-700",
    text: "text-gray-500",
    barre: "bg-gray-400",
    label: "statutUNKNOWN",
  },
  EMERGING: {
    classe: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    bg: "bg-red-400",
    text: "text-red-600",
    barre: "bg-red-500",
    label: "statutEMERGING",
  },
  DEVELOPING: {
    classe: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
    bg: "bg-orange-400",
    text: "text-orange-600",
    barre: "bg-orange-500",
    label: "statutDEVELOPING",
  },
  PROFICIENT: {
    classe: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    bg: "bg-emerald-400",
    text: "text-emerald-600",
    barre: "bg-emerald-500",
    label: "statutPROFICIENT",
  },
  MASTERED: {
    classe: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    bg: "bg-blue-500",
    text: "text-blue-600",
    barre: "bg-blue-500",
    label: "statutMASTERED",
  },
  NEEDS_REVIEW: {
    classe: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    bg: "bg-amber-400",
    text: "text-amber-600",
    barre: "bg-amber-500",
    label: "statutNEEDS_REVIEW",
  },
};

const ORDRE_STATUTS: MasteryStatus[] = [
  "MASTERED", "PROFICIENT", "DEVELOPING", "EMERGING", "NEEDS_REVIEW", "UNKNOWN",
];

/**
 * Structure hiérarchique : Matière → Chapitre → Compétences
 */
interface ChapitreGroupe {
  id: string;
  nom: string;
  ordre: number;
  competences: Competence[];
}

interface MatiereGroupe {
  id: string;
  nom: string;
  couleur: string | null;
  chapitres: ChapitreGroupe[];
}

/**
 * Groupe les compétences par matière puis par chapitre.
 */
function grouperParMatiereChapitre(
  competences: Competence[],
  t: (k: string, params?: Record<string, string | number | Date>) => string
): MatiereGroupe[] {
  const matieresMap = new Map<string, MatiereGroupe>();
  const chapitresMap = new Map<string, ChapitreGroupe>();

  for (const c of competences) {
    const mat = c.chapitre?.matiere;
    const matId = mat?.id ?? "sans-matiere";
    const chId = c.chapitre?.id ?? "sans-chapitre";

    // Créer la matière si nécessaire
    if (!matieresMap.has(matId)) {
      matieresMap.set(matId, {
        id: matId,
        nom: mat?.nom ?? t("sansMatiere"),
        couleur: mat?.couleur ?? null,
        chapitres: [],
      });
    }

    // Créer le chapitre si nécessaire
    const chapitreKey = `${matId}:${chId}`;
    if (!chapitresMap.has(chapitreKey)) {
      const ch = matieresMap.get(matId)!;
      const nouveauChap: ChapitreGroupe = {
        id: chId,
        nom: c.chapitre?.nom ?? t("sansChapitre"),
        ordre: c.chapitre?.ordre ?? 0,
        competences: [],
      };
      ch.chapitres.push(nouveauChap);
      chapitresMap.set(chapitreKey, nouveauChap);
    }

    // Ajouter la compétence au chapitre
    chapitresMap.get(chapitreKey)!.competences.push(c);
  }

  // Trier les chapitres par ordre dans chaque matière
  for (const mat of matieresMap.values()) {
    mat.chapitres.sort((a, b) => a.ordre - b.ordre);
    for (const ch of mat.chapitres) {
      ch.competences.sort((a, b) => a.ordre - b.ordre);
    }
  }

  return [...matieresMap.values()];
}

export function CompetencesClasse({ classeId }: { classeId: string }) {
  const t = useTranslations("learnos.competencesClasse");
  const [chargement, setChargement] = useState(true);
  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [profils, setProfils] = useState<Profil[]>([]);
  const [vue, setVue] = useState<Vue>("matriciel");
  const [matiereFiltre, setMatiereFiltre] = useState<string | null>(null);
  const [chapitreFiltre, setChapitreFiltre] = useState<string | null>(null);
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    let annule = false;
    fetch(`/api/learnos/classes/${classeId}/competences`)
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        setEleves(d.eleves ?? []);
        setCompetences(d.competences ?? []);
        setProfils(d.profils ?? []);
      })
      .catch(() => {})
      .finally(() => !annule && setChargement(false));
    return () => { annule = true; };
  }, [classeId]);

  // Map (eleveId, competenceId) → profil
  const profilMap = useMemo(() => {
    const m = new Map<string, Profil>();
    for (const p of profils) {
      m.set(`${p.eleveId}:${p.competenceId}`, p);
    }
    return m;
  }, [profils]);

  // Compétences filtrées par matière ET chapitre
  const competencesFiltrees = useMemo(() => {
    let result = competences;
    if (matiereFiltre) {
      result = result.filter((c) => c.chapitre?.matiere?.id === matiereFiltre);
    }
    if (chapitreFiltre) {
      result = result.filter((c) => c.chapitre?.id === chapitreFiltre);
    }
    return result;
  }, [competences, matiereFiltre, chapitreFiltre]);

  // Matières distinctes pour le filtre
  const matieres = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; couleur: string | null }>();
    for (const c of competences) {
      const mat = c.chapitre?.matiere;
      if (mat && !m.has(mat.id)) m.set(mat.id, mat);
    }
    return [...m.entries()].map(([_, v]) => v);
  }, [competences]);

  // Chapitres distincts (filtrés par matière si sélectionnée)
  const chapitres = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; matiereId: string }>();
    for (const c of competences) {
      const ch = c.chapitre;
      if (!ch) continue;
      if (matiereFiltre && ch.matiere.id !== matiereFiltre) continue;
      if (!m.has(ch.id)) {
        m.set(ch.id, { id: ch.id, nom: ch.nom, matiereId: ch.matiere.id });
      }
    }
    return [...m.entries()].map(([_, v]) => v);
  }, [competences, matiereFiltre]);

  // Synthèse globale
  const synthese = useMemo(() => {
    const total = competencesFiltrees.length * eleves.length;
    let mesures = 0;
    const parStatut: Record<MasteryStatus, number> = {
      UNKNOWN: 0, EMERGING: 0, DEVELOPING: 0, PROFICIENT: 0, MASTERED: 0, NEEDS_REVIEW: 0,
    };
    for (const el of eleves) {
      for (const comp of competencesFiltrees) {
        const p = profilMap.get(`${el.id}:${comp.id}`);
        const statut = p?.masteryStatus ?? "UNKNOWN";
        parStatut[statut]++;
        if (statut !== "UNKNOWN") mesures++;
      }
    }
    const tauxAcquisition = total > 0 && mesures > 0
      ? Math.round(
          ((parStatut.MASTERED + parStatut.PROFICIENT) / mesures) * 100
        )
      : 0;
    return { total, mesures, parStatut, tauxAcquisition };
  }, [competencesFiltrees, eleves, profilMap]);

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

  if (competences.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{t("aucuneCompetence")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("aucuneCompetenceAide")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (eleves.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">{t("aucunEleve")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête : synthèse + sélecteur de vue */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {ORDRE_STATUTS.map((s) => (
            <div
              key={s}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                STATUTS[s].classe
              )}
            >
              <span className="font-medium">{synthese.parStatut[s]}</span>
              {t(STATUTS[s].label)}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <VueButton
            active={vue === "matriciel"}
            onClick={() => setVue("matriciel")}
            icon={<Table className="h-4 w-4" />}
            label={t("vueMatriciel")}
          />
          <VueButton
            active={vue === "barres"}
            onClick={() => setVue("barres")}
            icon={<BarChart3 className="h-4 w-4" />}
            label={t("vueBarres")}
          />
          <VueButton
            active={vue === "heatmap"}
            onClick={() => setVue("heatmap")}
            icon={<Grid3x3 className="h-4 w-4" />}
            label={t("vueHeatmap")}
          />
        </div>
      </div>

      {/* Taux d'acquisition global */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all"
              style={{ width: `${synthese.tauxAcquisition}%` }}
            />
          </div>
        </div>
        <span className="text-sm font-medium whitespace-nowrap">
          {t("tauxAcquisition", { pct: synthese.tauxAcquisition })}
        </span>
      </div>

      {/* Filtres : matière puis chapitre */}
      <div className="space-y-2">
        {/* Filtre matière */}
        {matieres.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setMatiereFiltre(null); setChapitreFiltre(null); }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                !matiereFiltre
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {t("toutesMatieres")}
            </button>
            {matieres.map((m) => (
              <button
                key={m.id}
                onClick={() => { setMatiereFiltre(m.id); setChapitreFiltre(null); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  matiereFiltre === m.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: m.couleur ?? "hsl(var(--muted-foreground))" }}
                />
                {m.nom}
              </button>
            ))}
          </div>
        )}

        {/* Filtre chapitre (apparait seulement si une matière est sélectionnée ou s'il y a peu de chapitres) */}
        {chapitres.length > 1 && (
          <div className="flex flex-wrap gap-2 pl-1">
            <button
              onClick={() => setChapitreFiltre(null)}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                !chapitreFiltre
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <BookOpen className="h-3 w-3" />
              {t("tousChapitres")}
            </button>
            {chapitres.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setChapitreFiltre(ch.id)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                  chapitreFiltre === ch.id
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <BookOpen className="h-3 w-3" />
                {ch.nom}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vues */}
      {vue === "matriciel" && (
        <VueMatriciel
          competences={competencesFiltrees}
          eleves={eleves}
          profilMap={profilMap}
          deplies={deplies}
          basculer={basculer}
          t={t}
        />
      )}
      {vue === "barres" && (
        <VueBarres
          competences={competencesFiltrees}
          eleves={eleves}
          profilMap={profilMap}
          t={t}
        />
      )}
      {vue === "heatmap" && (
        <VueHeatmap
          competences={competencesFiltrees}
          eleves={eleves}
          profilMap={profilMap}
          t={t}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Bouton de sélecteur de vue
// ─────────────────────────────────────────────
function VueButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Vue 1 : Tableau matriciel — hiérarchie Matière → Chapitre → Compétence
// ─────────────────────────────────────────────
function VueMatriciel({
  competences, eleves, profilMap, deplies, basculer, t,
}: {
  competences: Competence[];
  eleves: Eleve[];
  profilMap: Map<string, Profil>;
  deplies: Set<string>;
  basculer: (id: string) => void;
  t: (k: string, params?: Record<string, string | number | Date>) => string;
}) {
  const matieres = useMemo(
    () => grouperParMatiereChapitre(competences, t),
    [competences, t]
  );

  return (
    <div className="space-y-6">
      {matieres.map((matiere) => (
        <div key={matiere.id} className="space-y-3">
          {/* En-tête matière */}
          <div className="flex items-center gap-2 border-b pb-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: matiere.couleur ?? "hsl(var(--muted-foreground))" }}
            />
            <h3 className="text-sm font-semibold">{matiere.nom}</h3>
            <span className="text-xs text-muted-foreground">
              {t("nbCompetences", { n: matiere.chapitres.reduce((s, ch) => s + ch.competences.length, 0) })}
            </span>
          </div>

          {/* Chapitres */}
          {matiere.chapitres.map((chapitre) => (
            <div key={chapitre.id} className="space-y-1.5">
              {/* En-tête chapitre */}
              <div className="flex items-center gap-1.5 pl-2 text-xs font-medium text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                <span>{chapitre.nom}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{t("nbCompetences", { n: chapitre.competences.length })}</span>
              </div>

              {/* Tableau des compétences du chapitre */}
              <div className="overflow-x-auto pl-2">
                <table className="min-w-[640px] w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">{t("competence")}</th>
                      {ORDRE_STATUTS.map((s) => (
                        <th key={s} className="px-2 py-1.5 text-center font-medium">
                          <span className={cn("inline-block", STATUTS[s].text)}>
                            {t(STATUTS[s].label)}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-center font-medium">{t("total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapitre.competences.map((c) => {
                      const counts: Record<MasteryStatus, number> = {
                        UNKNOWN: 0, EMERGING: 0, DEVELOPING: 0, PROFICIENT: 0, MASTERED: 0, NEEDS_REVIEW: 0,
                      };
                      for (const el of eleves) {
                        const p = profilMap.get(`${el.id}:${c.id}`);
                        counts[p?.masteryStatus ?? "UNKNOWN"]++;
                      }
                      const ouvert = deplies.has(c.id);
                      const totalMesure = eleves.length - counts.UNKNOWN;

                      return (
                        <tbody key={c.id}>
                          <tr
                            className="border-b cursor-pointer hover:bg-muted/30"
                            onClick={() => basculer(c.id)}
                          >
                            <td className="py-1.5 pr-3">
                              <div className="flex items-center gap-1.5">
                                {ouvert ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="text-xs text-muted-foreground/70 font-mono">{c.code}</span>
                                <span className="font-medium truncate max-w-[240px] text-sm">{c.libelle}</span>
                              </div>
                            </td>
                            {ORDRE_STATUTS.map((s) => (
                              <td key={s} className="px-2 py-1.5 text-center">
                                {counts[s] > 0 ? (
                                  <span className={cn("font-medium text-sm", STATUTS[s].text)}>
                                    {counts[s]}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">·</span>
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center font-medium text-sm">
                              {totalMesure}/{eleves.length}
                            </td>
                          </tr>
                          {ouvert && (
                            <tr className="bg-muted/20">
                              <td colSpan={ORDRE_STATUTS.length + 2} className="px-4 py-2">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                  {eleves.map((el) => {
                                    const p = profilMap.get(`${el.id}:${c.id}`);
                                    const statut = p?.masteryStatus ?? "UNKNOWN";
                                    return (
                                      <span key={el.id} className="flex items-center gap-1">
                                        <span className={cn("h-2 w-2 rounded-full", STATUTS[statut].bg)} />
                                        {el.prenom} {el.nom}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Vue 2 : Barres empilées — hiérarchie Matière → Chapitre → Compétence
// ─────────────────────────────────────────────
function VueBarres({
  competences, eleves, profilMap, t,
}: {
  competences: Competence[];
  eleves: Eleve[];
  profilMap: Map<string, Profil>;
  t: (k: string, params?: Record<string, string | number | Date>) => string;
}) {
  const matieres = useMemo(
    () => grouperParMatiereChapitre(competences, t),
    [competences, t]
  );

  return (
    <div className="space-y-6">
      {matieres.map((matiere) => (
        <div key={matiere.id} className="space-y-3">
          {/* En-tête matière */}
          <div className="flex items-center gap-2 border-b pb-1.5">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: matiere.couleur ?? "hsl(var(--muted-foreground))" }}
            />
            <h3 className="text-sm font-semibold">{matiere.nom}</h3>
          </div>

          {/* Chapitres */}
          {matiere.chapitres.map((chapitre) => (
            <div key={chapitre.id} className="space-y-2 pl-2">
              {/* En-tête chapitre */}
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                <span>{chapitre.nom}</span>
              </div>

              {/* Barres par compétence */}
              <div className="space-y-2 pl-3">
                {chapitre.competences.map((c) => {
                  const counts: Record<MasteryStatus, number> = {
                    UNKNOWN: 0, EMERGING: 0, DEVELOPING: 0, PROFICIENT: 0, MASTERED: 0, NEEDS_REVIEW: 0,
                  };
                  for (const el of eleves) {
                    const p = profilMap.get(`${el.id}:${c.id}`);
                    counts[p?.masteryStatus ?? "UNKNOWN"]++;
                  }
                  const total = eleves.length;

                  return (
                    <div key={c.id} className="space-y-1">
                      <p className="text-xs font-medium truncate max-w-[400px]">
                        <span className="text-muted-foreground/70 font-mono mr-1.5">{c.code}</span>
                        {c.libelle}
                      </p>
                      <div className="flex h-5 overflow-hidden rounded-full bg-muted">
                        {ORDRE_STATUTS.map((s) => {
                          const pct = (counts[s] / total) * 100;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={s}
                              className={cn("h-full transition-all", STATUTS[s].barre)}
                              style={{ width: `${pct}%` }}
                              title={`${t(STATUTS[s].label)}: ${counts[s]}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {ORDRE_STATUTS.filter((s) => counts[s] > 0).map((s) => (
                          <span key={s} className="flex items-center gap-1">
                            <span className={cn("h-2 w-2 rounded-full", STATUTS[s].barre)} />
                            {counts[s]} {t(STATUTS[s].label)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Vue 3 : Heatmap élève × compétence — hiérarchie Matière → Chapitre
// ─────────────────────────────────────────────
function VueHeatmap({
  competences, eleves, profilMap, t,
}: {
  competences: Competence[];
  eleves: Eleve[];
  profilMap: Map<string, Profil>;
  t: (k: string, params?: Record<string, string | number | Date>) => string;
}) {
  const matieres = useMemo(
    () => grouperParMatiereChapitre(competences, t),
    [competences, t]
  );

  return (
    <div className="space-y-6">
      {matieres.map((matiere) => (
        <div key={matiere.id} className="space-y-2">
          {/* En-tête matière */}
          <div className="flex items-center gap-2 border-b pb-1">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: matiere.couleur ?? "hsl(var(--muted-foreground))" }}
            />
            <h3 className="text-sm font-semibold">{matiere.nom}</h3>
          </div>

          {/* Heatmap par chapitre */}
          {matiere.chapitres.map((chapitre) => (
            <div key={chapitre.id} className="space-y-1.5 pl-2">
              {/* En-tête chapitre */}
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                <span>{chapitre.nom}</span>
              </div>

              <div className="overflow-x-auto pl-3">
                <table className="border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left text-xs font-medium text-muted-foreground">
                        {t("eleve")}
                      </th>
                      {chapitre.competences.map((c) => (
                        <th
                          key={c.id}
                          className="px-1 py-1"
                          title={c.libelle}
                        >
                          <div className="mx-auto h-7 w-5 max-w-[20px] overflow-hidden">
                            <span className="block text-[10px] leading-tight text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
                              {c.libelle.length > 30 ? c.libelle.slice(0, 30) + "…" : c.libelle}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eleves.map((el) => (
                      <tr key={el.id} className="hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                          {el.prenom} {el.nom}
                        </td>
                        {chapitre.competences.map((c) => {
                          const p = profilMap.get(`${el.id}:${c.id}`);
                          const statut = p?.masteryStatus ?? "UNKNOWN";
                          return (
                            <td key={c.id} className="p-0.5">
                              <div
                                className={cn(
                                  "h-6 w-5 rounded-sm transition-colors",
                                  STATUTS[statut].bg
                                )}
                                title={`${el.prenom} ${el.nom} — ${c.libelle}: ${t(STATUTS[statut].label)}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Légende */}
      <div className="flex flex-wrap gap-2 pt-2">
        {ORDRE_STATUTS.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-3 w-3 rounded-sm", STATUTS[s].bg)} />
            {t(STATUTS[s].label)}
          </span>
        ))}
      </div>
    </div>
  );
}
