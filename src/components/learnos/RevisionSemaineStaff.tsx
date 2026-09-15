"use client";

import { useState, useMemo } from "react";
import { Users, Loader2, BookOpen, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface EleveOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
}

interface ClasseOption {
  id: string;
  nom: string;
  niveau: string;
  annee: string;
  eleves: EleveOption[];
}

interface ResumeChapitre {
  chapitreId: string;
  chapitreNom: string;
  matiereNom: string;
  resume: string;
  competencesCles: string[];
  niveauLecture: string;
  releveled: boolean;
  modele: string;
}

interface PointDeRevision {
  matiereNom: string;
  competence: string;
  raison: string;
}

interface RevisionSemaine {
  semaine: number;
  niveauLecture: string;
  resumes: ResumeChapitre[];
  pointsDeRevision: PointDeRevision[];
}

interface Props {
  classes: ClasseOption[];
  anneeId: string;
}

/**
 * Vue personnel (direction, enseignants, CPE…) : un sélecteur classe/élève
 * permet de consulter la révision de la semaine d'un élève donné.
 */
export function RevisionSemaineStaff({ classes, anneeId }: Props) {
  const t = useTranslations("learnos.revisionSemaine");
  const [selectedClasseId, setSelectedClasseId] = useState(classes[0]?.id ?? "");
  const [selectedEleveId, setSelectedEleveId] = useState("");
  const [revision, setRevision] = useState<RevisionSemaine | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const selectedClasse = useMemo(
    () => classes.find((c) => c.id === selectedClasseId),
    [classes, selectedClasseId]
  );

  async function charger() {
    if (!selectedEleveId || !selectedClasseId) return;
    setLoading(true);
    setError(null);
    setLoaded(false);
    try {
      const params = new URLSearchParams({ eleveId: selectedEleveId, classeId: selectedClasseId, anneeId });
      const res = await fetch(`/api/learnos/revision-semaine?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }
      const data = await res.json();
      setRevision(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setRevision(null);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  const niveauLabels: Record<string, string> = {
    ELEMENTAIRE: t("niveau.elementaire"),
    FONDAMENTAL: t("niveau.fondamental"),
    INTERMEDIAIRE: t("niveau.intermediaire"),
    AVANCE: t("niveau.avance"),
  };

  if (classes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("aucuneClasse")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sélecteurs classe / élève */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("selectionnerClasse")}
          </label>
          <select
            value={selectedClasseId}
            onChange={(e) => {
              setSelectedClasseId(e.target.value);
              setSelectedEleveId("");
              setRevision(null);
              setLoaded(false);
            }}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({c.annee})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("selectionnerEleve")}
          </label>
          <select
            value={selectedEleveId}
            onChange={(e) => {
              setSelectedEleveId(e.target.value);
              setRevision(null);
              setLoaded(false);
            }}
            disabled={!selectedClasse || selectedClasse.eleves.length === 0}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">
              {selectedClasse && selectedClasse.eleves.length === 0
                ? t("aucunEleve")
                : t("choisirEleve")}
            </option>
            {selectedClasse?.eleves.map((e) => (
              <option key={e.id} value={e.id}>
                {e.prenom} {e.nom}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={charger} disabled={!selectedEleveId || loading} size="sm">
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Users className="w-4 h-4 mr-2" />
          )}
          {t("consulter")}
        </Button>
      </div>

      {/* État initial : aucune sélection chargée */}
      {!loaded && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">{t("aideSelection")}</p>
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">{t("chargement")}</span>
          </CardContent>
        </Card>
      )}

      {/* Erreur */}
      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm text-destructive">{error}</p>
            <Button onClick={charger} variant="outline" size="sm" className="mt-4">
              {t("reessayer")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Révision */}
      {loaded && !loading && !error && revision && (
        <>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">
                  {t("semaine", { n: revision.semaine })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("niveauLecture")} :{" "}
                  <span className="font-medium">
                    {niveauLabels[revision.niveauLecture] ?? revision.niveauLecture}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {revision.resumes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{t("aucunChapitre")}</p>
              </CardContent>
            </Card>
          ) : (
            revision.resumes.map((resume) => (
              <Card key={resume.chapitreId}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                      {resume.chapitreNom}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {resume.matiereNom}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{resume.resume}</p>
                  {resume.releveled && (
                    <p className="flex items-center gap-1 text-xs text-blue-600">
                      <Sparkles className="h-3 w-3" />
                      {t("texteAdapte")}
                    </p>
                  )}
                  {resume.competencesCles.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("competencesCles")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {resume.competencesCles.map((c, i) => (
                          <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}

          {revision.pointsDeRevision.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("pointsDeRevision")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {revision.pointsDeRevision.map((p, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2",
                      p.raison.includes("critique")
                        ? "border-red-200 bg-red-50 dark:bg-red-950"
                        : "border-amber-200 bg-amber-50 dark:bg-amber-950"
                    )}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.competence}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.matiereNom} — {p.raison}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
