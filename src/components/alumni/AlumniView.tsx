"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  GraduationCap, Users, Briefcase, TrendingUp, Plus, Search,
  ExternalLink, Mail, Phone, Edit3, Trash2, X, Building2
} from "lucide-react";

type StatutAlumni = "ETUDES_SUPERIEURES" | "EN_EMPLOI" | "RECHERCHE_EMPLOI" | "ENTREPRENEUR" | "INCONNU";

interface Alumni {
  id: string;
  nom: string;
  prenom: string;
  email?: string | null;
  telephone?: string | null;
  sexe: "M" | "F";
  anneeDiplome: string;
  classeDepart: string;
  mention?: string | null;
  statut: StatutAlumni;
  etablissement?: string | null;
  formation?: string | null;
  ville?: string | null;
  pays?: string | null;
  linkedin?: string | null;
  accepteContact: boolean;
}

interface Stats {
  total: number;
  etudes: number;
  emploi: number;
  entrepreneurs: number;
  annees: string[];
}

const STATUT_CONFIG: Record<StatutAlumni, { label: string; color: string }> = {
  ETUDES_SUPERIEURES: { label: "Études supérieures", color: "bg-blue-100 text-blue-700" },
  EN_EMPLOI:          { label: "En emploi",           color: "bg-green-100 text-green-700" },
  RECHERCHE_EMPLOI:   { label: "Recherche emploi",     color: "bg-yellow-100 text-yellow-700" },
  ENTREPRENEUR:       { label: "Entrepreneur",          color: "bg-purple-100 text-purple-700" },
  INCONNU:            { label: "Inconnu",               color: "bg-gray-100 text-gray-500" },
};

const EMPTY_FORM = {
  nom: "", prenom: "", email: "", telephone: "", sexe: "M" as "M"|"F",
  anneeDiplome: new Date().getFullYear().toString(),
  classeDepart: "", mention: "", statut: "INCONNU" as StatutAlumni,
  etablissement: "", formation: "", ville: "", pays: "SN",
  linkedin: "", accepteContact: true, notes: "",
};

