"use client";

/**
 * EcolPro — Hook d'état pour l'Emploi du Temps
 * ============================================================
 *
 * Extrait la logique de gestion d'état de `EmploiDuTempsView.tsx`
 * (1 190 lignes) pour réduire sa taille et améliorer la testabilité.
 *
 * Gère :
 * - Les créneaux (emplois) et leur filtrage par classe/période
 * - La sélection de classe et de période
 * - L'ajout, suppression et déplacement de créneaux
 * - Le drag-and-drop avec détection de conflits
 */

import { useState, useTransition, useRef, useCallback, useMemo } from "react";

// ============================================================
// TYPES
// ============================================================

export type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

export interface EmploiCreneau {
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
  periodeId?: string | null;
}

export interface Classe {
  id: string;
  nom: string;
  niveau: string;
  structureType?: string | null;
}

// ============================================================
// UTILITAIRES
// ============================================================

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Extrait le groupe (A/B) d'un libellé de salle.
 * "Salle 02 (Groupe A)" → { salleAffichee: "Salle 02", groupe: "A" }
 */
function parseGroupe(salle: string | null): { salleAffichee: string | null; groupe: string | null } {
  if (!salle) return { salleAffichee: null, groupe: null };
  const m = salle.match(/^(.*)\s\(Groupe (\w+)\)$/);
  if (m) return { salleAffichee: m[1], groupe: m[2] };
  return { salleAffichee: salle, groupe: null };
}

// ============================================================
// HOOK
// ============================================================

export interface UseEdtStateOptions {
  initial: EmploiCreneau[];
  classes: Classe[];
  readOnly?: boolean;
}

export interface UseEdtStateResult {
  // État
  emplois: EmploiCreneau[];
  selectedClasse: Classe | null;
  selectedPeriodeId: string;
  showAdd: boolean;
  showSuggest: boolean;
  isPending: boolean;
  draggedId: string | null;
  dragOverSlot: { jour: Jour; time: string } | null;
  showExport: boolean;
  showImport: boolean;

  // Mémoïsations
  creneauxParClasse: Record<string, number>;
  classeEmplois: EmploiCreneau[];

  // Mutateurs
  setSelectedClasse: (c: Classe | null) => void;
  setSelectedPeriodeId: (id: string) => void;
  setShowAdd: (v: boolean) => void;
  setShowSuggest: (v: boolean) => void;
  setShowExport: (v: boolean) => void;
  setShowImport: (v: boolean) => void;
  setDraggedId: (id: string | null) => void;
  setDragOverSlot: (slot: { jour: Jour; time: string } | null) => void;

  // Actions
  addCreneau: (c: EmploiCreneau) => void;
  deleteCreneau: (id: string) => Promise<void>;
  moveCreneau: (id: string, newJour: Jour, newHeureDebut: string) => Promise<void>;
  setEmplois: React.Dispatch<React.SetStateAction<EmploiCreneau[]>>;

  // Référence
  dragOffsetRef: React.MutableRefObject<number>;
}

export function useEdtState({
  initial,
  classes,
  readOnly = false,
}: UseEdtStateOptions): UseEdtStateResult {
  const [emplois, setEmplois] = useState<EmploiCreneau[]>(initial);
  const [selectedClasse, setSelectedClasse] = useState<Classe | null>(classes[0] ?? null);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ jour: Jour; time: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const dragOffsetRef = useRef(0);

  // Compte des créneaux existants par classe
  const creneauxParClasse = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of emplois) {
      const cid = e.classeId;
      if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
    }
    return counts;
  }, [emplois]);

  // Créneaux filtrés par classe et période sélectionnées
  const classeEmplois = useMemo(
    () =>
      selectedClasse
        ? emplois.filter((e) => {
            if ((e as { classeId?: string }).classeId !== selectedClasse.id) return false;
            if (!selectedPeriodeId) return true;
            const ePeriodeId = (e as { periodeId?: string | null }).periodeId ?? null;
            return ePeriodeId === selectedPeriodeId || ePeriodeId === null;
          })
        : [],
    [selectedClasse, emplois, selectedPeriodeId]
  );

  function addCreneau(c: EmploiCreneau) {
    setEmplois((prev) => [...prev, c]);
  }

  function deleteCreneau(id: string) {
    return new Promise<void>((resolve, reject) => {
      if (readOnly) {
        resolve();
        return;
      }
      startTransition(async () => {
        try {
          const res = await fetch(`/api/emploi-du-temps/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Delete failed");
          setEmplois((prev) => prev.filter((e) => e.id !== id));
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  const moveCreneau = useCallback(
    async (id: string, newJour: Jour, newHeureDebut: string) => {
      if (readOnly) return;

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
        if (c.id === id) return false;
        if (c.jour !== newJour) return false;
        const cDebut = timeToMinutes(c.heureDebut);
        const cFin = timeToMinutes(c.heureFin);
        return newDebutMin < cFin && newFinMin > cDebut;
      });

      for (const other of conflicting) {
        const otherGroup = parseGroupe(other.salle).groupe;
        if (draggedGroup && otherGroup && draggedGroup !== otherGroup) continue;
        // Conflit — l'appelant gère l'affichage du toast
        throw new Error("CONFLICT");
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
          throw new Error(data.error ?? "Move failed");
        }
      } catch (err) {
        // Rollback on failure
        setEmplois((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, jour: creneau.jour, heureDebut: creneau.heureDebut, heureFin: creneau.heureFin } : e
          )
        );
        throw err;
      }
    },
    [emplois, classeEmplois, readOnly]
  );

  return {
    emplois,
    selectedClasse,
    selectedPeriodeId,
    showAdd,
    showSuggest,
    isPending,
    draggedId,
    dragOverSlot,
    showExport,
    showImport,
    creneauxParClasse,
    classeEmplois,
    setSelectedClasse,
    setSelectedPeriodeId,
    setShowAdd,
    setShowSuggest,
    setShowExport,
    setShowImport,
    setDraggedId,
    setDragOverSlot,
    addCreneau,
    deleteCreneau,
    moveCreneau,
    setEmplois,
    dragOffsetRef,
  };
}
