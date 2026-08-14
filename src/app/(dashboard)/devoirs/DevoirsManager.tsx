"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type ClasseOption = { id: string; nom: string };
type MatiereOption = { id: string; nom: string; couleur?: string | null };
type DevoirItem = {
  id: string;
  titre: string;
  description: string | null;
  dateRendu: string;
  statut: "A_FAIRE" | "EN_COURS" | "RENDU" | "CORRIGE";
  classe: { nom: string };
  matiere: { nom: string; couleur?: string | null };
};

export function DevoirsManager({
  classes,
  matieres,
  devoirs: initial,
}: {
  classes: ClasseOption[];
  matieres: MatiereOption[];
  devoirs: DevoirItem[];
}) {
  const t = useTranslations("devoirs");
  const [devoirs, setDevoirs] = useState<DevoirItem[]>(initial);
  const [pending, startTransition] = useTransition();

  // champs du formulaire
  const [classeId, setClasseId] = useState(classes[0]?.id ?? "");
  const [matiereId, setMatiereId] = useState(matieres[0]?.id ?? "");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [dateRendu, setDateRendu] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!classeId || !matiereId || !titre || !dateRendu) {
      setError("Champs obligatoires manquants");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/devoirs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId,
          matiereId,
          titre,
          description: description || undefined,
          dateRendu,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erreur");
        return;
      }
      const { devoir } = await res.json();
      setDevoirs((prev) => [devoir, ...prev]);
      setTitre("");
      setDescription("");
      setDateRendu("");
    });
  }

  async function changerStatut(id: string, statut: DevoirItem["statut"]) {
    startTransition(async () => {
      const res = await fetch("/api/devoirs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut }),
      });
      if (!res.ok) return;
      setDevoirs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, statut } : d))
      );
    });
  }

  const statutBadge = (s: DevoirItem["statut"]) => {
    switch (s) {
      case "A_FAIRE":
        return <Badge variant="outline">{t("aFaire")}</Badge>;
      case "EN_COURS":
        return <Badge variant="secondary">{t("enCours")}</Badge>;
      case "RENDU":
        return <Badge variant="secondary">{t("rendu")}</Badge>;
      case "CORRIGE":
        return <Badge variant="default">{t("corrige")}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire de création */}
      <form
        onSubmit={creer}
        className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm"
      >
        <h3 className="font-semibold">{t("nouveau")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="classe">{t("classe")}</Label>
            <Select value={classeId} onValueChange={setClasseId}>
              <SelectTrigger id="classe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="matiere">{t("matiere")}</Label>
            <Select value={matiereId} onValueChange={setMatiereId}>
              <SelectTrigger id="matiere">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matieres.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="titre">{t("titreDevoir")}</Label>
          <Input
            id="titre"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">{t("description")}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateRendu">{t("dateRendu")}</Label>
          <Input
            id="dateRendu"
            type="date"
            value={dateRendu}
            onChange={(e) => setDateRendu(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {t("creer")}
        </Button>
      </form>

      {/* Liste des devoirs existants */}
      <div className="space-y-3">
        {devoirs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("aucun")}</p>
        ) : (
          devoirs.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="font-semibold leading-tight">{d.titre}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{d.classe.nom}</span>
                    <span>·</span>
                    <span>{d.matiere.nom}</span>
                    <span>·</span>
                    <span>
                      {t("dateRendu")} :{" "}
                      {new Date(d.dateRendu).toLocaleDateString()}
                    </span>
                  </div>
                  {d.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {d.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {statutBadge(d.statut)}
                  <Select
                    value={d.statut}
                    onValueChange={(v) =>
                      changerStatut(d.id, v as DevoirItem["statut"])
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A_FAIRE">{t("aFaire")}</SelectItem>
                      <SelectItem value="EN_COURS">{t("enCours")}</SelectItem>
                      <SelectItem value="RENDU">{t("rendu")}</SelectItem>
                      <SelectItem value="CORRIGE">{t("corrige")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
