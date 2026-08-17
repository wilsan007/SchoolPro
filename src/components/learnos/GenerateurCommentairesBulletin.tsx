"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Check, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

interface CommentairesProposes {
  commentaireMatiere: string;
  commentaireGeneral: string;
  propositionDecision: string;
  modele: string;
  cached: boolean;
}

/**
 * Générateur de commentaires de bulletin par IA.
 *
 * L'IA propose, l'enseignant valide. Les commentaires sont affichés
 * dans des zones éditables pour que l'enseignant puisse les ajuster
 * avant de les sauvegarder dans le bulletin.
 */
export function GenerateurCommentairesBulletin({
  eleveId,
  periodeId,
  matiereId,
  onSauvegarder,
}: {
  eleveId: string;
  periodeId: string;
  matiereId: string;
  onSauvegarder: (commentaire: string) => Promise<void>;
}) {
  const t = useTranslations("learnos.commentairesBulletin");
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<CommentairesProposes | null>(null);
  const [commentaireEdite, setCommentaireEdite] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function generer() {
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/learnos/commentaires-bulletin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId, periodeId, matiereId }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setResultat(data);
      setCommentaireEdite(data.commentaireMatiere);
    } catch {
      setResultat(null);
    } finally {
      setLoading(false);
    }
  }

  async function sauvegarder() {
    setSaving(true);
    try {
      await onSauvegarder(commentaireEdite);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const decisionsLabels: Record<string, string> = {
    FELICITATIONS: t("decision.felicitations"),
    ENCOURAGEMENTS: t("decision.encouragements"),
    SATISFACTION: t("decision.satisfaction"),
    AVERTISSEMENT: t("decision.avertissement"),
    PASSAGE: t("decision.passage"),
    REDOUBLEMENT: t("decision.redoublement"),
    EN_ATTENTE: t("decision.enAttente"),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-purple-600" />
          {t("titre")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!resultat && !loading && (
          <Button onClick={generer} size="sm">
            <Sparkles className="h-4 w-4" />
            {t("generer")}
          </Button>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            {t("generation")}
          </div>
        )}

        {resultat && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("commentaireMatiere")}
              </label>
              <Textarea
                value={commentaireEdite}
                onChange={(e) => {
                  setCommentaireEdite(e.target.value);
                  setSaved(false);
                }}
                rows={4}
                className="text-sm"
              />
            </div>

            {resultat.commentaireGeneral && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("commentaireGeneral")}
                </label>
                <p className="rounded border bg-muted p-2 text-sm">
                  {resultat.commentaireGeneral}
                </p>
              </div>
            )}

            {resultat.propositionDecision && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("decision")}
                </label>
                <p className="text-sm font-medium">
                  {decisionsLabels[resultat.propositionDecision] ?? resultat.propositionDecision}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={generer} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className="h-3 w-3" />
                {t("regenerer")}
              </Button>
              <Button onClick={sauvegarder} size="sm" disabled={saving || saved}>
                {saved ? (
                  <>
                    <Check className="h-3 w-3" />
                    {t("sauvegarde")}
                  </>
                ) : (
                  t("sauvegarder")
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("avertissement")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
