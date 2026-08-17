"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, Save, Clock, Target, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";

interface PlanLecon {
  titre: string;
  objectifs: string[];
  dureeTotale: number;
  etapes: { nom: string; duree: number; description: string; support?: string }[];
  materiel: string[];
  evaluation: string;
  differentiation?: string;
  modele: string;
  cached: boolean;
  planId?: string | null;
}

/**
 * Page de génération de plans de leçon par IA.
 *
 * L'enseignant sélectionne une compétence et un niveau, l'IA génère
 * un plan structuré. L'enseignant peut ensuite l'ajuster et le sauvegarder
 * (statut PROPOSE → workflow de validation).
 */
export function GenerateurPlanLecon({ competences }: { competences: { id: string; libelle: string; matiere: string; niveau: string }[] }) {
  const t = useTranslations("learnos.planLecon");
  const [competenceId, setCompetenceId] = useState("");
  const [niveauScolaire, setNiveauScolaire] = useState("");
  const [duree, setDuree] = useState("55");
  const [plan, setPlan] = useState<PlanLecon | null>(null);
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
      const res = await fetch("/api/learnos/plans-lecon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          niveauScolaire,
          dureeSouhaitee: parseInt(duree),
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setPlan(data);
    } catch {
      setError(t("erreur"));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  async function sauvegarder() {
    if (!plan || !competenceId || !niveauScolaire) return;
    setSaving(true);
    try {
      const res = await fetch("/api/learnos/plans-lecon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competenceId,
          niveauScolaire,
          dureeSouhaitee: parseInt(duree),
          persister: true,
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setPlan({ ...plan, planId: data.planId });
      setSaved(true);
    } catch {
      setError(t("erreurSauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-blue-600" />
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
              <Label>{t("duree")}</Label>
              <Input
                type="number"
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
                min={30}
                max={120}
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

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{plan.titre}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Objectifs */}
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Target className="h-3 w-3" />
                {t("objectifs")}
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {plan.objectifs.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>

            {/* Durée totale */}
            <p className="flex items-center gap-1 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t("dureeTotale", { n: plan.dureeTotale })}
            </p>

            {/* Étapes */}
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <ListChecks className="h-3 w-3" />
                {t("etapes")}
              </p>
              <div className="space-y-2">
                {plan.etapes.map((etape, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{etape.nom}</p>
                      <span className="text-xs text-muted-foreground">{etape.duree} min</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{etape.description}</p>
                    {etape.support && (
                      <p className="mt-1 text-xs text-blue-600">Support : {etape.support}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Matériel */}
            {plan.materiel.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("materiel")}</p>
                <div className="flex flex-wrap gap-1">
                  {plan.materiel.map((m, i) => (
                    <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Évaluation */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("evaluation")}</p>
              <p className="text-sm">{plan.evaluation}</p>
            </div>

            {/* Différenciation */}
            {plan.differentiation && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("differentiation")}</p>
                <p className="text-sm">{plan.differentiation}</p>
              </div>
            )}

            {/* Sauvegarder */}
            <div className="flex gap-2 border-t pt-3">
              <Button onClick={sauvegarder} disabled={saving || saved || !!plan.planId} size="sm">
                {saved || plan.planId ? (
                  <>{t("sauvegarde")}</>
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
