"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getNoteColor } from "@/lib/utils";
import { PenLine, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ClassSelector } from "@/components/sites/ClassSelector";
import type { SiteColor } from "@/lib/site-colors";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface Matiere {
  id: string;
  nom: string;
  code: string;
  couleur: string | null;
  coefficient: number;
  moyenneClasse: number | null;
  totalNotes: number;
}

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  siteId: string | null;
  siteNom: string | null;
}

export function NotesOverview({
  matieres,
  classes,
  hierarchie: _hierarchie,
  siteColors,
  selectedClasseId = "",
}: {
  matieres: Matiere[];
  classes: Classe[];
  hierarchie?: ClassesHierarchie;
  siteColors: Record<string, SiteColor>;
  selectedClasseId?: string;
}) {
  const t = useTranslations("notes");
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClasseFilter(classeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (classeId) {
      params.set("classeId", classeId);
    } else {
      params.delete("classeId");
    }
    params.delete("matiereId");
    params.delete("evaluationId");
    router.push(`/notes?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Filtre classe */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleClasseFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !selectedClasseId
                ? "bg-primary text-white"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            {t("allClasses")}
          </button>
        </div>
        <ClassSelector
          classes={classes}
          siteColors={siteColors}
          selectedId={selectedClasseId}
          onSelect={handleClasseFilter}
        />
      </div>

      {/* Grille matières */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {matieres.map((matiere) => {
          const moyenne = matiere.moyenneClasse;
          const MoyenneIcon = moyenne === null ? Minus
            : moyenne >= 12 ? TrendingUp : TrendingDown;
          const moyenneColor = moyenne === null
            ? "text-muted-foreground"
            : getNoteColor(moyenne, 20);

          return (
            <Card key={matiere.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: matiere.couleur ?? "#6b7280" }}
                    />
                    <CardTitle className="text-sm font-semibold truncate">
                      {matiere.nom}
                    </CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {t("coeff", { value: matiere.coefficient })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Moyenne */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("classAverageLabel")}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MoyenneIcon className={`h-3.5 w-3.5 ${moyenneColor}`} />
                      <span className={`text-lg font-bold ${moyenneColor}`}>
                        {moyenne !== null ? `${moyenne.toFixed(2)}/20` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t("gradesEnteredLabel")}</p>
                    <p className="text-lg font-bold">{matiere.totalNotes}</p>
                  </div>
                </div>

                {/* Barre de progression */}
                {moyenne !== null && (
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(moyenne / 20) * 100}%`,
                        backgroundColor: matiere.couleur ?? "#16a34a",
                      }}
                    />
                  </div>
                )}

                {/* Actions */}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Link href={`/notes?matiereId=${matiere.id}${selectedClasseId ? `&classeId=${selectedClasseId}` : ""}`}>
                    <PenLine className="h-3.5 w-3.5 mr-2" />
                    {t("enterGrades")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
