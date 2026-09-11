"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Mail, MailCheck, MailX, MailOpen, AlertCircle, Search,
  ChevronLeft, ChevronRight, Filter, Clock,
} from "lucide-react";

interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  resendId: string | null;
  statut: string;
  erreur: string | null;
  type: string | null;
  resourceId: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  openedAt: string | null;
  complainedAt: string | null;
  createdAt: string;
  envoyePar: { id: string; name: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUT_CONFIG: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  PENDING: { label: "En attente", color: "bg-amber-100 text-amber-700", icon: Clock },
  DELIVERED: { label: "Délivré", color: "bg-emerald-100 text-emerald-700", icon: MailCheck },
  BOUNCED: { label: "Rebond", color: "bg-red-100 text-red-700", icon: MailX },
  FAILED: { label: "Échec", color: "bg-red-100 text-red-700", icon: AlertCircle },
  COMPLAINED: { label: "Spam signalé", color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  OPENED: { label: "Ouvert", color: "bg-sky-100 text-sky-700", icon: MailOpen },
  DELIVERY_DELAYED: { label: "Retardé", color: "bg-amber-100 text-amber-700", icon: Clock },
};

export default function JournalEmailsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    statut: "",
    to: "",
    type: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (filters.statut) params.set("statut", filters.statut);
    if (filters.to) params.set("to", filters.to);
    if (filters.type) params.set("type", filters.type);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);

    try {
      const res = await fetch(`/api/emails/journal?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur de chargement");
      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
      setStats(data.stats ?? {});
    } catch (err) {
      console.error("Journal emails fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "loading") return;
    const role = session?.user?.role;
    if (role !== "SUPER_ADMIN" && role !== "TENANT_ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchLogs();
  }, [status, session, router, fetchLogs]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const total = stats ? Object.values(stats).reduce((a, b) => a + b, 0) : 0;
  const totalDelivered = stats["DELIVERED"] ?? 0;
  const totalBounced = (stats["BOUNCED"] ?? 0) + (stats["FAILED"] ?? 0);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Mail className="w-8 h-8 text-primary flex-shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Journal des emails
            </h1>
            <p className="text-sm text-muted-foreground">
              Suivi des emails transactionnels envoyés via Resend
            </p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Mail className="w-4 h-4" />
            Total
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground">{total}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <MailCheck className="w-4 h-4 text-emerald-600" />
            Délivrés
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground">{totalDelivered}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <MailX className="w-4 h-4 text-destructive" />
            Rebonds/Échecs
          </div>
          <p className="text-2xl font-bold mt-1 text-destructive">{totalBounced}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="w-4 h-4 text-amber-600" />
            En attente
          </div>
          <p className="text-2xl font-bold mt-1 text-foreground">
            {stats["PENDING"] ?? 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-card rounded-2xl border border-border p-4 mb-6"
      >
        <div className="flex items-center gap-2 mb-3 text-foreground font-medium">
          <Filter className="w-4 h-4" />
          Filtres
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={filters.statut}
            onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUT_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <input
            type="text"
            aria-label="Filtrer par destinataire"
            placeholder="Destinataire"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
          <input
            type="text"
            aria-label="Filtrer par type"
            placeholder="Type (notification, relance…)"
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
          <input
            type="date"
            aria-label="Date de début"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
          <input
            type="date"
            aria-label="Date de fin"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
        </div>
        <button
          type="submit"
          className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 w-full sm:w-auto justify-center"
        >
          <Search className="w-4 h-4" />
          Filtrer
        </button>
      </form>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Destinataire</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sujet</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Erreur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun email trouvé
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const cfg = STATUT_CONFIG[log.statut] ?? STATUT_CONFIG.PENDING;
                  const Icon = cfg.icon;
                  return (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 text-foreground font-mono text-xs">
                        {log.to}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-xs truncate">
                        {log.subject}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}
                        >
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {log.type ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-destructive text-xs max-w-xs truncate">
                        {log.erreur ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-border gap-2">
            <p className="text-sm text-muted-foreground">
              Page {pagination.page} sur {pagination.totalPages} — {pagination.total} emails
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-muted/50"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-muted/50"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
