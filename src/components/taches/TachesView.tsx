"use client";

import { useState, useTransition } from "react";
import {
  ListTodo,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Calendar,
  User,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

interface Tache {
  id: string;
  titre: string;
  description: string | null;
  type: string;
  priorite: string;
  statut: string;
  echeance: string | null;
  dateFaite: string | null;
  assigneeA: { id: string; name: string | null; email: string | null };
  creePar: { id: string; name: string | null } | null;
  classe: { id: string; nom: string } | null;
  matiere: { id: string; nom: string } | null;
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface Props {
  taches: Tache[];
  users: User[];
}

const STATUT_LABELS: Record<string, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  FAIT: "Fait",
  ANNULE: "Annulé",
};

const STATUT_ICONS: Record<string, React.ReactNode> = {
  A_FAIRE: <Circle className="w-4 h-4 text-gray-400" />,
  EN_COURS: <Loader2 className="w-4 h-4 text-blue-500" />,
  FAIT: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  ANNULE: <AlertCircle className="w-4 h-4 text-red-500" />,
};

const PRIORITE_COLORS: Record<string, string> = {
  BASSE: "bg-gray-50 text-gray-600 border-gray-200",
  NORMALE: "bg-blue-50 text-blue-600 border-blue-200",
  HAUTE: "bg-orange-50 text-orange-600 border-orange-200",
  URGENTE: "bg-red-50 text-red-600 border-red-200",
};

export function TachesView({ taches: initial, users }: Props) {
  const [taches, setTaches] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);

  const filtered = filter === "ALL"
    ? taches
    : taches.filter((t) => t.statut === filter);

  const stats = {
    aFaire: taches.filter((t) => t.statut === "A_FAIRE").length,
    enCours: taches.filter((t) => t.statut === "EN_COURS").length,
    fait: taches.filter((t) => t.statut === "FAIT").length,
    enRetard: taches.filter(
      (t) => t.statut !== "FAIT" && t.statut !== "ANNULE" && t.echeance && new Date(t.echeance) < new Date()
    ).length,
  };

  async function changerStatut(id: string, statut: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/taches/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        if (!res.ok) throw new Error("Échec");
        setTaches((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, statut, dateFaite: statut === "FAIT" ? new Date().toISOString() : t.dateFaite }
              : t
          )
        );
        toast.success("Statut mis à jour");
      } catch {
        toast.error("Erreur lors de la mise à jour");
      }
    });
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Stats + filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "A_FAIRE", "EN_COURS", "FAIT"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === s
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {s === "ALL" ? "Toutes" : STATUT_LABELS[s]}
              {s !== "ALL" && (
                <span className="ml-1.5 text-xs opacity-60">
                  {s === "A_FAIRE" ? stats.aFaire : s === "EN_COURS" ? stats.enCours : stats.fait}
                </span>
              )}
            </button>
          ))}
        </div>
        {stats.enRetard > 0 && (
          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
            {stats.enRetard} en retard
          </Badge>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Nouvelle tâche
        </Button>
      </div>

      {/* Formulaire de création rapide */}
      {showForm && (
        <CreateTacheForm
          users={users}
          onCreate={(tache) => {
            setTaches((prev) => [tache, ...prev]);
            setShowForm(false);
          }}
        />
      )}

      {/* Liste des tâches */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Aucune tâche {filter !== "ALL" ? "avec ce statut" : ""}.</p>
          </div>
        )}
        {filtered.map((t) => {
          const enRetard = t.statut !== "FAIT" && t.statut !== "ANNULE" && t.echeance && new Date(t.echeance) < new Date();
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
            >
              <button
                onClick={() => changerStatut(t.id, t.statut === "FAIT" ? "A_FAIRE" : "FAIT")}
                className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform"
                disabled={isPending}
              >
                {STATUT_ICONS[t.statut]}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${t.statut === "FAIT" ? "line-through text-gray-400" : "text-gray-900"}`}>
                    {t.titre}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 h-4 ${PRIORITE_COLORS[t.priorite] ?? PRIORITE_COLORS.NORMALE}`}
                  >
                    {t.priorite}
                  </Badge>
                  {t.classe && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {t.classe.nom}
                    </Badge>
                  )}
                  {t.matiere && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {t.matiere.nom}
                    </Badge>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-gray-500 mt-1">{t.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <User className="w-3 h-3" />
                    {t.assigneeA.name ?? t.assigneeA.email}
                  </span>
                  {t.echeance && (
                    <span className={`flex items-center gap-0.5 ${enRetard ? "text-red-500 font-medium" : ""}`}>
                      <Calendar className="w-3 h-3" />
                      {formatDate(t.echeance)}
                      {enRetard && " (en retard)"}
                    </span>
                  )}
                </div>
              </div>
              {/* Actions rapides */}
              {t.statut !== "FAIT" && t.statut !== "ANNULE" && (
                <div className="flex gap-1 flex-shrink-0">
                  {t.statut === "A_FAIRE" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => changerStatut(t.id, "EN_COURS")}
                      disabled={isPending}
                    >
                      Démarrer
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-green-600"
                    onClick={() => changerStatut(t.id, "FAIT")}
                    disabled={isPending}
                  >
                    Terminer
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateTacheForm({
  users,
  onCreate,
}: {
  users: User[];
  onCreate: (t: Tache) => void;
}) {
  const [titre, setTitre] = useState("");
  const [assigneeAId, setAssigneeAId] = useState("");
  const [priorite, setPriorite] = useState("NORMALE");
  const [echeance, setEcheance] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim() || !assigneeAId) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/taches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titre: titre.trim(),
            assigneeAId,
            priorite,
            echeance: echeance || undefined,
          }),
        });
        if (!res.ok) throw new Error("Échec");
        const tache = await res.json();
        onCreate({
          id: tache.id,
          titre: tache.titre,
          description: tache.description ?? null,
          type: tache.type ?? "autre",
          priorite: tache.priorite ?? "NORMALE",
          statut: tache.statut ?? "A_FAIRE",
          echeance: tache.echeance ?? null,
          dateFaite: null,
          assigneeA: tache.assigneeA ?? { id: assigneeAId, name: null, email: null },
          creePar: tache.creePar ?? null,
          classe: null,
          matiere: null,
        });
        toast.success("Tâche créée");
        setTitre("");
        setEcheance("");
      } catch {
        toast.error("Erreur lors de la création");
      }
    });
  }

  return (
    <form onSubmit={submit} className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Titre de la tâche…"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          required
        />
        <select
          value={assigneeAId}
          onChange={(e) => setAssigneeAId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          required
        >
          <option value="">Assigner à…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
        <select
          value={priorite}
          onChange={(e) => setPriorite(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        >
          <option value="BASSE">Basse</option>
          <option value="NORMALE">Normale</option>
          <option value="HAUTE">Haute</option>
          <option value="URGENTE">Urgente</option>
        </select>
        <input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}
