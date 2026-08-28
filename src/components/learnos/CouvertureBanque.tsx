"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { toast } from "sonner";
import { texteErreur } from "@/lib/erreurs-client";

/**
 * Couverture de la banque de questions par compétence × palier.
 *
 * C'est le tableau de bord qui dit « où le dispositif est aveugle » : les
 * couples compétence × palier sans aucune question empêchent l'adaptation de
 * fonctionner. Un élève fragile qui a besoin d'APPLICATION ne recevra rien si
 * la banque est vide à ce palier — et personne ne le saura sans cette vue.
 */

const PALIER_COULEUR: Record<string, string> = {
  RESTITUTION: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  APPLICATION: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CONSOLIDATION: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  TRANSFERT: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  OUVERTURE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface PalierCount {
  palier: string;
  count: number;
}

interface CompetenceCouverture {
  id: string;
  code: string;
  libelle: string;
  total: number;
  paliers: PalierCount[];
}

interface ChapitreCouverture {
  id: string;
  nom: string;
  niveau: string;
  competences: CompetenceCouverture[];
}

interface MatiereCouverture {
  id: string;
  nom: string;
  chapitres: ChapitreCouverture[];
}

interface CouvertureData {
  matieres: MatiereCouverture[];
  totalTrous: number;
  paliers: string[];
}

export function CouvertureBanque() {
  const t = useTranslations("learnos.couverture");
  const te = useTranslations("learnos.erreurs");
  const tc = useTranslations("learnos.commun");
  const libelleNiveau = useLibelleNiveau();

  const [data, setData] = useState<CouvertureData | null>(null);
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await fetch("/api/learnos/questions/couverture");
      if (!res.ok) {
        toast.error(texteErreur(await res.json().catch(() => ({})), te, tc("erreurServeur")));
        return;
      }
      setData(await res.json());
    } catch {
      toast.error(tc("erreur"));
    } finally {
      setChargement(false);
    }
  }, [te, tc]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function combler() {
    setGeneration(true);
    try {
      const res = await fetch("/api/learnos/questions/combler", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(texteErreur(body, te, tc("erreurServeur")));
        return;
      }
      toast.success(
        t("comblerResultat", { creees: body.creees ?? 0, echecs: body.echecs ?? 0 })
      );
      await charger();
    } catch {
      toast.error(tc("erreur"));
    } finally {
      setGeneration(false);
    }
  }

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("chargement")}
      </div>
    );
  }

  if (!data || data.matieres.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {t("aucunChapitre")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête : résumé global + bouton de comblement automatique */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {data.totalTrous > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-medium text-sm">
                    {t("trousDetectes", { n: data.totalTrous })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("trousAide")}</p>
                </div>
              </>
            ) : (
              <p className="text-sm font-medium text-emerald-600">
                {t("couvertureComplete")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void charger()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t("rafraichir")}
            </Button>
            {data.totalTrous > 0 && (
              <Button size="sm" onClick={() => void combler()} disabled={generation}>
                {generation ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("combler")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Détail par matière → chapitre → compétence */}
      {data.matieres.map((matiere) => (
        <div key={matiere.id} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {matiere.nom}
          </h3>
          {matiere.chapitres.map((chapitre) => {
            const trousChapitre = chapitre.competences.reduce(
              (s, c) => s + c.paliers.filter((p) => p.count === 0).length,
              0
            );
            if (tousCompetencesPleines(chapitre)) return null;

            return (
              <Card key={chapitre.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{chapitre.nom}</span>
                    <Badge variant="outline" className="text-xs">
                      {libelleNiveau(chapitre.niveau)}
                    </Badge>
                    {trousChapitre > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {t("trous", { n: trousChapitre })}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {chapitre.competences.map((comp) => {
                      const trous = comp.paliers.filter((p) => p.count === 0);
                      if (trous.length === 0) return null;
                      return (
                        <div
                          key={comp.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {comp.code} — {comp.libelle}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {comp.paliers.map((p) => (
                                <span
                                  key={p.palier}
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    p.count > 0
                                      ? "bg-muted text-muted-foreground"
                                      : PALIER_COULEUR[p.palier] ??
                                        "bg-red-100 text-red-700"
                                  }`}
                                  title={p.count > 0 ? t("questions", { n: p.count }) : t("vide")}
                                >
                                  {p.palier}
                                  {p.count > 0 ? ` (${p.count})` : " —"}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function tousCompetencesPleines(chapitre: ChapitreCouverture): boolean {
  return chapitre.competences.every((c) => c.paliers.every((p) => p.count > 0));
}
