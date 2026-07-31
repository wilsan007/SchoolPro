"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  School, Users, GraduationCap, TrendingUp, Plus, Search,
  CheckCircle, AlertCircle, Clock, XCircle, Edit3, Trash2, X,
  Crown, BarChart3, Globe
} from "lucide-react";
import { useTranslations } from "next-intl";

type PlanType = "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
type TenantStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  city?: string | null;
  country: string;
  plan: PlanType;
  status: TenantStatus;
  trialEndsAt?: string | null;
  createdAt: string;
  _count: { eleves: number; enseignants: number; users: number };
}

interface Stats {
  total: number;
  actifs: number;
  trials: number;
  suspendus: number;
  totalEleves: number;
  parPlan: Record<PlanType, number>;
}

const PLAN_CONFIG: Record<PlanType, { label: string; color: string; prix: string }> = {
  STARTER:    { label: "Starter",    color: "bg-gray-100 text-gray-700",    prix: "49€/mois" },
  PRO:        { label: "Pro",        color: "bg-blue-100 text-blue-700",    prix: "149€/mois" },
  BUSINESS:   { label: "Business",  color: "bg-purple-100 text-purple-700", prix: "399€/mois" },
  ENTERPRISE: { label: "Enterprise",color: "bg-amber-100 text-amber-700",   prix: "Sur devis" },
};

const STATUS_CONFIG: Record<TenantStatus, { labelKey: string; icon: typeof CheckCircle; color: string }> = {
  TRIAL:      { labelKey: "statusTrial",      icon: Clock,         color: "text-yellow-500" },
  ACTIVE:     { labelKey: "statusActive",     icon: CheckCircle,   color: "text-green-500" },
  SUSPENDED:  { labelKey: "statusSuspended",  icon: AlertCircle,   color: "text-orange-500" },
  CANCELLED:  { labelKey: "statusCancelled",  icon: XCircle,       color: "text-red-500" },
};

const EMPTY_FORM = {
  name: "", slug: "", email: "", phone: "", city: "", country: "SN",
  plan: "STARTER" as PlanType,
  adminEmail: "", adminName: "", adminPassword: "",
};

