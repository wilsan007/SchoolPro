"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, AlertTriangle, CheckCircle2, Clock, User,
  MapPin, FileText, Loader2, Shield, ChevronDown, ChevronUp,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";

type TypeIncident = "RETARD" | "BAVARDAGE" | "INSOLENCE" | "BAGARRE" | "TRICHE" | "VANDALISM" | "ABSENTEISME" | "AUTRE";
type StatutIncident = "OUVERT" | "EN_TRAITEMENT" | "RESOLU" | "CLASSE";
type TypeSanction = "AVERTISSEMENT" | "BLAME" | "EXCLUSION_COURS" | "EXCLUSION_TEMP" | "CONVOCATION_PARENTS" | "TRAVAUX_INTERET_GENERAL" | "AUTRE";

const TYPE_LABELS: Record<TypeIncident, string> = {
  RETARD: "Retard", BAVARDAGE: "Bavardage", INSOLENCE: "Insolence",
  BAGARRE: "Bagarre", TRICHE: "Triche", VANDALISM: "Vandalisme",
  ABSENTEISME: "Absentéisme", AUTRE: "Autre",
};

const STATUT_CONFIG: Record<StatutIncident, { label: string; variant: string; icon: React.ReactNode }> = {
  OUVERT: { label: "Ouvert", variant: "destructive", icon: <AlertTriangle className="w-3 h-3" /> },
  EN_TRAITEMENT: { label: "En traitement", variant: "warning", icon: <Clock className="w-3 h-3" /> },
  RESOLU: { label: "Résolu", variant: "success", icon: <CheckCircle2 className="w-3 h-3" /> },
  CLASSE: { label: "Classé", variant: "outline", icon: <FileText className="w-3 h-3" /> },
};

