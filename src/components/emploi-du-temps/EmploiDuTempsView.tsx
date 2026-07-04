"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Clock, Printer, GripVertical, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SmartSuggestPanel } from "./SmartSuggestPanel";

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

const JOURS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const JOURS_LABELS: Record<Jour, string> = {
  DIMANCHE: "Dim", LUNDI: "Lun", MARDI: "Mar", MERCREDI: "Mer", JEUDI: "Jeu",
  VENDREDI: "Ven", SAMEDI: "Sam",
};

// Continuous grid: 07:00 → 18:00 in 30-min increments
const ALL_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
];

const SLOT_HEIGHT = 48;

interface Classe { id: string; nom: string; niveau: string }
interface Matiere { id: string; nom: string; code: string; couleur: string | null; coefficient: number }
interface Enseignant { id: string; user: { name: string | null } }
interface Salle { id: string; nom: string; capacite: number; type: string | null }
interface Disponibilite { id: string; enseignantId: string; jour: string; heureDebut: string; heureFin: string }
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function slotIndexIn(time: string, slots: string[]): number {
  return slots.indexOf(time);
}

/**
 * Une session dédoublée en groupes A/B est représentée par deux lignes
 * EmploiTemps distinctes (même jour/horaire, prof et salle différents) — il
 * n'y a pas de champ "groupe" dédié en base. L'outil IA encode le groupe dans
 * le libellé de la salle ("Salle 02 (Groupe A)") ; on l'extrait ici pour
 * l'afficher comme badge plutôt que comme texte brut de salle.
 */
function parseGroupe(salle: string | null): { salleAffichee: string | null; groupe: string | null } {
  if (!salle) return { salleAffichee: null, groupe: null };
  const m = salle.match(/^(.*)\s\(Groupe (\w+)\)$/);
  if (m) return { salleAffichee: m[1], groupe: m[2] };
  return { salleAffichee: salle, groupe: null };
}

