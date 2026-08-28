"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Loader2, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ExportColumn } from "@/lib/export";
import { useTranslations } from "next-intl";
import { useLibelleNiveau } from "@/lib/niveau-context";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface Classe {
  id: string;
  nom: string;
  niveau: string;
}

interface Account {
  matricule: string;
  nom: string;
  username: string;
  password: string;
}

interface Skipped {
  matricule: string;
  nom: string;
  raison: string;
}

export function GenerationComptesForm({ classes, hierarchie }: { classes: Classe[]; hierarchie?: ClassesHierarchie }) {
  const t = useTranslations("eleves");
  const libelleNiveau = useLibelleNiveau();
  const [classeId, setClasseId] = useState("");
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [customPassword, setCustomPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);

  async function handleGenerate() {
    if (!classeId) {
      toast.error(t("genAccountsSelectClassErr"));
      return;
    }
    setGenerating(true);
    setAccounts([]);
    setSkipped([]);
    try {
      const res = await fetch("/api/eleves/generer-comptes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId,
          customPassword: useCustomPassword ? customPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("genericError"));
      setAccounts(data.accounts ?? []);
      setSkipped(data.skipped ?? []);
      toast.success(t("genAccountsCreated", { count: data.created }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("genAccountsError"));
    } finally {
      setGenerating(false);
    }
  }

  const columns: ExportColumn<Account>[] = [
    { header: t("genAccountsColMatricule"), key: "matricule", width: 14 },
    { header: t("genAccountsColName"), key: "nom", width: 28 },
    { header: t("genAccountsColUsername"), key: "username", width: 22 },
    { header: t("genAccountsColPassword"), key: "password", width: 18 },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("genAccountsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("genAccountsClass")}</Label>
              <Select value={classeId} onValueChange={setClasseId}>
                <SelectTrigger><SelectValue placeholder={t("genAccountsSelectClass")} /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nom} ({libelleNiveau(c.niveau)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("genAccountsUsernameFormat")}</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                {t("genAccountsMatricule")}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
            {t("genAccountsDobInfo")}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomPassword}
                onChange={(e) => setUseCustomPassword(e.target.checked)}
                className="rounded border-input"
              />
              <KeyRound className="h-4 w-4" />
              {t("genAccountsCustomPassword")}
            </label>
            {useCustomPassword && (
              <Input
                type="text"
                placeholder={t("genAccountsPasswordPlaceholder")}
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                className="max-w-xs"
              />
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleGenerate} disabled={generating || !classeId} className="gap-2 w-full sm:w-auto">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {t("genAccountsGenerate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {skipped.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              {t("genAccountsSkipped", { count: skipped.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColMatricule")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColName")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColReason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {skipped.map((s, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2 border-b">{s.matricule}</td>
                      <td className="px-3 py-2 border-b font-medium">{s.nom}</td>
                      <td className="px-3 py-2 border-b text-amber-600">{s.raison}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("genAccountsResults", { count: accounts.length })}</CardTitle>
              <ExportMenu rows={accounts} columns={columns} filename="comptes-eleves" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColMatricule")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColName")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColUsername")}</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">{t("genAccountsColPassword")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2 border-b">{a.matricule}</td>
                      <td className="px-3 py-2 border-b font-medium">{a.nom}</td>
                      <td className="px-3 py-2 border-b font-mono text-xs">{a.username}</td>
                      <td className="px-3 py-2 border-b font-mono text-xs">{a.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