export function AlumniView() {
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, etudes: 0, emploi: 0, entrepreneurs: 0, annees: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterAnnee, setFilterAnnee] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Alumni | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const load = async (q = search, st = filterStatut, an = filterAnnee) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (st !== "all") params.set("statut", st);
    if (an !== "all") params.set("annee", an);
    const res = await fetch(`/api/alumni?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAlumni(data.alumni);
      setStats(data.stats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (a: Alumni) => {
    setEditing(a);
    setForm({
      ...EMPTY_FORM,
      ...a,
      // Convertir null → "" pour les champs du formulaire
      email: a.email ?? "",
      telephone: a.telephone ?? "",
      mention: a.mention ?? "",
      etablissement: a.etablissement ?? "",
      formation: a.formation ?? "",
      ville: a.ville ?? "",
      pays: a.pays ?? "",
      linkedin: a.linkedin ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const method = editing ? "PATCH" : "POST";
      const url = editing ? `/api/alumni/${editing.id}` : "/api/alumni";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { toast.error("Erreur lors de l'enregistrement"); return; }
      toast.success(editing ? "Alumni mis à jour" : "Alumni ajouté");
      setShowForm(false);
      load();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cet alumni ?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/alumni/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erreur suppression"); return; }
      toast.success("Alumni supprimé");
      load();
    });
  };

  const filtered = alumni.filter((a) => {
    if (filterStatut !== "all" && a.statut !== filterStatut) return false;
    if (filterAnnee !== "all" && a.anneeDiplome !== filterAnnee) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réseau Alumni</h1>
          <p className="text-gray-500 text-sm mt-1">Anciens élèves de l'établissement</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter un alumni
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total alumni", value: stats.total, icon: GraduationCap, color: "text-indigo-600" },
          { label: "En études", value: stats.etudes, icon: Users, color: "text-blue-600" },
          { label: "En emploi", value: stats.emploi, icon: Briefcase, color: "text-green-600" },
          { label: "Entrepreneurs", value: stats.entrepreneurs, icon: TrendingUp, color: "text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); load(e.target.value, filterStatut, filterAnnee); }}
            placeholder="Rechercher un alumni..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <select
          value={filterStatut}
          onChange={(e) => { setFilterStatut(e.target.value); load(search, e.target.value, filterAnnee); }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUT_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterAnnee}
          onChange={(e) => { setFilterAnnee(e.target.value); load(search, filterStatut, e.target.value); }}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
        >
          <option value="all">Toutes les années</option>
          {stats.annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Liste alumni */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun alumni trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <AlumniCard
              key={a.id}
              alumni={a}
              onEdit={() => openEdit(a)}
              onDelete={() => handleDelete(a.id)}
            />
          ))}
        </div>
      )}

      {/* Modale formulaire */}
      {showForm && (
        <AlumniForm
          form={form}
          setForm={setForm}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          isPending={isPending}
          isEdit={!!editing}
        />
      )}
    </div>
  );
}

function AlumniCard({
  alumni: a,
  onEdit,
  onDelete,
}: {
  alumni: Alumni;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUT_CONFIG[a.statut];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
            {a.prenom[0]}{a.nom[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{a.prenom} {a.nom}</p>
            <p className="text-xs text-gray-500">{a.classeDepart} · {a.anneeDiplome}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
        {cfg.label}
      </span>

      {(a.etablissement || a.formation) && (
        <div className="mt-3 flex items-start gap-2 text-sm text-gray-600">
          <Building2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <div>
            {a.etablissement && <p className="font-medium">{a.etablissement}</p>}
            {a.formation && <p className="text-xs text-gray-500">{a.formation}</p>}
          </div>
        </div>
      )}

      {a.ville && (
        <p className="text-xs text-gray-400 mt-2">📍 {a.ville}{a.pays ? `, ${a.pays}` : ""}</p>
      )}

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-50">
        {a.email && a.accepteContact && (
          <a href={`mailto:${a.email}`} className="p-1.5 rounded-lg bg-gray-50 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
            <Mail className="w-4 h-4" />
          </a>
        )}
        {a.telephone && a.accepteContact && (
          <a href={`tel:${a.telephone}`} className="p-1.5 rounded-lg bg-gray-50 hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors">
            <Phone className="w-4 h-4" />
          </a>
        )}
        {a.linkedin && (
          <a href={a.linkedin} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {a.mention && (
          <span className="ml-auto text-xs text-amber-600 font-medium">{a.mention}</span>
        )}
      </div>
    </div>
  );
}

function AlumniForm({
  form, setForm, onClose, onSubmit, isPending, isEdit
}: {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  isEdit: boolean;
}) {
  const f = (k: keyof typeof EMPTY_FORM, v: string | boolean) =>
    setForm({ ...form, [k]: v });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? "Modifier un alumni" : "Ajouter un alumni"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prénom *</label>
              <input value={form.prenom} onChange={(e) => f("prenom", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
              <input value={form.nom} onChange={(e) => f("nom", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Année diplôme *</label>
              <input value={form.anneeDiplome} onChange={(e) => f("anneeDiplome", e.target.value)}
                placeholder="2024-2025"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Classe de départ *</label>
              <input value={form.classeDepart} onChange={(e) => f("classeDepart", e.target.value)}
                placeholder="Terminale S"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Mention</label>
              <input value={form.mention} onChange={(e) => f("mention", e.target.value)}
                placeholder="Très Bien"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Statut actuel</label>
              <select value={form.statut} onChange={(e) => f("statut", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
                {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Établissement / Entreprise</label>
            <input value={form.etablissement} onChange={(e) => f("etablissement", e.target.value)}
              placeholder="Université Cheikh Anta Diop"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Formation / Poste</label>
            <input value={form.formation} onChange={(e) => f("formation", e.target.value)}
              placeholder="Licence Informatique"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={(e) => f("email", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Téléphone</label>
              <input value={form.telephone} onChange={(e) => f("telephone", e.target.value)}
                placeholder="+221 77 000 00 00"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">LinkedIn</label>
            <input value={form.linkedin} onChange={(e) => f("linkedin", e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.accepteContact}
              onChange={(e) => f("accepteContact", e.target.checked)}
              className="rounded border-gray-300 text-indigo-600" />
            <span className="text-sm text-gray-600">Accepte d'être contacté par l'établissement</span>
          </label>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={onSubmit} disabled={isPending || !form.nom || !form.prenom || !form.anneeDiplome}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? "Enregistrement..." : isEdit ? "Modifier" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
