"use client";

import { useState, useTransition, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Clock, Printer, GripVertical, Sparkles, AlertCircle, CheckCircle2, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SmartSuggestPanel } from "./SmartSuggestPanel";
import { useTranslations } from "next-intl";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

const JOURS: Jour[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

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
interface Indisponibilite { id: string; enseignantId: string; jour: string; heureDebut: string; heureFin: string; source: string; sourceLibelle: string | null }
interface Periode { id: string; nom: string; numero: number }
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
  indisponibilites,
  emploisExistants,
  availableSlots,
  periodeId,
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
  indisponibilites: Indisponibilite[];
  emploisExistants: EmploiCreneau[];
  availableSlots: string[];
  periodeId?: string;
  onClose: () => void;
  onAdded: (c: EmploiCreneau) => void;
}) {
  const t = useTranslations("emploi");
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
  // and not indisponible (occupied elsewhere, on leave, in training, etc.)
  const enseignantDisponible = (() => {
    if (!form.enseignantId) return true;
    const debutMin = timeToMinutes(form.heureDebut);
    const finMin = timeToMinutes(form.heureFin);
    // Vérifier les indisponibilités (occupations externes, congés, formations)
    const indispo = indisponibilites.filter(
      (d) => d.enseignantId === form.enseignantId && d.jour === form.jour
    );
    const estIndisponible = indispo.some(
      (d) => timeToMinutes(d.heureDebut) < finMin && timeToMinutes(d.heureFin) > debutMin
    );
    if (estIndisponible) return false;
    // Vérifier les disponibilités déclarées
    const dispo = disponibilites.filter(
      (d) => d.enseignantId === form.enseignantId && d.jour === form.jour
    );
    if (dispo.length === 0) return false; // No availability set for this day
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
          body: JSON.stringify({ ...form, periodeId: periodeId || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("deleteError"));
        onAdded(data);
        toast.success(t("slotAddedToast"));
        onClose();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("deleteError"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">{t("newSlot")}</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("class")}</label>
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("subjectLabel")}</label>
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("teacherLabel")}</label>
            {filteredEnseignants.length > 0 ? (
              <select
                value={form.enseignantId}
                onChange={(e) => setForm({ ...form, enseignantId: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">{t("unassigned")}</option>
                {filteredEnseignants.map((e) => <option key={e.id} value={e.id}>{e.user.name ?? t("teacherLabel")}</option>)}
              </select>
            ) : (
              <p className="text-xs text-gray-400 italic py-2">
                {t("noTeacherForMatiere")}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("dayLabel")}</label>
            <select
              required
              value={form.jour}
              onChange={(e) => setForm({ ...form, jour: e.target.value as Jour })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {JOURS.map((j) => <option key={j} value={j}>{t(`daysShort.${j}`)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("startLabel")}</label>
              <select
                required
                value={form.heureDebut}
                onChange={(e) => setForm({ ...form, heureDebut: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {availableSlots.slice(0, -1).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("endLabel")}</label>
              <select
                required
                value={form.heureFin}
                onChange={(e) => setForm({ ...form, heureFin: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {availableSlots.slice(1).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </div>
          </div>
          {/* Avertissement disponibilité enseignant */}
          {form.enseignantId && !enseignantDisponible && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{t("teacherNotAvailable", { jour: t(`daysShort.${form.jour}`), debut: form.heureDebut, fin: form.heureFin })}</span>
            </div>
          )}
          {form.enseignantId && enseignantDisponible && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg p-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{t("teacherAvailable")}</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              {t("roomLabel")} {sallesDisponibles.length > 0 && <span className="text-xs text-gray-400">({t("roomsAvailable", { count: sallesDisponibles.length })})</span>}
            </label>
            {salles.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                {t("noRooms")}
              </p>
            ) : sallesDisponibles.length > 0 ? (
              <select
                value={form.salle}
                onChange={(e) => setForm({ ...form, salle: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">{t("noRoom")}</option>
                {sallesDisponibles.map((s) => (
                  <option key={s.id} value={s.nom}>
                    {s.nom}{s.capacite ? ` (cap. ${s.capacite})` : ""}{s.type ? ` — ${s.type}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-600 italic py-2">
                {t("allRoomsOccupied")}
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>{t("cancel")}</Button>
            <Button
              type="submit"
              disabled={isPending || (form.enseignantId !== "" && !enseignantDisponible)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("addBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EmploiDuTempsView({
  classes,
  hierarchie,
  matieres,
  enseignants,
  emplois: initial,
  matiereToEnseignants,
  salles,
  disponibilites,
  indisponibilites = [],
  periodes = [],
  readOnly = false,
}: {
  classes: Classe[];
  /** Hiérarchie catégorie → niveau → classe (scope enseignant appliqué). */
  hierarchie?: ClassesHierarchie;
  matieres: Matiere[];
  enseignants: Enseignant[];
  emplois: EmploiCreneau[];
  matiereToEnseignants: Record<string, { id: string; user: { name: string | null } }[]>;
  salles: Salle[];
  disponibilites: Disponibilite[];
  indisponibilites?: Indisponibilite[];
  periodes?: Periode[];
  tenantId: string;
  /** Mode consultation : masque la création, la suppression et le drag-drop. */
  readOnly?: boolean;
}) {
  const t = useTranslations("emploi");
  const [emplois, setEmplois] = useState<EmploiCreneau[]>(initial);
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ jour: Jour; time: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const dragOffsetRef = useRef(0);

  // Mémoïsé : recalculé à chaque rendu, ce tableau changeait d'identité en
  // permanence et invalidait le `useCallback` de déplacement de créneau, qui
  // en dépend — la mémoïsation ne servait donc plus à rien.
  const classeEmplois = useMemo(
    () =>
      selectedClasse
        ? emplois.filter(
            (e) => {
              // Rapprochement par identifiant UNIQUEMENT. Le repli sur le nom
              // de classe confondait les homonymes : un établissement à deux
              // campus a une « 3ème A » sur chacun, et la grille superposait
              // les deux — 52 h affichées au lieu de 26, chaque case portant
              // deux cours à la fois.
              if ((e as { classeId?: string }).classeId !== selectedClasse.id) return false;
              // Filtre par période : si une période est sélectionnée, on affiche
              // les créneaux de cette période + les créneaux annuels (periodeId null)
              if (!selectedPeriodeId) return true;
              const ePeriodeId = (e as { periodeId?: string | null }).periodeId ?? null;
              return ePeriodeId === selectedPeriodeId || ePeriodeId === null;
            }
          )
        : [],
    [selectedClasse, emplois, selectedPeriodeId]
  );

  function addCreneau(c: EmploiCreneau) {
    setEmplois((prev) => [...prev, c]);
  }

  function deleteCreneau(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/emploi-du-temps/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setEmplois((prev) => prev.filter((e) => e.id !== id));
        toast.success(t("slotDeletedToast"));
      } catch {
        toast.error(t("deleteError"));
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

    // Check conflicts with existing creneaux at the target slot
    const draggedGroup = parseGroupe(creneau.salle).groupe;
    const conflicting = classeEmplois.filter((c) => {
      if (c.id === id) return false; // skip self
      if (c.jour !== newJour) return false;
      const cDebut = timeToMinutes(c.heureDebut);
      const cFin = timeToMinutes(c.heureFin);
      // Check time overlap
      return newDebutMin < cFin && newFinMin > cDebut;
    });

    for (const other of conflicting) {
      const otherGroup = parseGroupe(other.salle).groupe;
      // Two different groups (A + B) can share the same slot
      if (draggedGroup && otherGroup && draggedGroup !== otherGroup) continue;
      // Any other combination is a conflict — show clear feedback
      const reason = !draggedGroup && !otherGroup
        ? t("conflictBothTroncCommun")
        : !draggedGroup || !otherGroup
        ? t("conflictTroncCommunGroup")
        : t("conflictSameGroup", { group: draggedGroup ?? "" });
      toast.error(reason, { duration: 5000 });
      return;
    }

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
        throw new Error(data.error ?? t("moveError"));
      }
      toast.success(t("slotMovedToast", { jour: t(`daysShort.${newJour}`), heure: newHeureDebut }));
    } catch (e: unknown) {
      // Revert on error
      setEmplois((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, jour: creneau.jour, heureDebut: oldDebut, heureFin: oldFin } : e
        )
      );
      toast.error(e instanceof Error ? e.message : t("moveError"), { duration: 5000 });
    }
  }, [emplois, classeEmplois, t]);

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
                if (!readOnly && draggedId) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverSlot({ jour, time });
                }
              }}
              onDragEnter={(e) => {
                if (!readOnly && draggedId) {
                  e.preventDefault();
                }
              }}
              onDragLeave={() => {
                if (dragOverSlot?.jour === jour && dragOverSlot?.time === time) {
                  setDragOverSlot(null);
                }
              }}
              onDrop={(e) => {
                if (readOnly) return;
                e.preventDefault();
                e.stopPropagation();
                if (draggedId) {
                  console.log('[drag-drop] Drop on', jour, time, 'draggedId:', draggedId);
                  moveCreneau(draggedId, jour, time);
                  setDraggedId(null);
                  setDragOverSlot(null);
                } else {
                  console.log('[drag-drop] Drop but no draggedId!');
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
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) { e.preventDefault(); return; }
                  console.log('[drag-drop] dragStart on creneau', creneau.id, creneau.matiere.code);
                  setDraggedId(creneau.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", creneau.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverSlot(null);
                }}
                className={cn(
                  "relative flex-1 min-w-0 rounded-lg border overflow-hidden group transition-all",
                  matiereColor(creneau.matiere.couleur),
                  !readOnly && "cursor-grab active:cursor-grabbing",
                  draggedId === creneau.id && "opacity-50 ring-2 ring-green-500",
                  // When dragging, disable pointer-events on all cards so drop events
                  // reach the grid cells underneath. The dragged card keeps pointer-events
                  // so the dragstart/dragend still work.
                  draggedId && draggedId !== creneau.id ? "pointer-events-none" : "pointer-events-auto"
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
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCreneau(creneau.id); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 rounded-full p-0.5 shadow"
                    title={t("deleteTitle")}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                )}
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

  async function handleExportExcel() {
    setShowExport(false);
    try {
      const params = new URLSearchParams({ format: "excel", scope: "classe" });
      if (selectedClasse) params.set("classeId", selectedClasse.id);
      if (selectedPeriodeId) params.set("periodeId", selectedPeriodeId);
      const res = await fetch(`/api/emploi-du-temps/export?${params.toString()}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `emploi-du-temps-${selectedClasse?.nom ?? "all"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportError"));
    }
  }

  function handleExportPdf() {
    setShowExport(false);
    const params = new URLSearchParams({ format: "pdf", scope: "classe" });
    if (selectedClasse) params.set("classeId", selectedClasse.id);
    if (selectedPeriodeId) params.set("periodeId", selectedPeriodeId);
    window.open(`/api/emploi-du-temps/export?${params.toString()}`, "_blank");
  }

  function handlePrint() {
    setShowExport(false);
    window.print();
  }

  // Get available slots for the add modal
  const availableSlotsForAdd = ALL_SLOTS;

  return (
    <div className="space-y-6">
      {/* Styles d'impression : masque les contrôles et optimise la grille */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          #emploi-print-area {
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            background: white !important;
          }
          #emploi-print-area .min-w-\[900px\] { min-width: auto !important; }
          #emploi-print-area .overflow-x-auto { overflow: visible !important; }
        }
      `}</style>

      {/* Classe selector + Period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 print:hidden">
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
        {/* Sélecteur de période (trimestre) */}
        {periodes.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={selectedPeriodeId}
              onChange={(e) => setSelectedPeriodeId(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium"
            >
              <option value="">{t("allPeriods")}</option>
              {periodes.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {selectedClasse && (
            <span className="text-sm text-gray-500">
              <Clock className="w-4 h-4 inline mr-1" />
              {t("hoursPerWeek", { count: totalHeures })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-2 w-full sm:w-auto"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4" />
            {t("print")}
          </Button>
          <div className="relative w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => setShowExport(!showExport)}
            >
              <Download className="w-4 h-4" />
              {t("export")}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 mt-1 w-48 bg-popover border rounded-lg shadow-lg py-1 z-50">
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    {t("exportExcel")}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-600" />
                    {t("exportPdf")}
                  </button>
                  <div className="border-t my-1" />
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    {t("print")}
                  </button>
                </div>
              </>
            )}
          </div>
          {!readOnly && (
            <Button
              onClick={() => setShowSuggest(true)}
              disabled={!selectedClasse}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
              size="sm"
            >
              <Sparkles className="w-4 h-4" />
              {t("optimize")}
            </Button>
          )}
          {!readOnly && (
            <Button
              onClick={() => setShowAdd(true)}
              disabled={!selectedClasse}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              {t("addSlotBtn")}
            </Button>
          )}
        </div>
      </div>

      {/* Info banner — masqué en consultation : pas de drag-drop à expliquer. */}
      {!readOnly && (
        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-2 flex items-center gap-2 print:hidden">
          <GripVertical className="w-4 h-4" />
          <span>{t("dragHint")}</span>
        </div>
      )}

      {/* Grille horaire */}
      {selectedClasse ? (
        <Card id="emploi-print-area" className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header jours */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="p-3 text-xs text-gray-400 font-medium"></div>
                {JOURS.map((j) => (
                  <div key={j} className="p-3 text-center border-l border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t(`daysShort.${j}`)}</p>
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
            <p>{t("selectClass")}</p>
          </CardContent>
        </Card>
      )}

      {showAdd && !readOnly && selectedClasse && (
        <AddCreneauModal
          classeId={selectedClasse.id}
          classes={classes}
          matieres={matieres}
          enseignants={enseignants}
          matiereToEnseignants={matiereToEnseignants}
          salles={salles}
          disponibilites={disponibilites}
          indisponibilites={indisponibilites}
          emploisExistants={emplois}
          availableSlots={availableSlotsForAdd}
          periodeId={selectedPeriodeId}
          onClose={() => setShowAdd(false)}
          onAdded={addCreneau}
        />
      )}

      {showSuggest && !readOnly && selectedClasse && (
        <SmartSuggestPanel
          classeId={selectedClasse.id}
          classeNom={selectedClasse.nom}
          matieres={matieres}
          enseignants={enseignants}
          matiereToEnseignants={matiereToEnseignants}
          periodeId={selectedPeriodeId}
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
