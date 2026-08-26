"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, BookOpen, PencilRuler, Calculator, Package } from "lucide-react";
import { creerDemandeFourniture, supprimerDemandeFourniture, type DemandeFournitureFormData } from "@/lib/actions/fournitures";
import type { TypeFourniture, StatutDemandeFourniture } from "@prisma/client";
import { useTranslations } from "next-intl";

interface MatiereOption { id: string; nom: string; }

interface DemandeItem {
  id: string;
  niveau: string;
  matiereId: string | null;
  matiere: { nom: string } | null;
  type: TypeFourniture;
  nom: string;
  description: string | null;
  quantite: number;
  format: string | null;
  prixEstime: number | null;
  statut: StatutDemandeFourniture;
  commentaireValidation: string | null;
  createdAt: Date;
}

const TYPE_ICONS: Record<TypeFourniture, typeof BookOpen> = {
  LIVRE: BookOpen,
  CAHIER: PencilRuler,
  INSTRUMENT: Calculator,
  AUTRE: Package,
};

const TYPE_LABEL_KEYS: Record<TypeFourniture, string> = {
  LIVRE: "typeLivre",
  CAHIER: "typeCahier",
  INSTRUMENT: "typeInstrument",
  AUTRE: "typeAutre",
};

const STATUT_LABEL_KEYS: Record<StatutDemandeFourniture, string> = {
  PROPOSEE: "statutProposee",
  VALIDEE: "statutValidee",
  REJETEE: "statutRejetee",
};

const STATUT_COLORS: Record<StatutDemandeFourniture, string> = {
  PROPOSEE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  VALIDEE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJETEE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function FournituresEnseignant({
  niveaux,
  matieres,
  demandes: initialDemandes,
}: {
  niveaux: string[];
  matieres: MatiereOption[];
  demandes: DemandeItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [demandes, setDemandes] = useState<DemandeItem[]>(initialDemandes);
  const t = useTranslations("fournitures");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DemandeFournitureFormData>({
    niveau: "",
    matiereId: null,
    type: "CAHIER",
    nom: "",
    description: null,
    quantite: 1,
    format: null,
    prixEstime: null,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.niveau || !form.nom) {
      toast.error(`${t("niveauRequis")}, ${t("nomRequis")}`);
      return;
    }
    startTransition(async () => {
      try {
        await creerDemandeFourniture(form);
        toast.success(t("demandeCreee"));
        setShowForm(false);
        setForm({ niveau: "", matiereId: null, type: "CAHIER", nom: "", description: null, quantite: 1, format: null, prixEstime: null });
        // Recharger la page
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await supprimerDemandeFourniture(id);
        setDemandes((prev) => prev.filter((d) => d.id !== id));
        toast.success(t("demandeSupprimee"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  // Grouper par niveau
  const parNiveau: Record<string, DemandeItem[]> = {};
  for (const d of demandes) {
    if (!parNiveau[d.niveau]) parNiveau[d.niveau] = [];
    parNiveau[d.niveau].push(d);
  }

  return (
    <div className="space-y-6">
      {/* En-tête + bouton ajouter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("mesDemandes")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("saisieParNiveau")}
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          {t("nouvelleDemande")}
        </Button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("nouvelleDemande")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t("niveau")} *</Label>
                <select
                  value={form.niveau}
                  onChange={(e) => setForm({ ...form, niveau: e.target.value })}
                  required
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— {t("niveau")} —</option>
                  {niveaux.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("matiere")}</Label>
                <select
                  value={form.matiereId ?? ""}
                  onChange={(e) => setForm({ ...form, matiereId: e.target.value || null })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— {t("matiereOptionnelle")} —</option>
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("type")} *</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as TypeFourniture })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(TYPE_LABEL_KEYS).map(([k, v]) => <option key={k} value={k}>{t(v as any)}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("nom")} *</Label>
                <Input
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="ex: Cahier 200 pages grands carreaux"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("quantite")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantite}
                  onChange={(e) => setForm({ ...form, quantite: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("format")}</Label>
                <Input
                  value={form.format ?? ""}
                  onChange={(e) => setForm({ ...form, format: e.target.value || null })}
                  placeholder="ex: A4, 17x22, Grand carreaux"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("prixEstime")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prixEstime ?? ""}
                  onChange={(e) => setForm({ ...form, prixEstime: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="ex: 2500"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("description")}</Label>
                <Input
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  placeholder="Détails complémentaires"
                />
              </div>

              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" size="sm" disabled={isPending} className="gap-2">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("creer")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  {t("annuler")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Listes par niveau */}
      {Object.keys(parNiveau).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Aucune demande de fourniture pour le moment. Cliquez sur &apos;{t("nouvelleDemande")}&apos; pour commencer.
          </CardContent>
        </Card>
      ) : (
        Object.entries(parNiveau)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([niveau, items]) => (
            <Card key={niveau}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {t("niveau")} {niveau}
                  <Badge variant="secondary">{t("items", { count: items.length })}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {items.map((d) => {
                    const Icon = TYPE_ICONS[d.type];
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{d.nom}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[d.statut]}`}>
                              {t(STATUT_LABEL_KEYS[d.statut] as any)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t(TYPE_LABEL_KEYS[d.type] as any)} · {t("quantite")} {d.quantite}
                            {d.format && ` · ${d.format}`}
                            {d.matiere && ` · ${d.matiere.nom}`}
                            {d.prixEstime != null && ` · ~${d.prixEstime} FCFA`}
                          </p>
                          {d.commentaireValidation && (
                            <p className="text-xs text-amber-600 mt-1 italic">« {d.commentaireValidation} »</p>
                          )}
                        </div>
                        {d.statut === "PROPOSEE" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(d.id)}
                            disabled={isPending}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}
