"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  HardDrive,
  Download,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SyncConfig {
  id: string;
  serverNick: string;
  syncInterval: number;
  syncEnabled: boolean;
  apiKey: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  includeBulletins: boolean;
  includeNotes: boolean;
  includeEmploiTemps: boolean;
  includeExamens: boolean;
  includePersonnel: boolean;
  includeComptabilite: boolean;
  includeAbsences: boolean;
  includeParametres: boolean;
}

export function SyncTab({ canManage }: { canManage: boolean }) {
  const t = useTranslations("sync");
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/config");
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setConfig(data.config);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sync/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverNick: config.serverNick,
          syncInterval: config.syncInterval,
          syncEnabled: config.syncEnabled,
          includeBulletins: config.includeBulletins,
          includeNotes: config.includeNotes,
          includeEmploiTemps: config.includeEmploiTemps,
          includeExamens: config.includeExamens,
          includePersonnel: config.includePersonnel,
          includeComptabilite: config.includeComptabilite,
          includeAbsences: config.includeAbsences,
          includeParametres: config.includeParametres,
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setConfig(data.config);
      toast.success(t("saveSuccess"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadBackup() {
    setDownloading(true);
    try {
      const res = await fetch("/api/sync/export-all");
      if (!res.ok) throw new Error("Erreur");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split('filename="')[1]?.replace('"', "") || "sauvegarde.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("downloadSuccess"));
      loadConfig(); // Rafraîchir le statut
    } catch {
      toast.error(t("downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  async function handleRegenerateKey() {
    if (!confirm(t("regenerateKeyConfirm"))) return;
    try {
      const res = await fetch("/api/sync/config?action=regenerate-key", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setConfig({ ...config!, apiKey: data.apiKey });
      toast.success(t("keyRegenerated"));
    } catch {
      toast.error(t("regenerateKeyError"));
    }
  }

  function copyApiKey() {
    if (!config) return;
    navigator.clipboard.writeText(config.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {t("loadError")}
      </div>
    );
  }

  const includeOptions: { key: keyof SyncConfig; labelKey: string }[] = [
    { key: "includeBulletins", labelKey: "incBulletins" },
    { key: "includeNotes", labelKey: "incNotes" },
    { key: "includeEmploiTemps", labelKey: "incEmploiTemps" },
    { key: "includeExamens", labelKey: "incExamens" },
    { key: "includePersonnel", labelKey: "incPersonnel" },
    { key: "includeComptabilite", labelKey: "incComptabilite" },
    { key: "includeAbsences", labelKey: "incAbsences" },
    { key: "includeParametres", labelKey: "incParametres" },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadBackup}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("downloadBackup")}
          </button>
        </div>
      </div>

      {/* Statut de la dernière sync */}
      {config.lastSyncAt && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg border p-4",
            config.lastSyncStatus === "SUCCESS"
              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          )}
        >
          {config.lastSyncStatus === "SUCCESS" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium">
              {t("lastSync")}: {new Date(config.lastSyncAt).toLocaleString("fr-FR")}
            </p>
            {config.lastSyncError && (
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{config.lastSyncError}</p>
            )}
          </div>
        </div>
      )}

      {/* Configuration du serveur local */}
      <div className="rounded-lg border p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{t("serverConfig")}</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t("serverNick")}</label>
            <input
              type="text"
              value={config.serverNick}
              onChange={(e) => setConfig({ ...config, serverNick: e.target.value })}
              disabled={!canManage}
              placeholder="PC-Directeur-Mariam"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("serverNickHelp")}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">{t("syncInterval")}</label>
            <select
              value={config.syncInterval}
              onChange={(e) => setConfig({ ...config, syncInterval: Number(e.target.value) })}
              disabled={!canManage}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value={30}>{t("interval30min")}</option>
              <option value={60}>{t("interval1h")}</option>
            </select>
          </div>
        </div>

        {/* Toggle syncEnabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => canManage && setConfig({ ...config, syncEnabled: !config.syncEnabled })}
            disabled={!canManage}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors disabled:opacity-50",
              config.syncEnabled ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                config.syncEnabled ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </button>
          <span className="text-sm font-medium">{t("syncEnabled")}</span>
        </label>
      </div>

      {/* Clé API */}
      <div className="rounded-lg border p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{t("apiKeySection")}</h3>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">{t("apiKey")}</label>
          <div className="flex gap-2">
            <input
              type={showApiKey ? "text" : "password"}
              value={config.apiKey}
              readOnly
              className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              {showApiKey ? t("hide") : t("show")}
            </button>
            <button
              onClick={copyApiKey}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("apiKeyHelp")}</p>
        </div>

        {canManage && (
          <button
            onClick={handleRegenerateKey}
            className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-400"
          >
            <RefreshCw className="h-4 w-4" />
            {t("regenerateKey")}
          </button>
        )}
      </div>

      {/* Données à inclure */}
      <div className="rounded-lg border p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{t("dataToInclude")}</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {includeOptions.map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={config[opt.key] as boolean}
                onChange={(e) => setConfig({ ...config, [opt.key]: e.target.checked })}
                disabled={!canManage}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">{t(opt.labelKey)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Instructions agent local */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 sm:p-6 dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="space-y-2">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300">{t("agentInstructions")}</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-400">
              <li>{t("step1")}</li>
              <li>{t("step2")}</li>
              <li>{t("step3")}</li>
              <li>{t("step4")}</li>
              <li>{t("step5")}</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Bouton sauvegarder */}
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
