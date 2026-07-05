"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Package, AlertTriangle, XCircle, DollarSign, Plus, Search,
  Edit3, Trash2, X, Monitor, Armchair, Dumbbell, BookOpen,
  Tv, Wind, Shield, MoreHorizontal
} from "lucide-react";

type Categorie = "INFORMATIQUE" | "MOBILIER" | "SPORTIF" | "PEDAGOGIQUE" | "AUDIOVISUEL" | "ENTRETIEN" | "SECURITE" | "AUTRE";
type Etat = "NEUF" | "BON" | "USE" | "ENDOMMAGE" | "HORS_SERVICE";

interface Item {
  id: string;
  nom: string;
  description?: string | null;
  reference?: string | null;
  categorie: Categorie;
  etat: Etat;
  quantite: number;
  quantiteMin: number;
  localisation?: string | null;
  fournisseur?: string | null;
  prixUnitaire?: number | null;
  devise: string;
  dateAchat?: string | null;
  dateRevision?: string | null;
}

interface Stats {
  total: number;
  valeurTotale: number;
  alertes: number;
  horsService: number;
  parCategorie: Record<string, number>;
}

const CAT_CONFIG: Record<Categorie, { label: string; color: string }> = {
  INFORMATIQUE: { label: "Informatique",   color: "bg-blue-100 text-blue-700" },
  MOBILIER:     { label: "Mobilier",        color: "bg-amber-100 text-amber-700" },
  SPORTIF:      { label: "Sportif",         color: "bg-green-100 text-green-700" },
  PEDAGOGIQUE:  { label: "Pédagogique",     color: "bg-indigo-100 text-indigo-700" },
  AUDIOVISUEL:  { label: "Audiovisuel",     color: "bg-pink-100 text-pink-700" },
  ENTRETIEN:    { label: "Entretien",       color: "bg-orange-100 text-orange-700" },
  SECURITE:     { label: "Sécurité",        color: "bg-red-100 text-red-700" },
  AUTRE:        { label: "Autre",           color: "bg-gray-100 text-gray-600" },
};

const ETAT_CONFIG: Record<Etat, { label: string; dot: string }> = {
  NEUF:          { label: "Neuf",          dot: "bg-emerald-500" },
  BON:           { label: "Bon état",      dot: "bg-green-500" },
  USE:           { label: "Usé",           dot: "bg-yellow-500" },
  ENDOMMAGE:     { label: "Endommagé",     dot: "bg-orange-500" },
  HORS_SERVICE:  { label: "Hors service",  dot: "bg-red-500" },
};

const EMPTY_FORM = {
  nom: "", description: "", reference: "", categorie: "AUTRE" as Categorie,
  etat: "BON" as Etat, quantite: 1, quantiteMin: 0, localisation: "",
  fournisseur: "", prixUnitaire: "" as string | number, devise: "DJF",
  dateAchat: "", dateRevision: "", notes: "",
};

