"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Plus, Filter, Eye } from "lucide-react";
import { useTranslations } from "next-intl";

interface FactureWithRelations {
  id: string;
  numero: string;
  libelle: string;
  montant: number;
  devise: string;
  statut: "EN_ATTENTE" | "PAYEE" | "EN_RETARD" | "ANNULEE";
  echeance: Date | null;
  createdAt: Date;
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    classe: { nom: string } | null;
  };
  paiements: { montant: number }[];
  createdBy?: { id: string; name: string } | null;
}

interface FacturesTableProps {
  factures: FactureWithRelations[];
}

const statutConfig: Record<string, { labelKey: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  EN_ATTENTE: { labelKey: "statusPending", variant: "warning" },
  PAYEE: { labelKey: "statusPaid", variant: "success" },
  EN_RETARD: { labelKey: "statusOverdue", variant: "destructive" },
  ANNULEE: { labelKey: "statusCancelled", variant: "secondary" },
};

function formatMoney(amount: number, devise: string) {
  // Force DJF for display regardless of what's stored in DB
  const currency = devise === "XOF" ? "DJF" : devise;
  return new Intl.NumberFormat("fr-DJ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function FacturesTable({ factures }: FacturesTableProps) {
  const t = useTranslations("facturation");
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return factures.filter((f) => {
      const matchesSearch =
        f.numero.toLowerCase().includes(q) ||
        f.libelle.toLowerCase().includes(q) ||
        f.eleve.nom.toLowerCase().includes(q) ||
        f.eleve.prenom.toLowerCase().includes(q) ||
        f.eleve.matricule.toLowerCase().includes(q);
      const matchesStatut = !statutFilter || f.statut === statutFilter;
      return matchesSearch && matchesStatut;
    });
  }, [factures, search, statutFilter]);

  const totalMontant = filtered.reduce((sum, f) => sum + f.montant, 0);
  const totalPaye = filtered.reduce(
    (sum, f) => sum + f.paiements.reduce((s, p) => s + p.montant, 0),
    0
  );
  const totalRestant = totalMontant - totalPaye;

  function exportCSV() {
    const headers = ["N°", "Élève", "Matricule", "Classe", "Libellé", "Montant", "Payé", "Restant", "Statut", "Échéance"];
    const rows = filtered.map((f) => {
      const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
      return [
        f.numero,
        `${f.eleve.prenom} ${f.eleve.nom}`,
        f.eleve.matricule,
        f.eleve.classe?.nom ?? "",
        f.libelle,
        f.montant,
        paye,
        f.montant - paye,
        f.statut,
        f.echeance ? new Date(f.echeance).toLocaleDateString("fr-FR") : "",
      ];
    });
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "").replace(/"/g, '""');
            return value.includes(",") || value.includes('"') || value.includes("\n") ? `"${value}"` : value;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `factures-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" />
          {t("filters")}
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
          <Download className="h-4 w-4" />
          {t("export")}
        </Button>
        <Button asChild size="sm" className="gap-2 ml-auto">
          <Link href="/facturation/nouvelle">
            <Plus className="h-4 w-4" />
            {t("newInvoice")}
          </Link>
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("status")}</label>
              <select
                value={statutFilter}
                onChange={(e) => setStatutFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("all")}</option>
                <option value="EN_ATTENTE">{t("statusPending")}</option>
                <option value="PAYEE">{t("statusPaid")}</option>
                <option value="EN_RETARD">{t("statusOverdue")}</option>
                <option value="ANNULEE">{t("statusCancelled")}</option>
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("totalInvoiced")}</p>
            <p className="text-lg font-bold">{formatMoney(totalMontant, filtered[0]?.devise ?? "DJF")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("totalCollected")}</p>
            <p className="text-lg font-bold text-green-600">{formatMoney(totalPaye, filtered[0]?.devise ?? "DJF")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("balanceRemaining")}</p>
            <p className="text-lg font-bold text-red-600">{formatMoney(totalRestant, filtered[0]?.devise ?? "DJF")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("colNumber")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colStudent")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colLabel")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("colAmount")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("colPaid")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colDueDate")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("recordedBy")}</th>
                  <th className="text-right px-4 py-3 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      {t("noInvoices")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => {
                    const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
                    const cfg = statutConfig[f.statut] ?? statutConfig.EN_ATTENTE;
                    return (
                      <tr key={f.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{f.numero}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{f.eleve.prenom} {f.eleve.nom}</div>
                          <div className="text-xs text-muted-foreground">{f.eleve.matricule} · {f.eleve.classe?.nom ?? t("notApplicable")}</div>
                        </td>
                        <td className="px-4 py-3">{f.libelle}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatMoney(f.montant, f.devise)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatMoney(paye, f.devise)}</td>
                        <td className="px-4 py-3 text-xs">
                          {f.echeance ? new Date(f.echeance).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={cfg.variant}>{t(cfg.labelKey)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {f.createdBy?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="ghost" size="sm" className="gap-1">
                            <Link href={`/facturation/${f.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                              {t("detail")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
