"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Plus, Trash2, Loader2, BookOpen, Layers } from "lucide-react";

// ------------------------------------------------------------
// Types — alignés sur les retours de getClassesForSettings / getMatieresForSettings
// ------------------------------------------------------------

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface Matiere {
  id: string;
  nom: string;
  code: string;
}

interface Affectation {
  id: string;
  enseignantId: string;
  classeId: string;
  matiereId: string;
  enseignant: {
    id: string;
    user: { name: string } | null;
  };
  classe: { id: string; nom: string; niveau: string };
  matiere: { id: string; nom: string; code: string };
}

interface EnseignantOption {
  id: string;
  user: { name: string } | null;
}

interface Props {
  classes: Classe[];
  matieres: Matiere[];
  canManage: boolean;
}

// ------------------------------------------------------------
// Composant
// ------------------------------------------------------------

export function EnseignantsAffectationTab({ classes, matieres, canManage }: Props) {
  const t = useTranslations("parametres");
  const libelleNiveau = useLibelleNiveau();
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire
  const [selEnseignant, setSelEnseignant] = useState("");
  const [selClasse, setSelClasse] = useState("");
  const [selMatiere, setSelMatiere] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resAff, resEns] = await Promise.all([
        fetch("/api/enseignants/affectations"),
        fetch("/api/rh").then((r) => (r.ok ? r.json() : { enseignants: [] })).catch(() => ({ enseignants: [] })),
      ]);
      if (resAff.ok) {
        const data = await resAff.json();
        setAffectations(data);
      }
      // L'API RH retourne { enseignants: [...] }
      const ensList = (resEns as { enseignants?: EnseignantOption[] }).enseignants ?? [];
      setEnseignants(
        ensList
          .filter((e) => e.id)
          .map((e) => ({ id: e.id, user: e.user })),
      );
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!selEnseignant || !selClasse || !selMatiere) {
      toast.error("Veuillez sélectionner un enseignant, une classe et une matière");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/enseignants/affectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enseignantId: selEnseignant,
          classeId: selClasse,
          matiereId: selMatiere,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast.error("Cette affectation existe déjà");
        } else {
          toast.error(data.error ?? "Erreur lors de la création");
        }
        return;
      }
      toast.success("Affectation créée");
      setShowForm(false);
      setSelEnseignant("");
      setSelClasse("");
      setSelMatiere("");
      load();
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette affectation ?")) return;
    try {
      const res = await fetch(`/api/enseignants/affectations?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Erreur lors de la suppression");
        return;
      }
      toast.success("Affectation supprimée");
      setAffectations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  // Grouper par enseignant pour un affichage lisible
  const parEnseignant = affectations.reduce(
    (acc, aff) => {
      const key = aff.enseignant.user?.name ?? "—";
      if (!acc[key]) acc[key] = [];
      acc[key].push(aff);
      return acc;
    },
    {} as Record<string, Affectation[]>,
  );

  return (
    <div className="space-y-4">
      {/* En-tête + bouton ajouter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {t("enseignantsAffectation")}
          </h3>
          <Badge variant="secondary">{affectations.length}</Badge>
        </div>
        {canManage && (
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default">
                <Plus className="h-4 w-4" />
                {t("ajouterAffectation")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("nouvelleAffectation")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Enseignant */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("enseignant")}</label>
                  <Select value={selEnseignant} onValueChange={setSelEnseignant}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("selectionnerEnseignant")} />
                    </SelectTrigger>
                    <SelectContent>
                      {enseignants.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.user?.name ?? "—"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Classe */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("classe")}</label>
                  <Select value={selClasse} onValueChange={setSelClasse}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("selectionnerClasse")} />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nom} ({libelleNiveau(c.niveau)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Matière */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("matiere")}</label>
                  <Select value={selMatiere} onValueChange={setSelMatiere}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("selectionnerMatiere")} />
                    </SelectTrigger>
                    <SelectContent>
                      {matieres.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nom} ({m.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  {t("annuler")}
                </Button>
                <Button onClick={handleCreate} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("creer")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : affectations.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {t("aucuneAffectation")}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(parEnseignant)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([nomEnseignant, affs]) => (
              <div
                key={nomEnseignant}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  {nomEnseignant}
                  <Badge variant="secondary" className="text-[10px]">
                    {affs.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {affs.map((aff) => (
                    <div
                      key={aff.id}
                      className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                    >
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{aff.classe.nom}</span>
                      <span className="text-muted-foreground">—</span>
                      <span>{aff.matiere.nom}</span>
                      {canManage && (
                        <button
                          onClick={() => handleDelete(aff.id)}
                          className="ml-1 text-red-500 hover:text-red-700"
                          title={t("supprimer")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