const GRAVITE_CONFIG = [
  { val: 1, label: "Léger", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  { val: 2, label: "Moyen", color: "text-orange-600 bg-orange-50 border-orange-200" },
  { val: 3, label: "Grave", color: "text-red-600 bg-red-50 border-red-200" },
];

const SANCTION_LABELS: Record<TypeSanction, string> = {
  AVERTISSEMENT: "Avertissement", BLAME: "Blâme", EXCLUSION_COURS: "Exclusion cours",
  EXCLUSION_TEMP: "Exclusion temporaire", CONVOCATION_PARENTS: "Conv. parents",
  TRAVAUX_INTERET_GENERAL: "TIG", AUTRE: "Autre",
};

interface Eleve { id: string; nom: string; prenom: string; matricule: string; classe: { nom: string } | null }
interface Sanction { id: string; type: TypeSanction; description: string | null; dateDebut: Date | string; dateFin: Date | string | null; parentNotifie: boolean }
interface Incident {
  id: string;
  type: TypeIncident;
  statut: StatutIncident;
  gravite: number;
  description: string;
  lieu: string | null;
  date: Date | string;
  notes: string | null;
  eleve: Eleve & { classe: { nom: string } | null };
  rapportePar: { name: string | null } | null;
  sanctions: Sanction[];
}

function CreateIncidentModal({
  eleves,
  currentUserId,
  onClose,
  onCreated,
}: {
  eleves: Eleve[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (inc: Incident) => void;
}) {
  const [form, setForm] = useState({
    eleveId: eleves[0]?.id ?? "",
    type: "AUTRE" as TypeIncident,
    gravite: 1,
    description: "",
    lieu: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/vie-scolaire/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        onCreated(data);
        toast.success("Incident signalé !");
        onClose();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Signaler un incident</h2>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Élève *</label>
            <select
              required
              value={form.eleveId}
              onChange={(e) => setForm({ ...form, eleveId: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {eleves.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.nom} {el.prenom} — {el.classe?.nom ?? "Sans classe"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Type *</label>
              <select
                required
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TypeIncident })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Gravité *</label>
              <select
                required
                value={form.gravite}
                onChange={(e) => setForm({ ...form, gravite: Number(e.target.value) })}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {GRAVITE_CONFIG.map((g) => <option key={g.val} value={g.val}>{g.val} — {g.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Lieu</label>
              <input
                value={form.lieu}
                onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                placeholder="ex: Cour de récréation"
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Description *</label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Décrivez l'incident..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Notes internes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Notes visibles par l'administration uniquement..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Signaler l'incident"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncidentCard({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const statut = STATUT_CONFIG[incident.statut];
  const graviteInfo = GRAVITE_CONFIG.find((g) => g.val === incident.gravite) ?? GRAVITE_CONFIG[0];

  async function updateStatut(statut: StatutIncident) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/vie-scolaire/incidents/${incident.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        if (!res.ok) throw new Error();
        onUpdate({ ...incident, statut });
        toast.success("Statut mis à jour");
      } catch { toast.error("Erreur"); }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-1", incident.gravite === 3 ? "bg-red-500" : incident.gravite === 2 ? "bg-orange-400" : "bg-yellow-400")} />
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", graviteInfo.color)}>
                Gravité {graviteInfo.val} — {graviteInfo.label}
              </span>
              <Badge variant={statut.variant as never} className="flex items-center gap-1">
                {statut.icon}{statut.label}
              </Badge>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                {TYPE_LABELS[incident.type]}
              </span>
            </div>

            <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <User className="w-4 h-4 text-green-600" />
                {incident.eleve.nom} {incident.eleve.prenom}
              </span>
              {incident.eleve.classe && (
                <span className="text-gray-500">{incident.eleve.classe.nom}</span>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
              {incident.description}
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(incident.date, "dd/MM/yyyy")}
              </span>
              {incident.lieu && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {incident.lieu}
                </span>
              )}
              {incident.rapportePar && (
                <span className="flex items-center gap-1">
                  <Flag className="w-3 h-3" />
                  {incident.rapportePar.name}
                </span>
              )}
              {incident.sanctions.length > 0 && (
                <span className="flex items-center gap-1 text-orange-500">
                  <Shield className="w-3 h-3" />
                  {incident.sanctions.length} sanction{incident.sanctions.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {incident.statut === "OUVERT" && (
              <Button size="sm" variant="outline" className="text-xs" onClick={() => updateStatut("EN_TRAITEMENT")} disabled={isPending}>
                Traiter
              </Button>
            )}
            {incident.statut === "EN_TRAITEMENT" && (
              <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-200" onClick={() => updateStatut("RESOLU")} disabled={isPending}>
                Résoudre
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            {incident.notes && (
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
                <p className="text-xs font-medium mb-1">Notes internes</p>
                <p>{incident.notes}</p>
              </div>
            )}
            {incident.sanctions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Sanctions appliquées</p>
                <div className="space-y-1.5">
                  {incident.sanctions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <Shield className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="font-medium">{SANCTION_LABELS[s.type]}</span>
                      {s.description && <span className="text-gray-500">— {s.description}</span>}
                      <span className="ml-auto text-xs text-gray-400">{formatDate(s.dateDebut, "dd/MM/yyyy")}</span>
                      {s.parentNotifie && <Badge variant="success" className="text-xs">Parents notifiés</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VieScolaireView({
  incidents: initial,
  eleves,
  classes,
  currentUserId,
}: {
  incidents: Incident[];
  eleves: Eleve[];
  classes: { id: string; nom: string }[];
  currentUserId: string;
  tenantId: string;
}) {
  const [incidents, setIncidents] = useState<Incident[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatut, setFilterStatut] = useState<StatutIncident | "ALL">("ALL");
  const [filterClasse, setFilterClasse] = useState("ALL");
  const [search, setSearch] = useState("");

  const stats = {
    total: incidents.length,
    ouverts: incidents.filter((i) => i.statut === "OUVERT").length,
    enTraitement: incidents.filter((i) => i.statut === "EN_TRAITEMENT").length,
    graves: incidents.filter((i) => i.gravite === 3).length,
  };

  const filtered = incidents.filter((i) => {
    if (filterStatut !== "ALL" && i.statut !== filterStatut) return false;
    if (filterClasse !== "ALL" && i.eleve.classe?.nom !== filterClasse) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.eleve.nom.toLowerCase().includes(q) ||
        i.eleve.prenom.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function addIncident(inc: Incident) {
    setIncidents((prev) => [inc, ...prev]);
  }

  function updateIncident(updated: Incident) {
    setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total incidents", value: stats.total, color: "text-gray-700 dark:text-gray-300", bg: "bg-gray-50 dark:bg-gray-800" },
          { label: "Ouverts", value: stats.ouverts, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
          { label: "En traitement", value: stats.enTraitement, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/20" },
          { label: "Graves (niv. 3)", value: stats.graves, color: "text-red-700 font-bold", bg: "bg-red-100 dark:bg-red-950/30" },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-xl p-4 text-center", s.bg)}>
            <p className={cn("text-3xl font-black", s.color)}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un élève ou incident..."
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 flex-1"
        />
        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value as StatutIncident | "ALL")}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none"
        >
          <option value="ALL">Tous statuts</option>
          {(["OUVERT", "EN_TRAITEMENT", "RESOLU", "CLASSE"] as StatutIncident[]).map((s) => (
            <option key={s} value={s}>{STATUT_CONFIG[s].label}</option>
          ))}
        </select>
        <select
          value={filterClasse}
          onChange={(e) => setFilterClasse(e.target.value)}
          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none"
        >
          <option value="ALL">Toutes classes</option>
          {classes.map((c) => <option key={c.id} value={c.nom}>{c.nom}</option>)}
        </select>
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-2 bg-red-600 hover:bg-red-700 text-white shrink-0"
        >
          <Plus className="w-4 h-4" />
          Signaler
        </Button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Shield className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium text-gray-500">Aucun incident enregistré</p>
            <p className="text-sm mt-1">La vie scolaire est tranquille !</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((inc) => (
            <IncidentCard key={inc.id} incident={inc} onUpdate={updateIncident} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateIncidentModal
          eleves={eleves}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={addIncident}
        />
      )}
    </div>
  );
}
