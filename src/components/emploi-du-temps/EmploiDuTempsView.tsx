"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Clock, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Jour = "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

const JOURS: Jour[] = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const JOURS_LABELS: Record<Jour, string> = {
  LUNDI: "Lun", MARDI: "Mar", MERCREDI: "Mer",
  JEUDI: "Jeu", VENDREDI: "Ven", SAMEDI: "Sam",
};

const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00",
];

const SLOT_HEIGHT = 48; // px per 30-min slot

interface Classe { id: string; nom: string; niveau: string }
interface Matiere { id: string; nom: string; code: string; couleur: string | null; coefficient: number }
interface Enseignant { id: string; user: { name: string | null } }
interface EmploiCreneau {
  id: string;
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
  matiere: { nom: string; code: string; couleur: string | null };
  classe: { nom: string };
  enseignant: { user: { name: string | null } } | null;
  classeId?: string;
  matiereId?: string;
  enseignantId?: string | null;
}

function slotIndex(time: string): number {
  return TIME_SLOTS.indexOf(time);
}

function slotDuration(debut: string, fin: string): number {
  return slotIndex(fin) - slotIndex(debut);
}

function matiereColor(couleur: string | null, code: string): string {
  if (couleur) {
    // Map hex to a soft tinted class
    const colorMap: Record<string, string> = {
      "#3b82f6": "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300",
      "#ef4444": "bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300",
      "#f59e0b": "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300",
      "#8b5cf6": "bg-violet-100 border-violet-300 text-violet-800 dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-300",
      "#10b981": "bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300",
      "#f97316": "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300",
    };
    return colorMap[couleur] ?? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300";
  }
  return "bg-gray-100 border-gray-300 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300";
}

