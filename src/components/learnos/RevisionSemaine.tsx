"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

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

/**
 * Page de révision du cours de la semaine pour l'élève.
 *
 * Les résumés sont re-levelés selon le niveau de lecture de l'élève,
 * déduit de son profil d'apprentissage. Si l'élève progresse, le texte
 * devient moins simplifié ; s'il est en difficulté, le texte est plus
 * accessible.
 */
export function RevisionSemaine({
  eleveId,
  classeId,
  anneeId,
}: {
  eleveId: string;
  classeId: string;
  anneeId: string;
}) {
  const t = useTranslations("learnos.revisionSemaine");
  const [revision, setRevision] = useState<RevisionSemaine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function charger() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ eleveId, classeId, anneeId });
      const res = await fetch(`/api/learnos/revision-semaine?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }
      const data = await res.json();
      setRevision(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t("chargement")}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-2 text-sm text-destructive">{error}</p>
          <Button onClick={charger} variant="outline" size="sm" className="mt-4">
            {t("reessayer")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!revision || revision.resumes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("aucunChapitre")}</p>
        </CardContent>
      </Card>
    );
  }

  const niveauLabels: Record<string, string> = {
    ELEMENTAIRE: t("niveau.elementaire"),
    FONDAMENTAL: t("niveau.fondamental"),
    INTERMEDIAIRE: t("niveau.intermediaire"),
    AVANCE: t("niveau.avance"),
  };

  return (
    <div className="space-y-4">
      {/* En-tête : semaine + niveau de lecture */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">
              {t("semaine", { n: revision.semaine })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("niveauLecture")} :{" "}
              <span className="font-medium">{niveauLabels[revision.niveauLecture] ?? revision.niveauLecture}</span>
            </p>
          </div>
          <Button onClick={charger} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Résumés par chapitre */}
      {revision.resumes.map((resume) => (
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
                    <span
                      key={i}
                      className="rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Points de révision suggérés */}
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
    </div>
  );
}
