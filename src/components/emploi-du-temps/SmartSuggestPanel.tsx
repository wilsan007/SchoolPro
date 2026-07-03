"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Loader2, CheckCircle2, AlertCircle, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const JOURS_LABELS: Record<string, string> = {
  DIMANCHE: "Dimanche", LUNDI: "Lundi", MARDI: "Mardi", MERCREDI: "Mercredi",
  JEUDI: "Jeudi", VENDREDI: "Vendredi", SAMEDI: "Samedi",
};

export function SmartSuggestPanel({
  classeId,
  classeNom,
  matieres,
  enseignants,
  onClose,
  onGenerated,
}: {
  classeId: string;
  classeNom: string;
  matieres: Matiere[];
  enseignants: Enseignant[];
  onClose: () => void;
  onGenerated: (creneaux: unknown[]) => void;
}) {
  const [matiereId, setMatiereId] = useState(matieres[0]?.id ?? "");
  const [enseignantId, setEnseignantId] = useState("");
  const [duree, setDuree] = useState(60);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [isPending, startTransition] = useTransition();

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
      if (!data.suggestions?.length) toast.info("Aucun créneau disponible trouvé");
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
        toast.success(`Créneau ajouté : ${JOURS_LABELS[s.jour]} ${s.heureDebut}`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  async function autoGenerate() {
    setAutoGenerating(true);
    try {
      const res = await fetch("/api/emploi-du-temps/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      onGenerated(data.creneaux ?? []);
      toast.success(`${data.stats?.totalCreated ?? 0} créneau(x) généré(s)`);
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
            <h2 className="text-lg font-semibold">Optimisation — {classeNom}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Auto-generate */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                Génération automatique
              </h3>
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-400">
              Génère un emploi du temps complet en évitant les conflits de professeurs et de salles, et en répartissant les matières de manière optimale.
            </p>
            <Button
              onClick={autoGenerate}
              disabled={autoGenerating}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              {autoGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours…</>
              ) : (
                <><Wand2 className="w-4 h-4" /> Générer automatiquement</>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs text-gray-400">ou suggestions ciblées</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Manual suggestion */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Matière</label>
                <select
                  value={matiereId}
                  onChange={(e) => setMatiereId(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Enseignant</label>
                <select
                  value={enseignantId}
                  onChange={(e) => setEnseignantId(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Tous</option>
                  {enseignants.map((e) => <option key={e.id} value={e.id}>{e.user.name ?? "?"}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Durée</label>
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
                <><Loader2 className="w-4 h-4 animate-spin" /> Recherche…</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Suggérer des créneaux</>
              )}
            </Button>
          </div>

          {/* Suggestions list */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Créneaux suggérés ({suggestions.length})
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
                        {JOURS_LABELS[s.jour]} {s.heureDebut}–{s.heureFin}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.enseignantNom ?? "Non assigné"}
                        {s.salle && ` • ${s.salle}`}
                        {` • Score: ${s.score}%`}
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
                    Ajouter
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
