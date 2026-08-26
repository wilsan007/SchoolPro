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
import { Plus } from "lucide-react";
import { ClassGroupedSelect } from "@/components/classes/ClassGroupedSelect";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

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
  hierarchie,
  matieres,
  devoirs: initial,
}: {
  hierarchie: ClassesHierarchie;
  matieres: MatiereOption[];
  devoirs: DevoirItem[];
}) {
  const t = useTranslations("devoirs");
  const [devoirs, setDevoirs] = useState<DevoirItem[]>(initial);
  const [pending, startTransition] = useTransition();

  // champs du formulaire
  const allClasses = hierarchie.flatMap(c => c.niveaux.flatMap(n => n.classes));
  const [classeId, setClasseId] = useState(allClasses[0]?.id ?? "");
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
        return <span className="inline-flex items-center rounded-full bg-[#0ea5e9]/10 text-[#0369a1] px-2.5 py-0.5 text-xs font-medium border border-[#0ea5e9]/20">{t("aFaire")}</span>;
      case "EN_COURS":
        return <span className="inline-flex items-center rounded-full bg-[#9b6fe0]/10 text-[#7c3aed] px-2.5 py-0.5 text-xs font-medium border border-[#9b6fe0]/20">{t("enCours")}</span>;
      case "RENDU":
        return <span className="inline-flex items-center rounded-full bg-[#14b8a6]/10 text-[#0d9488] px-2.5 py-0.5 text-xs font-medium border border-[#14b8a6]/20">{t("rendu")}</span>;
      case "CORRIGE":
        return <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#9b6fe0] text-white px-2.5 py-0.5 text-xs font-medium shadow-[0_2px_8px_rgba(155,111,224,0.2)]">{t("corrige")}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire de création */}
      <form
        onSubmit={creer}
        className="card-bloom p-6 space-y-4"
      >
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <div className="pastille-azure w-9 h-9 rounded-xl flex items-center justify-center">
            <Plus className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground">{t("nouveau")}</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="classe" className="text-muted-foreground font-medium">{t("classe")}</Label>
            <ClassGroupedSelect
              hierarchie={hierarchie}
              value={classeId}
              onValueChange={setClasseId}
              id="classe"
              className="bg-input/50 border-border rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="matiere" className="text-muted-foreground font-medium">{t("matiere")}</Label>
            <Select value={matiereId} onValueChange={setMatiereId}>
              <SelectTrigger id="matiere" className="bg-input/50 border-border rounded-xl">
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
          <Label htmlFor="titre" className="text-muted-foreground font-medium">{t("titreDevoir")}</Label>
          <Input
            id="titre"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            required
            className="bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-muted-foreground font-medium">{t("description")}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dateRendu" className="text-muted-foreground font-medium">{t("dateRendu")}</Label>
          <Input
            id="dateRendu"
            type="date"
            value={dateRendu}
            onChange={(e) => setDateRendu(e.target.value)}
            required
            className="bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary/90 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20">
          {t("creer")}
        </Button>
      </form>

      {/* Liste des devoirs existants */}
      <div className="space-y-3">
        {devoirs.length === 0 ? (
          <div className="card-bloom p-12 text-center">
            <p className="text-sm text-muted-foreground">{t("aucun")}</p>
          </div>
        ) : (
          devoirs.map((d) => {
            const couleur = d.matiere.couleur ?? "#0ea5e9";
            return (
              <div
                key={d.id}
                className="halo-hover rounded-[18px] border border-border bg-azure-mist p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: couleur, boxShadow: `0 0 8px ${couleur}40` }}
                      />
                      <h4 className="font-semibold leading-tight text-foreground truncate">{d.titre}</h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center rounded-md bg-[#0ea5e9]/8 text-[#0369a1] px-2 py-0.5 font-medium">{d.classe.nom}</span>
                      <span>·</span>
                      <span className="inline-flex items-center rounded-md bg-[#9b6fe0]/8 text-[#7c3aed] px-2 py-0.5 font-medium">{d.matiere.nom}</span>
                      <span>·</span>
                      <span className="text-muted-foreground/80">
                        {t("dateRendu")} :{" "}
                        {new Date(d.dateRendu).toLocaleDateString()}
                      </span>
                    </div>
                    {d.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                        {d.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statutBadge(d.statut)}
                    <Select
                      value={d.statut}
                      onValueChange={(v) =>
                        changerStatut(d.id, v as DevoirItem["statut"])
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px] rounded-lg border-border/60 bg-card/50">
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
            );
          })
        )}
      </div>
    </div>
  );
}
