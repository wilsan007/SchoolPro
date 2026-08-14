"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield, ShieldAlert, ShieldCheck, Search, Download,
  ChevronLeft, ChevronRight, Filter,
} from "lucide-react";

interface AuditLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  verdict: "ALLOWED" | "DENIED";
  resource: string | null;
  resourceId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditJournalPage() {
  const ta = useTranslations("audit");
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    verdict: "",
    action: "",
    userId: "",
    startDate: "",
    endDate: "",
  });
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (filters.verdict) params.set("verdict", filters.verdict);
    if (filters.action) params.set("action", filters.action);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);

    try {
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) throw new Error(ta("fetchError"));
      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      console.error("Audit log fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filters, ta]);

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

  const handleExport = () => {
    const headers = [ta("date"), ta("action"), ta("verdict"), ta("user"), ta("resource"), ta("reason"), ta("ip")];
    const rows = logs.map((l) => [
      new Date(l.createdAt).toLocaleString("fr-FR"),
      l.action,
      l.verdict,
      l.userId ?? "—",
      l.resource ?? "—",
      (l.reason ?? "").replace(/"/g, "'"),
      l.ip ?? "—",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Journal d&apos;audit</h1>
            <p className="text-sm text-gray-500">
              Traçabilité des actions sensibles et refus d&apos;autorisation
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <Shield className="w-4 h-4" />
            Total
          </div>
          <p className="text-2xl font-bold mt-1">{pagination?.total ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <ShieldCheck className="w-4 h-4 text-green-600" />
            Autorisés
          </div>
          <p className="text-2xl font-bold mt-1">
            {logs.filter((l) => l.verdict === "ALLOWED").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            Refusés
          </div>
          <p className="text-2xl font-bold mt-1 text-red-600">
            {logs.filter((l) => l.verdict === "DENIED").length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <form onSubmit={handleFilterSubmit} className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium">
          <Filter className="w-4 h-4" />
          Filtres
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={filters.verdict}
            onChange={(e) => setFilters({ ...filters, verdict: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Tous les verdicts</option>
            <option value="ALLOWED">Autorisés</option>
            <option value="DENIED">Refusés</option>
          </select>
          <input
            type="text"
            placeholder="Action (ex: auth:login)"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="text"
            placeholder="User ID"
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          type="submit"
          className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Search className="w-4 h-4" />
          Filtrer
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("date")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("action")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("verdict")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("resource")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("reason")}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{ta("ip")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    Aucune entrée d&apos;audit trouvée
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.verdict === "ALLOWED"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {log.verdict === "ALLOWED" ? (
                          <ShieldCheck className="w-3 h-3" />
                        ) : (
                          <ShieldAlert className="w-3 h-3" />
                        )}
                        {log.verdict === "ALLOWED" ? ta("allowed") : ta("denied")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.resource ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {log.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {log.ip ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-gray-500">
              Page {pagination.page} sur {pagination.totalPages} — {pagination.total} entrées
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
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