export function InventaireView() {
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, valeurTotale: 0, alertes: 0, horsService: 0, parCategorie: {}
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterEtat, setFilterEtat] = useState<string>("all");
  const [showAlerte, setShowAlerte] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterCat !== "all") params.set("categorie", filterCat);
    if (filterEtat !== "all") params.set("etat", filterEtat);
    if (showAlerte) params.set("alerte", "true");
    const res = await fetch(`/api/inventaire?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setStats(data.stats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterCat, filterEtat, showAlerte]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      ...EMPTY_FORM,
      ...item,
      description: item.description ?? "",
      reference: item.reference ?? "",
      localisation: item.localisation ?? "",
      fournisseur: item.fournisseur ?? "",
      prixUnitaire: item.prixUnitaire ?? "",
      dateAchat: item.dateAchat ?? "",
      dateRevision: item.dateRevision ?? "",
      notes: "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const payload = {
        ...form,
        prixUnitaire: form.prixUnitaire !== "" ? Number(form.prixUnitaire) : null,
      };
      const method = editing ? "PATCH" : "POST";
      const url = editing ? `/api/inventaire/${editing.id}` : "/api/inventaire";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error("Erreur lors de l'enregistrement"); return; }
      toast.success(editing ? "Article modifié" : "Article ajouté");
      setShowForm(false);
      load();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/inventaire/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erreur suppression"); return; }
      toast.success("Article supprimé");
      load();
    });
  };

  const formatPrice = (p: number | null | undefined, devise: string) => {
    if (!p) return "—";
    return `${p.toLocaleString("fr-FR")} ${devise}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventaire</h1>
          <p className="text-gray-500 text-sm mt-1">Matériel et ressources de l'établissement</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter un article
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total articles", value: stats.total, icon: Package, color: "text-indigo-600" },
          { label: "Valeur totale", value: `${stats.valeurTotale.toLocaleString("fr-FR")} FDJ`, icon: DollarSign, color: "text-green-600", small: true },
          { label: "Alertes stock", value: stats.alertes, icon: AlertTriangle, color: "text-yellow-600",
            onClick: () => setShowAlerte(!showAlerte) },
          { label: "Hors service", value: stats.horsService, icon: XCircle, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label}
            className={`bg-white rounded-2xl border shadow-sm p-4 transition-all ${s.onClick ? "cursor-pointer hover:shadow-md " : ""}${showAlerte && s.label === "Alertes stock" ? "border-yellow-300 ring-2 ring-yellow-200" : "border-gray-100"}`}
            onClick={s.onClick}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`font-bold text-gray-900 mt-2 ${s.small ? "text-lg" : "text-2xl"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, référence, localisation..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
        >
          <option value="all">Toutes catégories</option>
          {Object.entries(CAT_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filterEtat}
          onChange={(e) => setFilterEtat(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
        >
          <option value="all">Tous états</option>
          {Object.entries(ETAT_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table inventaire */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun article trouvé</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Article</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Catégorie</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">État</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Qté</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Localisation</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Prix unit.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                const isAlerte = item.quantite <= item.quantiteMin;
                return (
                  <tr key={item.id} className={`hover:bg-gray-50/50 transition-colors ${isAlerte ? "bg-yellow-50/30" : ""}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{item.nom}</p>
                        {item.reference && <p className="text-xs text-gray-400">Réf: {item.reference}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CAT_CONFIG[item.categorie].color}`}>
                        {CAT_CONFIG[item.categorie].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${ETAT_CONFIG[item.etat].dot}`} />
                        <span className="text-gray-600">{ETAT_CONFIG[item.etat].label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${isAlerte ? "text-yellow-600" : "text-gray-900"}`}>
                        {item.quantite}
                        {isAlerte && <AlertTriangle className="inline w-3 h-3 ml-1 text-yellow-500" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.localisation ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatPrice(item.prixUnitaire, item.devise)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale formulaire */}
      {showForm && (
        <ItemForm
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

function ItemForm({
  form, setForm, onClose, onSubmit, isPending, isEdit
}: {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  isEdit: boolean;
}) {
  const f = (k: keyof typeof EMPTY_FORM, v: string | number) =>
    setForm({ ...form, [k]: v });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? "Modifier un article" : "Ajouter un article"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Nom de l'article *</label>
            <input value={form.nom} onChange={(e) => f("nom", e.target.value)}
              placeholder="Ordinateur portable Dell"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie</label>
              <select value={form.categorie} onChange={(e) => f("categorie", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
                {Object.entries(CAT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">État</label>
              <select value={form.etat} onChange={(e) => f("etat", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
                {Object.entries(ETAT_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Quantité</label>
              <input type="number" min="0" value={form.quantite} onChange={(e) => f("quantite", Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Seuil alerte</label>
              <input type="number" min="0" value={form.quantiteMin} onChange={(e) => f("quantiteMin", Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Référence</label>
              <input value={form.reference} onChange={(e) => f("reference", e.target.value)}
                placeholder="SN-2024-001"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Localisation</label>
              <input value={form.localisation} onChange={(e) => f("localisation", e.target.value)}
                placeholder="Salle informatique A"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prix unitaire</label>
              <input type="number" value={form.prixUnitaire} onChange={(e) => f("prixUnitaire", e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fournisseur</label>
              <input value={form.fournisseur} onChange={(e) => f("fournisseur", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Date d'achat</label>
              <input type="date" value={form.dateAchat} onChange={(e) => f("dateAchat", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Prochaine révision</label>
              <input type="date" value={form.dateRevision} onChange={(e) => f("dateRevision", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={onSubmit} disabled={isPending || !form.nom}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {isPending ? "Enregistrement..." : isEdit ? "Modifier" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