function AddCreneauModal({
  classeId,
  classes,
  matieres,
  enseignants,
  onClose,
  onAdded,
}: {
  classeId: string;
  classes: Classe[];
  matieres: Matiere[];
  enseignants: Enseignant[];
  onClose: () => void;
  onAdded: (c: EmploiCreneau) => void;
}) {
  const [form, setForm] = useState({
    classeId,
    matiereId: matieres[0]?.id ?? "",
    enseignantId: "",
    jour: "LUNDI" as Jour,
    heureDebut: "08:00",
    heureFin: "09:00",
    salle: "",
  });
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/emploi-du-temps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        onAdded(data);
        toast.success("Créneau ajouté !");
        onClose();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Nouveau créneau</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Classe *</label>
            <select
              required
              value={form.classeId}
              onChange={(e) => setForm({ ...form, classeId: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Matière *</label>
            <select
              required
              value={form.matiereId}
              onChange={(e) => setForm({ ...form, matiereId: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Enseignant</label>
            <select
              value={form.enseignantId}
              onChange={(e) => setForm({ ...form, enseignantId: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Non assigné</option>
              {enseignants.map((e) => <option key={e.id} value={e.id}>{e.user.name ?? "Enseignant"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Jour *</label>
            <select
              required
              value={form.jour}
              onChange={(e) => setForm({ ...form, jour: e.target.value as Jour })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {JOURS.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Début *</label>
              <select
                required
                value={form.heureDebut}
                onChange={(e) => setForm({ ...form, heureDebut: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {TIME_SLOTS.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Fin *</label>
              <select
                required
                value={form.heureFin}
                onChange={(e) => setForm({ ...form, heureFin: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {TIME_SLOTS.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Salle</label>
            <input
              value={form.salle}
              onChange={(e) => setForm({ ...form, salle: e.target.value })}
              placeholder="ex: Salle 201"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ajouter"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EmploiDuTempsView({
  classes,
  matieres,
  enseignants,
  emplois: initial,
}: {
  classes: Classe[];
  matieres: Matiere[];
  enseignants: Enseignant[];
  emplois: EmploiCreneau[];
  tenantId: string;
}) {
  const [emplois, setEmplois] = useState<EmploiCreneau[]>(initial);
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  const classeEmplois = selectedClasse
    ? emplois.filter(
        (e) =>
          e.classe.nom === selectedClasse.nom ||
          (e as { classeId?: string }).classeId === selectedClasse.id
      )
    : [];

  function addCreneau(c: EmploiCreneau) {
    setEmplois((prev) => [...prev, c]);
  }

  function deleteCreneau(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/emploi-du-temps/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setEmplois((prev) => prev.filter((e) => e.id !== id));
        toast.success("Créneau supprimé");
      } catch {
        toast.error("Impossible de supprimer");
      }
    });
  }

  // Compteur d'heures hebdo par classe
  const totalHeures = classeEmplois.reduce((sum, c) => {
    const debut = slotIndex(c.heureDebut);
    const fin = slotIndex(c.heureFin);
    return sum + (fin - debut) * 0.5;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Classe selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex gap-2 flex-wrap">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClasse(c)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                selectedClasse?.id === c.id
                  ? "bg-primary text-white shadow-md"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              {c.nom}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {selectedClasse && (
            <span className="text-sm text-gray-500">
              <Clock className="w-4 h-4 inline mr-1" />
              {totalHeures}h / semaine
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </Button>
          <Button
            onClick={() => setShowAdd(true)}
            disabled={!selectedClasse}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Ajouter créneau
          </Button>
        </div>
      </div>

      {/* Grille horaire */}
      {selectedClasse ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header jours */}
              <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="p-3 text-xs text-gray-400 font-medium"></div>
                {JOURS.map((j) => (
                  <div key={j} className="p-3 text-center">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{JOURS_LABELS[j]}</p>
                    <p className="text-xs text-gray-400 capitalize">{j.toLowerCase()}</p>
                  </div>
                ))}
              </div>

              {/* Corps de la grille */}
              <div className="relative">
                {/* Lignes horaires */}
                {TIME_SLOTS.map((time, idx) => (
                  <div
                    key={time}
                    className="grid grid-cols-[60px_repeat(6,1fr)] border-b border-gray-100 dark:border-gray-800"
                    style={{ height: SLOT_HEIGHT }}
                  >
                    <div className={cn(
                      "flex items-start justify-end pr-3 pt-1",
                      idx % 2 === 0 ? "" : "opacity-0"
                    )}>
                      <span className="text-xs text-gray-400">{idx % 2 === 0 ? time : ""}</span>
                    </div>
                    {JOURS.map((j) => (
                      <div
                        key={j}
                        className={cn(
                          "border-l border-gray-100 dark:border-gray-800 relative",
                          idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/30"
                        )}
                      />
                    ))}
                  </div>
                ))}

                {/* Créneaux positionnés absolutement */}
                <div className="absolute inset-0 grid grid-cols-[60px_repeat(6,1fr)] pointer-events-none">
                  <div /> {/* Time column spacer */}
                  {JOURS.map((jour) => {
                    const jourCreneaux = classeEmplois.filter((c) => c.jour === jour);
                    return (
                      <div key={jour} className="relative pointer-events-auto">
                        {jourCreneaux.map((creneau) => {
                          const top = slotIndex(creneau.heureDebut) * SLOT_HEIGHT;
                          const height = slotDuration(creneau.heureDebut, creneau.heureFin) * SLOT_HEIGHT;
                          if (height <= 0) return null;
                          return (
                            <div
                              key={creneau.id}
                              className={cn(
                                "absolute left-1 right-1 rounded-lg border overflow-hidden group transition-all",
                                matiereColor(creneau.matiere.couleur, creneau.matiere.code)
                              )}
                              style={{ top: top + 2, height: height - 4 }}
                            >
                              <div className="p-1.5 h-full flex flex-col justify-between">
                                <div>
                                  <p className="text-xs font-bold leading-tight truncate">
                                    {creneau.matiere.code}
                                  </p>
                                  {height >= 80 && (
                                    <p className="text-xs opacity-80 truncate leading-tight mt-0.5">
                                      {creneau.matiere.nom}
                                    </p>
                                  )}
                                </div>
                                <div className="text-xs opacity-70 leading-tight">
                                  {height >= 64 && creneau.enseignant && (
                                    <p className="truncate">{creneau.enseignant.user.name}</p>
                                  )}
                                  {height >= 48 && creneau.salle && (
                                    <p className="truncate">{creneau.salle}</p>
                                  )}
                                  <p>{creneau.heureDebut}→{creneau.heureFin}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteCreneau(creneau.id)}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-full p-0.5 shadow"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-16 text-gray-400">
            <p>Sélectionnez une classe pour afficher son emploi du temps</p>
          </CardContent>
        </Card>
      )}

      {showAdd && selectedClasse && (
        <AddCreneauModal
          classeId={selectedClasse.id}
          classes={classes}
          matieres={matieres}
          enseignants={enseignants}
          onClose={() => setShowAdd(false)}
          onAdded={addCreneau}
        />
      )}
    </div>
  );
}
