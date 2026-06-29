"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Calendar, Clock, MapPin, Users, BookOpen,
  CheckCircle2, PlayCircle, XCircle, Loader2,
  ChevronDown, ChevronUp, Edit2, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";

type StatutExamen = "PROGRAMME" | "EN_COURS" | "TERMINE" | "ANNULE";

interface SessionExamen {
  id: string;
  matiereNom: string;
  date: string | Date;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
  niveau: string | null;
}

interface Examen {
  id: string;
  intitule: string;
  description: string | null;
  statut: StatutExamen;
  dateDebut: string | Date;
  dateFin: string | Date;
  sessions: SessionExamen[];
}

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface Matiere {
  id: string;
  nom: string;
  code: string;
  coefficient: number;
}

const STATUT_CONFIG: Record<StatutExamen, { label: string; icon: React.ReactNode; badge: string }> = {
  PROGRAMME: { label: "Programmé", icon: <Calendar className="w-3.5 h-3.5" />, badge: "info" },
  EN_COURS: { label: "En cours", icon: <PlayCircle className="w-3.5 h-3.5" />, badge: "warning" },
  TERMINE: { label: "Terminé", icon: <CheckCircle2 className="w-3.5 h-3.5" />, badge: "success" },
  ANNULE: { label: "Annulé", icon: <XCircle className="w-3.5 h-3.5" />, badge: "destructive" },
};

function CreateExamenModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (exam: Examen) => void;
}) {
  const [form, setForm] = useState({
    intitule: "",
    description: "",
    dateDebut: "",
    dateFin: "",
  });
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/examens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onCreated(data);
        toast.success("Examen créé !");
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
          <h2 className="text-lg font-semibold">Créer un examen</h2>
          <p className="text-sm text-gray-500 mt-1">Programmez un examen officiel</p>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Intitulé *
            </label>
            <input
              required
              value={form.intitule}
              onChange={(e) => setForm({ ...form, intitule: e.target.value })}
              placeholder="ex: Baccalauréat 2026"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Description optionnelle..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Date début *
              </label>
              <input
                type="date"
                required
                value={form.dateDebut}
                onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Date fin *
              </label>
              <input
                type="date"
                required
                value={form.dateFin}
                onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Créer l'examen"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddSessionModal({
  examId,
  matieres,
  onClose,
  onAdded,
}: {
  examId: string;
  matieres: Matiere[];
  onClose: () => void;
  onAdded: (session: SessionExamen) => void;
}) {
  const [form, setForm] = useState({
    matiereNom: matieres[0]?.nom ?? "",
    date: "",
    heureDebut: "08:00",
    heureFin: "11:00",
    salle: "",
    niveau: "",
  });
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/examens/${examId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onAdded(data);
        toast.success("Session ajoutée !");
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
          <h2 className="text-lg font-semibold">Ajouter une session</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Matière *</label>
            <select
              required
              value={form.matiereNom}
              onChange={(e) => setForm({ ...form, matiereNom: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {matieres.map((m) => (
                <option key={m.id} value={m.nom}>{m.nom} (coeff. {m.coefficient})</option>
              ))}
              <option value="Autre">Autre matière</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Date *</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Heure début *</label>
              <input
                type="time"
                required
                value={form.heureDebut}
                onChange={(e) => setForm({ ...form, heureDebut: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Heure fin *</label>
              <input
                type="time"
                required
                value={form.heureFin}
                onChange={(e) => setForm({ ...form, heureFin: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Salle</label>
              <input
                value={form.salle}
                onChange={(e) => setForm({ ...form, salle: e.target.value })}
                placeholder="ex: Salle A1"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Niveau</label>
              <input
                value={form.niveau}
                onChange={(e) => setForm({ ...form, niveau: e.target.value })}
                placeholder="ex: Terminale"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
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

function ExamenCard({
  examen,
  matieres,
  onUpdate,
}: {
  examen: Examen;
  matieres: Matiere[];
  onUpdate: (updated: Examen) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [isPending, startTransition] = useTransition();
  const config = STATUT_CONFIG[examen.statut];

  async function changeStatut(statut: StatutExamen) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/examens/${examen.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onUpdate({ ...examen, statut });
        toast.success(`Statut mis à jour : ${STATUT_CONFIG[statut].label}`);
      } catch {
        toast.error("Impossible de changer le statut");
      }
    });
  }

  function addSession(session: SessionExamen) {
    onUpdate({ ...examen, sessions: [...examen.sessions, session] });
  }

  const duree = Math.ceil(
    (new Date(examen.dateFin).getTime() - new Date(examen.dateDebut).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  return (
    <>
      <Card className="overflow-hidden">
        <div
          className={cn(
            "h-1",
            examen.statut === "PROGRAMME" && "bg-blue-500",
            examen.statut === "EN_COURS" && "bg-yellow-500",
            examen.statut === "TERMINE" && "bg-green-500",
            examen.statut === "ANNULE" && "bg-red-400",
          )}
        />
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg leading-tight truncate">
                  {examen.intitule}
                </h3>
                <Badge variant={config.badge as "info" | "warning" | "success" | "destructive"} className="shrink-0">
                  <span className="flex items-center gap-1">
                    {config.icon}
                    {config.label}
                  </span>
                </Badge>
              </div>
              {examen.description && (
                <p className="text-sm text-gray-500 mb-3">{examen.description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-green-600" />
                  {formatDate(examen.dateDebut, "dd/MM/yyyy")} → {formatDate(examen.dateFin, "dd/MM/yyyy")}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-green-600" />
                  {duree} jour{duree > 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-green-600" />
                  {examen.sessions.length} session{examen.sessions.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Actions statut */}
            <div className="flex items-center gap-2 shrink-0">
              {examen.statut === "PROGRAMME" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                  onClick={() => changeStatut("EN_COURS")}
                  disabled={isPending}
                >
                  <PlayCircle className="w-4 h-4" />
                  Démarrer
                </Button>
              )}
              {examen.statut === "EN_COURS" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => changeStatut("TERMINE")}
                  disabled={isPending}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Terminer
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
                className="gap-1.5"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Détails
              </Button>
            </div>
          </div>

          {/* Sessions expandées */}
          {expanded && (
            <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Sessions d&apos;épreuves
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowAddSession(true)}
                  disabled={examen.statut === "ANNULE" || examen.statut === "TERMINE"}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter
                </Button>
              </div>

              {examen.sessions.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucune session planifiée</p>
                  <p className="text-xs mt-1">Ajoutez des épreuves par matière</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {examen.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-green-700 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {s.matiereNom}
                        </p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(s.date, "dd/MM/yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.heureDebut} → {s.heureFin}
                          </span>
                          {s.salle && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {s.salle}
                            </span>
                          )}
                          {s.niveau && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {s.niveau}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Délibération section (visible si terminé) */}
              {examen.statut === "TERMINE" && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Délibération
                  </h4>
                  <DeliberationPanel examId={examen.id} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddSession && (
        <AddSessionModal
          examId={examen.id}
          matieres={matieres}
          onClose={() => setShowAddSession(false)}
          onAdded={addSession}
        />
      )}
    </>
  );
}

function DeliberationPanel({ examId }: { examId: string }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  function submitDeliberation() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/examens/${examId}/deliberation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        });
        if (!res.ok) throw new Error();
        setSubmitted(true);
        toast.success("Délibération enregistrée !");
      } catch {
        toast.error("Erreur lors de la délibération");
      }
    });
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-3 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 rounded-lg px-4 py-3 text-sm">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <span>Délibération enregistrée avec succès. Les résultats peuvent être publiés.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Saisissez les notes finales par matière, puis validez la délibération pour générer les attestations de résultats.
      </p>
      <Button
        size="sm"
        onClick={submitDeliberation}
        disabled={isPending}
        className="bg-green-600 hover:bg-green-700 text-white gap-2"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        Valider la délibération
      </Button>
    </div>
  );
}

export function ExamensManager({
  examens: initial,
  classes,
  matieres,
}: {
  examens: Examen[];
  classes: Classe[];
  matieres: Matiere[];
  tenantId: string;
}) {
  const [examens, setExamens] = useState<Examen[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatut, setFilterStatut] = useState<StatutExamen | "ALL">("ALL");

  const stats = {
    total: examens.length,
    programmes: examens.filter((e) => e.statut === "PROGRAMME").length,
    enCours: examens.filter((e) => e.statut === "EN_COURS").length,
    termines: examens.filter((e) => e.statut === "TERMINE").length,
  };

  const filtered = filterStatut === "ALL" ? examens : examens.filter((e) => e.statut === filterStatut);

  function addExamen(exam: Examen) {
    setExamens((prev) => [exam, ...prev]);
  }

  function updateExamen(updated: Examen) {
    setExamens((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total examens", value: stats.total, color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-50 dark:bg-gray-800" },
          { label: "Programmés", value: stats.programmes, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
          { label: "En cours", value: stats.enCours, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/20" },
          { label: "Terminés", value: stats.termines, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-xl p-4 text-center", s.bg)}>
            <p className={cn("text-3xl font-black", s.color)}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "PROGRAMME", "EN_COURS", "TERMINE", "ANNULE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatut(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                filterStatut === s
                  ? "bg-primary text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              {s === "ALL" ? "Tous" : STATUT_CONFIG[s].label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2 bg-green-600 hover:bg-green-700 text-white"
        >
          <Plus className="w-4 h-4" />
          Nouvel examen
        </Button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">Aucun examen trouvé</p>
            <p className="text-sm text-gray-400 mt-1">Créez votre premier examen officiel</p>
            <Button className="mt-4 gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              Créer un examen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((exam) => (
            <ExamenCard
              key={exam.id}
              examen={exam}
              matieres={matieres}
              onUpdate={updateExamen}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateExamenModal
          onClose={() => setShowCreate(false)}
          onCreated={addExamen}
        />
      )}
    </div>
  );
}
