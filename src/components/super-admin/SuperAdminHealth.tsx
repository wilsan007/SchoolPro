"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  HeartPulse, AlertCircle, ShieldCheck, LogIn, Users, GraduationCap,
  FileText, Activity, Eye
} from "lucide-react";

// ─── Types (sérialisables — passés du server component) ───────────────

export interface TenantHealthRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  activeUsers: number;
  lastLoginAt: string | null;
  elevesCount: number;
  facturesCeMois: number;
  // Pour le bouton de prise de contrôle : premier user admin du tenant
  adminUserId: string | null;
  adminUserEmail: string | null;
}

export interface PaymentFailureRow {
  id: string;
  numero: string;
  montant: number;
  devise: string;
  createdAt: string;
  tenantName: string;
  eleveNom: string;
  elevePrenom: string;
}

export interface AuditRow {
  id: string;
  createdAt: string;
  tenantName: string;
  action: string;
  reason: string;
  targetUserEmail: string | null;
}

// ─── Composant ────────────────────────────────────────────────────────

export function SuperAdminHealth({
  tenants,
  paymentFailures,
  auditLogs,
}: {
  tenants: TenantHealthRow[];
  paymentFailures: PaymentFailureRow[];
  auditLogs: AuditRow[];
}) {
  const t = useTranslations("superAdmin");
  const [isPending, startTransition] = useTransition();
  const [impersonatingTenant, setImpersonatingTenant] = useState<string | null>(null);

  const handleImpersonate = (tenantId: string, userId: string) => {
    setImpersonatingTenant(tenantId);
    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, userId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? t("impersonationError"));
          return;
        }
        toast.success(t("impersonationSuccess"));
        // Recharger pour basculer dans le contexte du tenant cible
        window.location.href = "/";
      } catch {
        toast.error(t("impersonationError"));
      } finally {
        setImpersonatingTenant(null);
      }
    });
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return t("jamais");
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* ═══ Section 1 : Santé des tenants ═══ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-red-500" /> {t("santeTenants")}
          </h3>
        </div>
        {tenants.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <HeartPulse className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t("noSchools")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("tenant")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("statut")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("utilisateurs")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("derniereConnexion")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("eleves")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("facturesCeMois")}</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("impersonation")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {tenants.map((row) => {
                  const isActif = row.status === "ACTIVE" || row.status === "TRIAL";
                  return (
                    <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${isActif ? "text-green-600" : "text-red-500"}`}>
                          {isActif ? t("actif") : t("inactif")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          {row.activeUsers}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <LogIn className="w-3.5 h-3.5 text-gray-400" />
                          {formatDate(row.lastLoginAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
                          {row.elevesCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          {row.facturesCeMois}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.adminUserId ? (
                          <button
                            onClick={() => handleImpersonate(row.id, row.adminUserId!)}
                            disabled={isPending && impersonatingTenant === row.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 transition-colors disabled:opacity-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isPending && impersonatingTenant === row.id ? "..." : t("prendreControle")}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Section 2 : Échecs de paiement ═══ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" /> {t("echecsPaiement")}
          </h3>
        </div>
        {paymentFailures.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t("aucunEchec")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("date")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("tenant")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("facture")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("eleve")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("montant")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {paymentFailures.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.tenantName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{row.numero}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {row.elevePrenom} {row.eleveNom}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {row.montant.toLocaleString()} {row.devise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Section 3 : Audit inter-tenants ═══ */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-500" /> {t("auditInterTenants")}
          </h3>
        </div>
        {auditLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t("aucunAudit")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("date")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("tenant")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("action")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{t("cible")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {auditLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.tenantName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {row.targetUserEmail ?? row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
