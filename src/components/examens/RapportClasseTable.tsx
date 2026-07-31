"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Table } from "lucide-react";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { ExportColumn } from "@/lib/export";
import { useTranslations } from "next-intl";

interface ClasseInfo {
  id: string;
  nom: string;
  niveau: string;
}

interface PeriodeInfo {
  id: string;
  nom: string;
  numero: number;
  isCurrent: boolean;
}

interface RapportRow {
  matricule: string;
  nom: string;
  moyenneGenerale: number | null;
  rang: number | null;
  decision: string | null;
  appreciation: string | null;
  [key: string]: any;
}

export function RapportClasseTable({ classes, periodes }: { classes: ClasseInfo[]; periodes: PeriodeInfo[] }) {
  const t = useTranslations("evaluations");
  const [classeId, setClasseId] = useState("");
  const [periodeId, setPeriodeId] = useState(periodes.find((p) => p.isCurrent)?.id ?? "");
  const [rows, setRows] = useState<RapportRow[]>([]);
  const [matieres, setMatieres] = useState<{ code: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchRapport() {
    if (!classeId || !periodeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bulletins/rapport-classe?classeId=${classeId}&periodeId=${periodeId}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setMatieres(data.matieres ?? []);
    } catch {
      setRows([]);
      setMatieres([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (classeId && periodeId) fetchRapport();
  }, [classeId, periodeId]);

  const columns: ExportColumn<RapportRow>[] = [
    { header: t("rapportColMatricule"), key: "matricule", width: 14 },
    { header: t("rapportColName"), key: "nom", width: 28 },
    ...matieres.map((m) => ({
      header: m.nom,
      key: m.code,
      width: 12,
      format: (v: any) => (v !== null && v !== undefined ? Number(v).toFixed(2) : "—"),
    })),
    { header: t("rapportColAvg"), key: "moyenneGenerale", width: 12, format: (v: any) => (v !== null ? Number(v).toFixed(2) : "—") },
    { header: t("rapportColRank"), key: "rang", width: 8 },
    { header: t("rapportColDecision"), key: "decision", width: 18 },
    { header: t("rapportColAppreciation"), key: "appreciation", width: 30 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Table className="h-5 w-5" />
          {t("rapportTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="space-y-2 flex-1 max-w-xs">
            <Label>{t("rapportColClass")}</Label>
            <Select value={classeId} onValueChange={setClasseId}>
              <SelectTrigger><SelectValue placeholder={t("rapportSelectClass")} /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom} ({c.niveau})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1 max-w-xs">
            <Label>{t("rapportColPeriod")}</Label>
            <Select value={periodeId} onValueChange={setPeriodeId}>
              <SelectTrigger><SelectValue placeholder={t("rapportSelect")} /></SelectTrigger>
              <SelectContent>
                {periodes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={fetchRapport} disabled={loading || !classeId || !periodeId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("rapportRefresh")}
          </Button>
          <ExportMenu rows={rows} columns={columns} filename="rapport-classe" disabled={!rows.length} />
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border-b">{t("rapportColMatricule")}</th>
                  <th className="px-3 py-2 text-left font-semibold border-b">{t("rapportColName")}</th>
                  {matieres.map((m) => (
                    <th key={m.code} className="px-3 py-2 text-center font-semibold border-b whitespace-nowrap">
                      {m.nom}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold border-b">{t("rapportColAvg")}</th>
                  <th className="px-3 py-2 text-center font-semibold border-b">{t("rapportColRank")}</th>
                  <th className="px-3 py-2 text-left font-semibold border-b">{t("rapportColDecision")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-3 py-2 border-b">{row.matricule}</td>
                    <td className="px-3 py-2 border-b font-medium">{row.nom}</td>
                    {matieres.map((m) => (
                      <td key={m.code} className="px-3 py-2 text-center border-b">
                        {row[m.code] !== null && row[m.code] !== undefined ? Number(row[m.code]).toFixed(2) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center border-b font-bold">
                      {row.moyenneGenerale !== null ? Number(row.moyenneGenerale).toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center border-b">{row.rang ?? "—"}</td>
                    <td className="px-3 py-2 border-b text-xs">{row.decision ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            {loading ? t("rapportLoading") : t("rapportEmpty")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