function matiereColor(couleur: string | null): string {
  if (!couleur) return "bg-gray-100 border-gray-300 text-gray-800 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300";
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

function AddCreneauModal({
  classeId,
  classes,
  matieres,
  enseignants,
  matiereToEnseignants,
  salles,
  disponibilites,
  emploisExistants,
  availableSlots,
  onClose,
  onAdded,
}: {
  classeId: string;
  classes: Classe[];
  matieres: Matiere[];
  enseignants: Enseignant[];
  matiereToEnseignants: Record<string, { id: string; user: { name: string | null } }[]>;
  salles: Salle[];
  disponibilites: Disponibilite[];
  emploisExistants: EmploiCreneau[];
  availableSlots: string[];
  onClose: () => void;
  onAdded: (c: EmploiCreneau) => void;
}) {
  const [form, setForm] = useState({
    classeId,
    matiereId: matieres[0]?.id ?? "",
    enseignantId: "",
    jour: "DIMANCHE" as Jour,
    heureDebut: availableSlots[0] ?? "07:30",
    heureFin: availableSlots[1] ?? "08:00",
    salle: "",
  });
  const [isPending, startTransition] = useTransition();

  // Filter enseignants: only those who already teach the selected matiere
  const filteredEnseignants = matiereToEnseignants[form.matiereId] ?? [];

  // Check if the selected enseignant is available at the chosen day/time
  const enseignantDisponible = (() => {
    if (!form.enseignantId) return true;
    const dispo = disponibilites.filter(
      (d) => d.enseignantId === form.enseignantId && d.jour === form.jour
    );
    if (dispo.length === 0) return false; // No availability set for this day
    const debutMin = timeToMinutes(form.heureDebut);
    const finMin = timeToMinutes(form.heureFin);
    return dispo.some(
      (d) => timeToMinutes(d.heureDebut) <= debutMin && timeToMinutes(d.heureFin) >= finMin
    );
  })();

  // Filter salles: only those not occupied at the chosen day/time
  const sallesDisponibles = (() => {
    const debutMin = timeToMinutes(form.heureDebut);
    const finMin = timeToMinutes(form.heureFin);
    return salles.filter((s) => {
      // Check if any existing creneau uses this salle at the same time
      const occupe = emploisExistants.some((e) => {
        if (e.salle !== s.nom) return false;
        if (e.jour !== form.jour) return false;
        const eDebut = timeToMinutes(e.heureDebut);
        const eFin = timeToMinutes(e.heureFin);
        return eDebut < finMin && eFin > debutMin; // overlap
      });
      return !occupe;
    });
  })();

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
              onChange={(e) => setForm({ ...form, matiereId: e.target.value, enseignantId: "" })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Enseignant</label>
            {filteredEnseignants.length > 0 ? (
              <select
                value={form.enseignantId}
                onChange={(e) => setForm({ ...form, enseignantId: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Non assigné</option>
                {filteredEnseignants.map((e) => <option key={e.id} value={e.id}>{e.user.name ?? "Enseignant"}</option>)}
              </select>
            ) : (
              <p className="text-xs text-gray-400 italic py-2">
                Aucun enseignant n'enseigne actuellement cette matière. Assignez d'abord un enseignant à un créneau avec cette matière.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Jour *</label>
            <select
              required
              value={form.jour}
              onChange={(e) => setForm({ ...form, jour: e.target.value as Jour })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {JOURS.map((j) => <option key={j} value={j}>{JOURS_LABELS[j]}</option>)}
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
                {availableSlots.slice(0, -1).map((t) => <option key={t} value={t}>{t}</option>)}
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
                {availableSlots.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {/* Avertissement disponibilité enseignant */}
          {form.enseignantId && !enseignantDisponible && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Cet enseignant n'est pas disponible le {JOURS_LABELS[form.jour]} de {form.heureDebut} à {form.heureFin}.</span>
            </div>
          )}
          {form.enseignantId && enseignantDisponible && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg p-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Enseignant disponible à ce créneau.</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Salle {sallesDisponibles.length > 0 && <span className="text-xs text-gray-400">({sallesDisponibles.length} disponible{sallesDisponibles.length > 1 ? "s" : ""})</span>}
            </label>
            {salles.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                Aucune salle déclarée. Ajoutez des salles dans la gestion des établissements.
              </p>
            ) : sallesDisponibles.length > 0 ? (
              <select
                value={form.salle}
                onChange={(e) => setForm({ ...form, salle: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Sans salle</option>
                {sallesDisponibles.map((s) => (
                  <option key={s.id} value={s.nom}>
                    {s.nom}{s.capacite ? ` (cap. ${s.capacite})` : ""}{s.type ? ` — ${s.type}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-600 italic py-2">
                Toutes les salles sont occupées à ce créneau. Choisissez un autre horaire.
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button
              type="submit"
              disabled={isPending || (form.enseignantId !== "" && !enseignantDisponible)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
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
  matiereToEnseignants,
  salles,
  disponibilites,
}: {
  classes: Classe[];
  matieres: Matiere[];
  enseignants: Enseignant[];
  emplois: EmploiCreneau[];
  matiereToEnseignants: Record<string, { id: string; user: { name: string | null } }[]>;
  salles: Salle[];
  disponibilites: Disponibilite[];
  tenantId: string;
}) {
  const [emplois, setEmplois] = useState<EmploiCreneau[]>(initial);
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ jour: Jour; time: string } | null>(null);
  const dragOffsetRef = useRef(0);

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

  // Drag-and-drop: move a creneau to a new day/time
  const moveCreneau = useCallback(async (id: string, newJour: Jour, newHeureDebut: string) => {
    const creneau = emplois.find((e) => e.id === id);
    if (!creneau) return;

    const oldDebut = creneau.heureDebut;
    const oldFin = creneau.heureFin;
    const durationMin = timeToMinutes(oldFin) - timeToMinutes(oldDebut);
    const newDebutMin = timeToMinutes(newHeureDebut);
    const newFinMin = newDebutMin + durationMin;
    const newHeureFin = `${String(Math.floor(newFinMin / 60)).padStart(2, "0")}:${String(newFinMin % 60).padStart(2, "0")}`;

    if (creneau.jour === newJour && creneau.heureDebut === newHeureDebut) return;

    // Optimistic update
    setEmplois((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, jour: newJour, heureDebut: newHeureDebut, heureFin: newHeureFin } : e
      )
    );

    try {
      const res = await fetch(`/api/emploi-du-temps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jour: newJour, heureDebut: newHeureDebut, heureFin: newHeureFin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur");
      }
      toast.success(`Créneau déplacé vers ${JOURS_LABELS[newJour]} ${newHeureDebut}`);
    } catch (e: unknown) {
      // Revert on error
      setEmplois((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, jour: creneau.jour, heureDebut: oldDebut, heureFin: oldFin } : e
        )
      );
      toast.error(e instanceof Error ? e.message : "Erreur lors du déplacement");
    }
  }, [emplois]);

  // Render a single day column (drop zones)
  function renderDayColumn(jour: Jour) {
    return (
      <div key={jour} className="relative border-l border-gray-100 dark:border-gray-800">
        {ALL_SLOTS.map((time, idx) => {
          const isDropTarget = dragOverSlot?.jour === jour && dragOverSlot?.time === time;
          const isLunch = time === "12:30" || time === "13:00" || time === "13:30";
          return (
            <div
              key={time}
              className={cn(
                "border-b border-gray-100 dark:border-gray-800 relative transition-colors",
                isLunch
                  ? "bg-gray-100/50 dark:bg-gray-800/50"
                  : idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/50 dark:bg-gray-800/30",
                isDropTarget && "bg-green-100 dark:bg-green-900/30 ring-2 ring-green-400 ring-inset"
              )}
              style={{ height: SLOT_HEIGHT }}
              onDragOver={(e) => {
                if (draggedId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverSlot({ jour, time });
                }
              }}
              onDragLeave={() => {
                if (dragOverSlot?.jour === jour && dragOverSlot?.time === time) {
                  setDragOverSlot(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedId) {
                  moveCreneau(draggedId, jour, time);
                  setDraggedId(null);
                  setDragOverSlot(null);
                }
              }}
            />
          );
        })}
      </div>
    );
  }

  // Render creneaux as absolutely positioned overlays. Les créneaux qui
  // partagent exactement le même horaire (sessions dédoublées en groupes
  // A/B) sont regroupés et affichés côte à côte plutôt que superposés — sans
  // ça, un seul des deux groupes était visible/cliquable.
  function renderCreneauxForDay(jour: Jour) {
    const jourCreneaux = classeEmplois.filter((c) => c.jour === jour);

    const parHoraire = new Map<string, EmploiCreneau[]>();
    for (const c of jourCreneaux) {
      const key = `${c.heureDebut}-${c.heureFin}`;
      if (!parHoraire.has(key)) parHoraire.set(key, []);
      parHoraire.get(key)!.push(c);
    }

    return [...parHoraire.values()].map((group) => {
      const startIdx = slotIndexIn(group[0].heureDebut, ALL_SLOTS);
      const endIdx = slotIndexIn(group[0].heureFin, ALL_SLOTS);
      if (startIdx < 0 || endIdx < 0) return null;

      const top = startIdx * SLOT_HEIGHT;
      const height = (endIdx - startIdx) * SLOT_HEIGHT;

      return (
        <div
          key={`${jour}-${group[0].heureDebut}-${group[0].heureFin}`}
          className="absolute left-1 right-1 flex gap-1 pointer-events-none"
          style={{ top: top + 2, height: height - 4 }}
        >
          {group.map((creneau) => {
            const { salleAffichee, groupe } = parseGroupe(creneau.salle);
            return (
              <div
                key={creneau.id}
                draggable
                onDragStart={(e) => {
                  setDraggedId(creneau.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", creneau.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverSlot(null);
                }}
                className={cn(
                  "relative flex-1 min-w-0 rounded-lg border overflow-hidden group cursor-grab active:cursor-grabbing transition-all pointer-events-auto",
                  matiereColor(creneau.matiere.couleur),
                  draggedId === creneau.id && "opacity-50 ring-2 ring-green-500"
                )}
              >
                <div className="p-1.5 h-full flex flex-col justify-between">
                  <div className="flex items-start gap-1">
                    <GripVertical className="w-3 h-3 opacity-40 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight truncate">
                        {creneau.matiere.code}
                        {groupe && <span className="ml-1 opacity-70">· Gr.{groupe}</span>}
                      </p>
                      {height >= 80 && (
                        <p className="text-xs opacity-80 truncate leading-tight mt-0.5">
                          {creneau.matiere.nom}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-xs opacity-70 leading-tight">
                    {height >= 64 && creneau.enseignant && (
                      <p className="truncate">{creneau.enseignant.user.name}</p>
                    )}
                    {height >= 48 && salleAffichee && (
                      <p className="truncate">{salleAffichee}</p>
                    )}
                    <p>{creneau.heureDebut}→{creneau.heureFin}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCreneau(creneau.id); }}
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
    });
  }

  // Compteur d'heures hebdo
  const totalHeures = classeEmplois.reduce((sum, c) => {
    return sum + (timeToMinutes(c.heureFin) - timeToMinutes(c.heureDebut)) / 60;
  }, 0);

  // Get available slots for the add modal
  const availableSlotsForAdd = ALL_SLOTS;

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
            onClick={() => setShowSuggest(true)}
            disabled={!selectedClasse}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            size="sm"
          >
            <Sparkles className="w-4 h-4" />
            Optimiser
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

      {/* Info banner */}
      <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-2 flex items-center gap-2">
        <GripVertical className="w-4 h-4" />
        <span>Glissez-déposez les cours pour les déplacer. Horaires : 07:00–18:00 (tous les jours)</span>
      </div>

      {/* Grille horaire */}
      {selectedClasse ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header jours */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="p-3 text-xs text-gray-400 font-medium"></div>
                {JOURS.map((j) => (
                  <div key={j} className="p-3 text-center border-l border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{JOURS_LABELS[j]}</p>
                  </div>
                ))}
              </div>

              {/* Body: time labels + day columns with creneaux */}
              <div className="relative flex">
                {/* Time labels column */}
                <div className="w-[60px] flex-shrink-0">
                  {ALL_SLOTS.map((time, idx) => (
                    <div
                      key={time}
                      className="flex items-start justify-end pr-3 pt-1 border-b border-gray-100 dark:border-gray-800"
                      style={{ height: SLOT_HEIGHT }}
                    >
                      {idx % 2 === 0 && <span className="text-xs text-gray-400">{time}</span>}
                    </div>
                  ))}
                </div>

                {/* Day columns container */}
                <div className="flex-1 relative">
                  {/* Grid background (drop zones) */}
                  <div className="grid grid-cols-7 relative">
                    {JOURS.map((jour) => renderDayColumn(jour))}
                  </div>

                  {/* Absolutely positioned creneaux overlay — pointer-events-none on container, auto only on creneaux */}
                  <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                    {JOURS.map((jour) => (
                      <div key={jour} className="relative">
                        {renderCreneauxForDay(jour)}
                      </div>
                    ))}
                  </div>
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
          matiereToEnseignants={matiereToEnseignants}
          salles={salles}
          disponibilites={disponibilites}
          emploisExistants={emplois}
          availableSlots={availableSlotsForAdd}
          onClose={() => setShowAdd(false)}
          onAdded={addCreneau}
        />
      )}

      {showSuggest && selectedClasse && (
        <SmartSuggestPanel
          classeId={selectedClasse.id}
          classeNom={selectedClasse.nom}
          matieres={matieres}
          enseignants={enseignants}
          matiereToEnseignants={matiereToEnseignants}
          onClose={() => setShowSuggest(false)}
          onGenerated={(creneaux) => {
            setEmplois((prev) => [...prev, ...(creneaux as EmploiCreneau[])]);
          }}
          onReplaced={(creneaux) => {
            // auto-generate DELETES all existing creneaux for this class/year in DB
            // So we must REPLACE, not append — remove old creneaux for this class and add new ones
            const newCreneaux = creneaux as EmploiCreneau[];
            setEmplois((prev) => {
              const otherClasses = prev.filter(
                (e) => e.classe.nom !== selectedClasse.nom &&
                       (e as { classeId?: string }).classeId !== selectedClasse.id
              );
              return [...otherClasses, ...newCreneaux];
            });
          }}
        />
      )}
    </div>
  );
}
