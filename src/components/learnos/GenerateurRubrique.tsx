"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, Save, Grid3x3 } from "lucide-react";
import { useTranslations } from "next-intl";

interface Rubrique {
  titre: string;
  critères: {
    nom: string;
    points: number;
    niveaux: { excellent: string; satisfaisant: string; fragile: string; insuffisant: string };
  }[];
  totalPoints: number;
  modele: string;
  cached: boolean;
  rubriqueId?: string | null;
}

/**
 * Page de génération de grilles d'évaluation (rubrics) par IA.
 */
export function GenerateurRubrique({ competences }: { competences: { id: string; libelle: string; matiere: string; niveau: string }[] }) {
  const t = useTranslations("learnos.rubriqueEvaluation");
  const [competenceId, setCompetenceId] = useState("");
  const [niveauScolaire, setNiveauScolaire] = useState("");
  const [bareme, setBareme] = useState("20");
  const [rubrique, setRubrique] = useState<Rubrique | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generer() {
    if (!competenceId || !niveauScolaire) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/learnos/rubriques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          niveauScolaire,
          baremeTotal: parseInt(bareme),
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setRubrique(data);
    } catch {
      setError(t("erreur"));
      setRubrique(null);
    } finally {
      setLoading(false);
    }
  }

  async function sauvegarder() {
    if (!rubrique || !competenceId || !niveauScolaire) return;
    setSaving(true);
    try {
      const res = await fetch("/api/learnos/rubriques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          niveauScolaire,
          baremeTotal: parseInt(bareme),
          persister: true,
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setRubrique({ ...rubrique, rubriqueId: data.rubriqueId });
      setSaved(true);
    } catch {
      setError(t("erreurSauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  const niveauCouleur: Record<string, string> = {
    excellent: "bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200",
    satisfaisant: "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-200",
    fragile: "bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
    insuffisant: "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="h-4 w-4 text-purple-600" />
            {t("titre")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("competence")}</Label>
              <Select value={competenceId} onValueChange={setCompetenceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("choisirCompetence")} />
                </SelectTrigger>
                <SelectContent>
                  {competences.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.matiere} — {c.libelle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("niveauScolaire")}</Label>
              <Input
                value={niveauScolaire}
                onChange={(e) => setNiveauScolaire(e.target.value)}
                placeholder="CM2, Terminale…"
              />
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="w-32 space-y-2">
              <Label>{t("bareme")}</Label>
              <Input
                type="number"
                value={bareme}
                onChange={(e) => setBareme(e.target.value)}
                min={5}
                max={100}
              />
            </div>
            <Button onClick={generer} disabled={loading || !competenceId || !niveauScolaire}>
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {t("generer")}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {rubrique && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {rubrique.titre}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({rubrique.totalPoints} pts)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Grille critères × niveaux */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">{t("critere")}</th>
                    <th className="px-3 py-2 text-center font-medium">{t("points")}</th>
                    <th className="px-3 py-2 font-medium">{t("excellent")}</th>
                    <th className="px-3 py-2 font-medium">{t("satisfaisant")}</th>
                    <th className="px-3 py-2 font-medium">{t("fragile")}</th>
                    <th className="px-3 py-2 font-medium">{t("insuffisant")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rubrique.critères.map((critere, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{critere.nom}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{critere.points}</td>
                      <td className={`px-3 py-2 rounded ${niveauCouleur.excellent}`}>{critere.niveaux.excellent}</td>
                      <td className={`px-3 py-2 rounded ${niveauCouleur.satisfaisant}`}>{critere.niveaux.satisfaisant}</td>
                      <td className={`px-3 py-2 rounded ${niveauCouleur.fragile}`}>{critere.niveaux.fragile}</td>
                      <td className={`px-3 py-2 rounded ${niveauCouleur.insuffisant}`}>{critere.niveaux.insuffisant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sauvegarder */}
            <div className="flex gap-2 border-t pt-3">
              <Button onClick={sauvegarder} disabled={saving || saved || !!rubrique.rubriqueId} size="sm">
                {saved || rubrique.rubriqueId ? (
                  t("sauvegarde")
                ) : (
                  <><Save className="h-3 w-3" /> {t("sauvegarder")}</>
                )}
              </Button>
              <Button onClick={generer} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className="h-3 w-3" />
                {t("regenerer")}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{t("avertissement")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
