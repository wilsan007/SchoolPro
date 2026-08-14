"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Formulaire de justification d'une absence, pour un parent.
 *
 * Ouvre un dialogue dans lequel le parent choisit un motif et saisit un
 * commentaire. La soumission appelle `/api/absences/justifier` qui vérifie
 * côté serveur que l'absence appartient bien à l'enfant du parent.
 */
export function JustifierAbsenceForm({
  absenceId,
  dateLabel,
}: {
  absenceId: string;
  /** Date déjà formatée pour l'affichage dans le titre du dialogue. */
  dateLabel: string;
}) {
  const t = useTranslations("learnos.dossier");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState<"MALADIE" | "FAMILIALE" | "TRANSPORT" | "AUTRE">("MALADIE");
  const [commentaire, setCommentaire] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/absences/justifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absenceId, motif, commentaire: commentaire || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la justification");
      }

      setSuccess(true);
      // Fermer le dialogue après un court délai pour laisser voir le succès.
      setTimeout(() => {
        setOpen(false);
        // Recharger la page pour refléter le changement de statut.
        window.location.reload();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("justifier")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("justifier")}</DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>

        {success ? (
          <p className="py-4 text-center text-sm text-green-600">
            ✓ {t("justifier")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`motif-${absenceId}`}>{t("statut")}</Label>
              <select
                id={`motif-${absenceId}`}
                value={motif}
                onChange={(e) => setMotif(e.target.value as typeof motif)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="MALADIE">Maladie</option>
                <option value="FAMILIALE">Motif familial</option>
                <option value="TRANSPORT">Transport</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`commentaire-${absenceId}`}>{t("justifier")}</Label>
              <Textarea
                id={`commentaire-${absenceId}`}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="…"
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "…" : t("justifier")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