export function SuperAdminView() {
  const t = useTranslations("superAdmin");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, actifs: 0, trials: 0, suspendus: 0, totalEleves: 0,
    parPlan: { STARTER: 0, PRO: 0, BUSINESS: 0, ENTERPRISE: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterPlan !== "all") params.set("plan", filterPlan);
    const res = await fetch(`/api/super-admin/tenants?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTenants(data.tenants);
      setStats(data.stats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [search, filterStatus, filterPlan]);

  const handleCreate = () => {
    startTransition(async () => {
      const res = await fetch("/api/super-admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("createError"));
        return;
      }
      toast.success(t("createSuccess", { name: form.name }));
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    });
  };

  const handleStatusChange = (id: string, status: TenantStatus) => {
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error(t("updateError")); return; }
      toast.success(t("statusUpdated"));
      load();
    });
  };

  const handlePlanChange = (id: string, plan: PlanType) => {
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { toast.error(t("updateError")); return; }
      toast.success(t("planUpdated"));
      load();
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(t("confirmDelete", { name }))) return;
    startTransition(async () => {
      const res = await fetch(`/api/super-admin/tenants/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error(t("deleteError")); return; }
      toast.success(t("schoolDeleted"));
      load();
    });
  };

  const f = (k: keyof typeof EMPTY_FORM, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Crown className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-gray-500 text-sm">{t("subtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> {t("createSchool")}
        </button>
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t("totalSchools"), value: stats.total, icon: School, color: "text-indigo-600" },
          { label: t("active"), value: stats.actifs, icon: CheckCircle, color: "text-green-600" },
          { label: t("onTrial"), value: stats.trials, icon: Clock, color: "text-yellow-600" },
          { label: t("suspended"), value: stats.suspendus, icon: AlertCircle, color: "text-orange-600" },
          { label: t("totalStudents"), value: stats.totalEleves.toLocaleString("fr-FR"), icon: GraduationCap, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Répartition par plan */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-500" /> {t("planDistribution")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(Object.entries(PLAN_CONFIG) as [PlanType, typeof PLAN_CONFIG[PlanType]][]).map(([plan, cfg]) => (
            <div key={plan} className="text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.parPlan[plan]}</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${cfg.color}`}>
                {cfg.label}
              </span>
              <p className="text-xs text-gray-400 mt-1">{cfg.prix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
          <option value="all">{t("allStatuses")}</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{t(v.labelKey)}</option>)}
        </select>
        <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
          <option value="all">{t("allPlans")}</option>
          {Object.entries(PLAN_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table des tenants */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <School className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t("noSchools")}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("school")}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("plan")}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("status")}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("students")}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("teachers")}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("users")}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("createdOn")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {tenants.map((tenant) => {
                const statusCfg = STATUS_CONFIG[tenant.status];
                const planCfg = PLAN_CONFIG[tenant.plan];
                const StatusIcon = statusCfg.icon;
                return (
                  <tr key={tenant.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{tenant.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {tenant.slug}.ecolpro.app
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tenant.plan}
                        onChange={(e) => handlePlanChange(tenant.id, e.target.value as PlanType)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer ${planCfg.color}`}
                      >
                        {(Object.entries(PLAN_CONFIG) as [PlanType, typeof planCfg][]).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tenant.status}
                        onChange={(e) => handleStatusChange(tenant.id, e.target.value as TenantStatus)}
                        className={`flex items-center gap-1 text-xs cursor-pointer bg-transparent border-0 font-medium ${statusCfg.color}`}
                      >
                        {(Object.entries(STATUS_CONFIG) as [TenantStatus, typeof statusCfg][]).map(([k, v]) => (
                          <option key={k} value={k}>{t(v.labelKey)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">{tenant._count.eleves}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{tenant._count.enseignants}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{tenant._count.users}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">
                      {new Date(tenant.createdAt).toLocaleDateString("fr-FR")}
                      {tenant.trialEndsAt && tenant.status === "TRIAL" && (
                        <p className="text-yellow-600">
                          {t("trialUntil")} {new Date(tenant.trialEndsAt).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(tenant.id, tenant.name)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modale création école */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("createNewSchool")}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{t("schoolInfo")}</p>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t("schoolName")}</label>
                <input value={form.name} onChange={(e) => f("name", e.target.value)}
                  placeholder="Lycée Victor Hugo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t("slug")}</label>
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/30">
                  <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200">ecolpro.app/</span>
                  <input value={form.slug} onChange={(e) => f("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="lycee-victor-hugo"
                    className="flex-1 px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t("email")}</label>
                  <input type="email" value={form.email} onChange={(e) => f("email", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t("plan")}</label>
                  <select value={form.plan} onChange={(e) => f("plan", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none">
                    {Object.entries(PLAN_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} — {v.prix}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t("city")}</label>
                  <input value={form.city} onChange={(e) => f("city", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t("countryIso")}</label>
                  <input value={form.country} onChange={(e) => f("country", e.target.value)}
                    placeholder="SN"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
              </div>

              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider pt-2">{t("adminAccount")}</p>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t("adminName")}</label>
                <input value={form.adminName} onChange={(e) => f("adminName", e.target.value)}
                  placeholder="Directeur Nom Prénom"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t("adminEmail")}</label>
                <input type="email" value={form.adminEmail} onChange={(e) => f("adminEmail", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t("adminPassword")}</label>
                <input type="password" value={form.adminPassword} onChange={(e) => f("adminPassword", e.target.value)}
                  placeholder={t("passwordHint")}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              </div>
            </div>

            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                {t("cancel")}
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || !form.name || !form.slug || !form.adminEmail || !form.adminPassword || !form.adminName}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? t("creating") : t("createSchoolBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
