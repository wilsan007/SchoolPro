"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Loader2, CheckCircle2, AlertCircle, Plus, Wand2, Check, Users, Split, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Jour = "DIMANCHE" | "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI";

interface Matiere { id: string; nom: string; code: string; couleur: string | null; coefficient: number }
interface Enseignant { id: string; user: { name: string | null } }

interface Suggestion {
  jour: Jour;
  heureDebut: string;
  heureFin: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  score: number;
  conflits: string[];
  raison: string;
}

const JOURS_KEYS: string[] = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

export function SmartSuggestPanel({
  classeId,
  classeNom,
  matieres,
  enseignants,
  matiereToEnseignants,
  onClose,
  onGenerated,
  onReplaced,
}: {
  classeId: string;
  classeNom: string;
  matieres: Matiere[];
  enseignants: Enseignant[];
  matiereToEnseignants: Record<string, { id: string; user: { name: string | null } }[]>;
  onClose: () => void;
  onGenerated: (creneaux: unknown[]) => void;
  onReplaced?: (creneaux: unknown[]) => void;
}) {
  const t = useTranslations("emploi");
  const [matiereId, setMatiereId] = useState(matieres[0]?.id ?? "");
  const [enseignantId, setEnseignantId] = useState("");

  // Filter enseignants: only those who already teach the selected matiere
  const filteredEnseignants = matiereToEnseignants[matiereId] ?? [];
  const [duree, setDuree] = useState(60);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [genReport, setGenReport] = useState<Array<{ matiereNom: string; requested: number; assigned: number; reason: string; details: string[] }>>([]);

  // Advanced generation state
  const [selectedMatiereIds, setSelectedMatiereIds] = useState<Set<string>>(new Set());
  const [heureMin, setHeureMin] = useState("07:00");
  const [heureMax, setHeureMax] = useState("18:00");
  const [selectedJours, setSelectedJours] = useState<Set<string>>(new Set(["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]));

  // Per-matiere config: tronc commun and/or groupes (independent checkboxes), each with its own hours
  type MatiereConfig = {
    troncCommun: boolean;
    troncCommunHeures: number;
    groupes: boolean;
    groupesHeures: number;
    pairedMatiereId: string;
    enseignantId: string;
  };
  const [matiereConfigs, setMatiereConfigs] = useState<Record<string, MatiereConfig>>({});

  function ensureMatiereConfig(id: string) {
    setMatiereConfigs((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { troncCommun: true, troncCommunHeures: 2, groupes: false, groupesHeures: 1, pairedMatiereId: "", enseignantId: "" } };
    });
  }

  function updateMatiereConfig(id: string, patch: Partial<MatiereConfig>) {
    // If setting a pairedMatiereId, auto-select the paired matiere and sync its config
    if (patch.pairedMatiereId !== undefined && patch.pairedMatiereId !== "") {
      const pairedId = patch.pairedMatiereId;
      // Ensure paired matiere is selected
      setSelectedMatiereIds((sel) => {
        const next = new Set(sel);
        next.add(pairedId);
        return next;
      });
      // Sync paired matiere config: same TC and heures, but DON'T force groupes=true
      // The owner generates group slots AND paired slots for the secondary.
      // The secondary only generates its own tronc commun slots.
      // groupes on secondary is always false (group slots come from owner).
      setMatiereConfigs((prev) => {
        const parentCfg = prev[id];
        const updated = { ...prev, [id]: { ...parentCfg, ...patch } };
        updated[pairedId] = {
          troncCommun: parentCfg.troncCommun,
          troncCommunHeures: parentCfg.troncCommunHeures,
          groupes: false, // secondary never generates its own group slots
          groupesHeures: parentCfg.groupesHeures, // keep synced for reference
          pairedMatiereId: id, // reverse link
          enseignantId: prev[pairedId]?.enseignantId ?? "",
        };
        return updated;
      });
      return;
    }

    // If clearing a pairedMatiereId (set to ""), unlock the previously paired matiere
    if (patch.pairedMatiereId !== undefined && patch.pairedMatiereId === "") {
      const prevCfg = matiereConfigs[id];
      if (prevCfg?.pairedMatiereId) {
        const oldPairedId = prevCfg.pairedMatiereId;
        setMatiereConfigs((prev) => {
          const c = { ...prev };
          if (c[oldPairedId]) {
            c[oldPairedId] = { ...c[oldPairedId], pairedMatiereId: "" };
          }
          return c;
        });
      }
    }

    // If updating troncCommun/groupes/heures, also sync to paired matiere
    setMatiereConfigs((prev) => {
      const updated = { ...prev, [id]: { ...prev[id], ...patch } };
      const cfg = updated[id];
      // Sync to any matiere that is paired with this one (reverse link)
      // Only sync TC settings, NOT groupes (secondary never generates group slots)
      for (const [otherId, otherCfg] of Object.entries(updated)) {
        if (otherCfg.pairedMatiereId === id && otherId !== id) {
          updated[otherId] = {
            ...otherCfg,
            troncCommun: cfg.troncCommun,
            troncCommunHeures: cfg.troncCommunHeures,
            groupesHeures: cfg.groupesHeures, // keep synced for reference
            // groupes stays false, enseignantId stays as-is
          };
        }
      }
      return updated;
    });
  }

  // Compute which matieres are paired (locked config from parent)
  const pairedByMatiere = useMemo(() => {
    const map = new Map<string, { parentName: string; parentId: string }>();
    for (const [mId, cfg] of Object.entries(matiereConfigs)) {
      if (cfg.pairedMatiereId) {
        const matiere = matieres.find((m) => m.id === mId);
        // Only mark as paired if this matiere is the "owner" (not the reverse link)
        // A matiere is "paired/locked" if another matiere points to it as pairedMatiereId
        // AND it points back (reverse link)
        map.set(cfg.pairedMatiereId, { parentName: matiere?.nom ?? mId, parentId: mId });
      }
    }
    return map;
  }, [matiereConfigs, matieres]);

  // All enseignants for selected matieres (union)
  const allEnseignantsForSelected = useMemo(() => {
    const map = new Map<string, { id: string; user: { name: string | null } }>();
    for (const mId of selectedMatiereIds) {
      for (const ens of (matiereToEnseignants[mId] ?? [])) {
        if (!map.has(ens.id)) map.set(ens.id, ens);
      }
    }
    return Array.from(map.values());
  }, [selectedMatiereIds, matiereToEnseignants]);

  function toggleMatiere(id: string) {
    // Prevent toggling off a locked/paired matiere
    if (pairedByMatiere.has(id) && selectedMatiereIds.has(id)) {
      return;
    }
    setSelectedMatiereIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setMatiereConfigs((cfg) => {
          const c = { ...cfg };
          delete c[id];
          return c;
        });
      } else {
        next.add(id);
        ensureMatiereConfig(id);
      }
      return next;
    });
  }

  function toggleJour(jour: string) {
    setSelectedJours((prev) => {
      const next = new Set(prev);
      if (next.has(jour)) next.delete(jour); else next.add(jour);
      return next;
    });
  }

  function selectAllMatieres() {
    if (selectedMatiereIds.size === matieres.length) {
      // Deselect all except locked/paired matieres
      setSelectedMatiereIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if (pairedByMatiere.has(id)) next.add(id); // keep locked ones
        }
        return next;
      });
      setMatiereConfigs((prev) => {
        const c: Record<string, MatiereConfig> = {};
        for (const [id, cfg] of Object.entries(prev)) {
          if (pairedByMatiere.has(id)) c[id] = cfg; // keep locked configs
        }
        return c;
      });
    } else {
      const all = new Set(matieres.map((m) => m.id));
      setSelectedMatiereIds(all);
      const cfgs: Record<string, MatiereConfig> = {};
      for (const m of matieres) {
        cfgs[m.id] = { troncCommun: true, troncCommunHeures: 2, groupes: false, groupesHeures: 1, pairedMatiereId: "", enseignantId: "" };
      }
      setMatiereConfigs(cfgs);
    }
  }

  async function fetchSuggestions() {
    setLoading(true);
    setSuggestions([]);
    try {
      const params = new URLSearchParams({ classeId, matiereId, duree: String(duree) });
      if (enseignantId) params.set("enseignantId", enseignantId);

      const res = await fetch(`/api/emploi-du-temps/suggest?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setSuggestions(data.suggestions ?? []);
      if (!data.suggestions?.length) toast.info(t("noSlotsFound"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function addSuggestion(s: Suggestion) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/emploi-du-temps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classeId,
            matiereId,
            enseignantId: s.enseignantId || "",
            jour: s.jour,
            heureDebut: s.heureDebut,
            heureFin: s.heureFin,
            salle: s.salle || "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        onGenerated([data]);
        toast.success(t("slotAdded", { jour: t(`days.${s.jour}`), heure: s.heureDebut }));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  async function autoGenerate() {
    const confirmed = window.confirm(t("confirmAutoGen"));
    if (!confirmed) return;

    setAutoGenerating(true);
    setGenReport([]);
    try {
      const matiereConfigsArr = Array.from(selectedMatiereIds).map((id) => {
        const cfg = matiereConfigs[id];
        return {
          matiereId: id,
          troncCommun: cfg?.troncCommun ?? true,
          troncCommunHeures: cfg?.troncCommunHeures ?? 2,
          groupes: cfg?.groupes ?? false,
          groupesHeures: cfg?.groupesHeures ?? 1,
          pairedMatiereId: cfg?.pairedMatiereId || undefined,
          enseignantId: cfg?.enseignantId || undefined,
        };
      });

      const payload: Record<string, unknown> = {
        classeId,
        matiereConfigs: matiereConfigsArr,
      };
      if (heureMin) payload.heureMin = heureMin;
      if (heureMax) payload.heureMax = heureMax;
      if (selectedJours.size > 0) payload.jours = Array.from(selectedJours);

      const res = await fetch("/api/emploi-du-temps/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Show API error in the report area, not just a toast
        setGenReport([{
          matiereNom: "Erreur",
          requested: 0,
          assigned: 0,
          reason: data.error ?? "Erreur",
          details: [data.error ?? "Erreur"],
        }]);
        throw new Error(data.error ?? "Erreur");
      }
      // auto-generate deletes old creneaux in DB, so use onReplaced to replace UI state
      if (onReplaced) {
        onReplaced(data.creneaux ?? []);
      } else {
        onGenerated(data.creneaux ?? []);
      }
      const stats = data.stats;
      const report = data.report ?? [];
      setGenReport(report);

      const totalCreated = stats?.totalCreated ?? 0;
      const skipped = stats?.skipped ?? 0;
      if (totalCreated > 0) {
        toast.success(
          skipped
            ? t("slotsGeneratedWithSkipped", { count: totalCreated, skipped })
            : t("slotsGenerated", { count: totalCreated })
        );
      } else {
        toast.error(t("noSlotsGenerated"));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAutoGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">{t("optimization", { classeNom })}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Génération avancée */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                {t("autoGenTitle")}
              </h3>
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-400">
              {t("autoGenDescription")}
            </p>

            {/* Sélection des matières */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">{t("subjects")}</label>
                <button
                  onClick={selectAllMatieres}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {selectedMatiereIds.size === matieres.length ? t("deselectAll") : t("selectAll")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg p-2 border border-indigo-100 dark:border-indigo-800">
                {matieres.map((m) => {
                  const checked = selectedMatiereIds.has(m.id);
                  const ensCount = (matiereToEnseignants[m.id] ?? []).length;
                  const pairedBy = pairedByMatiere.get(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMatiere(m.id)}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
                        pairedBy
                          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                          : checked
                            ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-200"
                            : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                        pairedBy ? "bg-amber-200 border-amber-300" : checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300 dark:border-gray-600"
                      )}>
                        {pairedBy ? <Split className="w-3 h-3 text-amber-600" /> : checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="flex-1 truncate">{m.nom}</span>
                      {pairedBy ? (
                        <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title={t("locked", { name: pairedBy.parentName })}>
                          ↔ {pairedBy.parentName}
                        </span>
                      ) : (
                        <span className={cn(
                          "text-[10px] px-1 rounded",
                          ensCount > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-400"
                        )}>
                          {t("ensShort", { count: ensCount })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Plage horaire & jours */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 block mb-1">{t("startTime")}</label>
                <select
                  value={heureMin}
                  onChange={(e) => setHeureMin(e.target.value)}
                  className="w-full border border-indigo-100 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {["07:00","07:30","08:00","08:30","09:00","09:30","10:00"].map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 block mb-1">{t("endTime")}</label>
                <select
                  value={heureMax}
                  onChange={(e) => setHeureMax(e.target.value)}
                  className="w-full border border-indigo-100 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {["16:00","16:30","17:00","17:30","18:00","18:30","19:00"].map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-indigo-900 dark:text-indigo-300 block mb-1">{t("activeDays")}</label>
              <div className="flex flex-wrap gap-1.5">
                {JOURS_KEYS.map((key) => {
                  const checked = selectedJours.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleJour(key)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                        checked
                          ? "bg-indigo-600 text-white"
                          : "bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700"
                      )}
                    >
                      {t(`days.${key}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tableau des matières sélectionnées — configuration par ligne */}
          {selectedMatiereIds.size > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t("matiereConfig", { count: selectedMatiereIds.size })}
                </h3>
              </div>
              <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                {Array.from(selectedMatiereIds).map((mId) => {
                  const matiere = matieres.find((m) => m.id === mId);
                  if (!matiere) return null;
                  const cfg = matiereConfigs[mId] ?? { troncCommun: true, troncCommunHeures: 2, groupes: false, groupesHeures: 1, pairedMatiereId: "", enseignantId: "" };
                  const ens = matiereToEnseignants[mId] ?? [];
                  const otherSelectedMatieres = matieres.filter((m) => m.id !== mId && selectedMatiereIds.has(m.id) && !pairedByMatiere.has(m.id));
                  const isLocked = pairedByMatiere.has(mId);
                  const lockedBy = pairedByMatiere.get(mId);
                  return (
                    <div
                      key={mId}
                      className={cn(
                        "bg-white dark:bg-gray-800 rounded-lg border p-3 space-y-2.5",
                        isLocked ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10" : "border-gray-200 dark:border-gray-700"
                      )}
                    >
                      {/* Ligne 1: nom + badge verrouillé */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                          {matiere.nom}
                        </span>
                        {isLocked && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                            <Split className="w-3 h-3" /> {t("locked", { name: lockedBy?.parentName ?? "" })}
                          </span>
                        )}
                      </div>

                      {isLocked && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1">
                          {t("lockedDescription", { name: lockedBy?.parentName ?? "" })}
                        </div>
                      )}

                      {/* Ligne 2: cases à cocher tronc commun + groupes */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => !isLocked && updateMatiereConfig(mId, { troncCommun: !cfg.troncCommun })}
                          disabled={isLocked}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors flex-1",
                            isLocked && "opacity-60 cursor-not-allowed",
                            cfg.troncCommun
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                          )}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                            cfg.troncCommun ? "bg-white border-white" : "border-gray-400"
                          )}>
                            {cfg.troncCommun && <Check className="w-2.5 h-2.5 text-indigo-600" />}
                          </div>
                          <Users className="w-3 h-3" /> {t("troncCommun")}
                        </button>
                        <button
                          onClick={() => !isLocked && updateMatiereConfig(mId, { groupes: !cfg.groupes })}
                          disabled={isLocked}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors flex-1",
                            isLocked && "opacity-60 cursor-not-allowed",
                            cfg.groupes
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500"
                          )}
                        >
                          <div className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                            cfg.groupes ? "bg-white border-white" : "border-gray-400"
                          )}>
                            {cfg.groupes && <Check className="w-2.5 h-2.5 text-indigo-600" />}
                          </div>
                          <Split className="w-3 h-3" /> {t("twoGroups")}
                        </button>
                      </div>

                      {/* Ligne 3: heures tronc commun (si coché) */}
                      {cfg.troncCommun && (
                        <div className="flex items-center gap-2 pl-1">
                          <Users className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                          <label className="text-[11px] text-gray-500 whitespace-nowrap">{t("troncCommunHours")}</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={cfg.troncCommunHeures}
                            disabled={isLocked}
                            onChange={(e) => updateMatiereConfig(mId, { troncCommunHeures: Math.max(1, Number(e.target.value)) })}
                            className={cn(
                              "w-16 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500",
                              isLocked && "opacity-60 cursor-not-allowed"
                            )}
                          />
                        </div>
                      )}

                      {/* Ligne 4: heures groupes + matière associée (si coché) */}
                      {cfg.groupes && (
                        <>
                          <div className="flex items-center gap-2 pl-1">
                            <Split className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                            <label className="text-[11px] text-gray-500 whitespace-nowrap">{t("groupHours")}</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={cfg.groupesHeures}
                              disabled={isLocked}
                              onChange={(e) => updateMatiereConfig(mId, { groupesHeures: Math.max(1, Number(e.target.value)) })}
                              className={cn(
                                "w-16 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500",
                                isLocked && "opacity-60 cursor-not-allowed"
                              )}
                            />
                          </div>
                          <div className="flex items-center gap-2 pl-1">
                            <label className="text-[11px] text-gray-500 whitespace-nowrap">{t("switchWith")}</label>
                            <select
                              value={cfg.pairedMatiereId}
                              disabled={isLocked}
                              onChange={(e) => updateMatiereConfig(mId, { pairedMatiereId: e.target.value })}
                              className={cn(
                                "flex-1 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500",
                                isLocked && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <option value="">{t("noPair")}</option>
                              {otherSelectedMatieres.map((m) => (
                                <option key={m.id} value={m.id}>{m.nom}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      {/* Ligne 5: enseignant */}
                      <div>
                        <label className="text-[11px] text-gray-500 block mb-0.5">{t("teacher")}</label>
                        {ens.length > 0 ? (
                          <select
                            value={cfg.enseignantId}
                            onChange={(e) => updateMatiereConfig(mId, { enseignantId: e.target.value })}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">{t("auto")}</option>
                            {ens.map((e) => (
                              <option key={e.id} value={e.id}>{e.user.name ?? t("teacher")}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">{t("noTeacher")}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total + bouton générer */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-gray-500">
                  {t("totalHours", { count: Array.from(selectedMatiereIds).reduce((sum, mId) => {
                    const cfg = matiereConfigs[mId];
                    let h = 0;
                    if (cfg?.troncCommun) h += cfg.troncCommunHeures;
                    if (cfg?.groupes) h += cfg.groupesHeures * 2;
                    return sum + h;
                  }, 0) })}
                </div>
                <Button
                  onClick={autoGenerate}
                  disabled={autoGenerating || selectedJours.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                >
                  {autoGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t("generating")}</>
                  ) : (
                    <><Wand2 className="w-4 h-4" /> {t("generate", { count: selectedMatiereIds.size, s: selectedMatiereIds.size > 1 ? "s" : "" })}</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Rapport de génération */}
          {genReport.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t("genReport")}
                </h3>
              </div>
              <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                {genReport.map((r, i) => {
                  const isOk = r.reason === "OK";
                  const isPartial = r.assigned > 0 && r.assigned < r.requested;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border p-2.5 space-y-1",
                        isOk
                          ? "border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800"
                          : isPartial
                          ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800"
                          : "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isOk ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                        ) : isPartial ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                          {r.matiereNom}
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto",
                          isOk
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : isPartial
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        )}>
                          {r.assigned}/{r.requested}
                        </span>
                      </div>
                      {!isOk && (
                        <div className="pl-5 space-y-0.5">
                          {r.details.map((d, j) => (
                            <p key={j} className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                              • {d}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">{t("orTargeted")}</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Manual suggestion */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("subject")}</label>
                <select
                  value={matiereId}
                  onChange={(e) => { setMatiereId(e.target.value); setEnseignantId(""); }}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("teacher")}</label>
                {filteredEnseignants.length > 0 ? (
                  <select
                    value={enseignantId}
                    onChange={(e) => setEnseignantId(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{t("all")}</option>
                    {filteredEnseignants.map((e) => <option key={e.id} value={e.id}>{e.user.name ?? "?"}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400 italic py-2">{t("noTeacherForSubject")}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">{t("duration")}</label>
                <select
                  value={duree}
                  onChange={(e) => setDuree(Number(e.target.value))}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={30}>30 min</option>
                  <option value={60}>1 h</option>
                  <option value={90}>1 h 30</option>
                  <option value={120}>2 h</option>
                </select>
              </div>
            </div>

            <Button
              onClick={fetchSuggestions}
              disabled={loading || !matiereId}
              variant="outline"
              className="w-full gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t("searching")}</>
              ) : (
                <><Sparkles className="w-4 h-4" /> {t("suggestSlots")}</>
              )}
            </Button>
          </div>

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t("suggestedSlots", { count: suggestions.length })}
              </h3>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3",
                    s.conflits.length > 0
                      ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800"
                      : "border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {s.conflits.length > 0 ? (
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {t(`days.${s.jour}`)} {s.heureDebut}–{s.heureFin}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.enseignantNom ?? t("unassigned")}
                        {s.salle && ` • ${s.salle}`}
                        {` • ${t("score", { score: s.score })}`}
                      </p>
                      {s.conflits.length > 0 && (
                        <p className="text-xs text-amber-600 mt-0.5">{s.conflits.join(", ")}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => addSuggestion(s)}
                    disabled={isPending}
                    className="gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Plus className="w-3 h-3" />
                    {t("add")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
