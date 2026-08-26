"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock,
  AlertTriangle, Calendar, Wallet, TrendingDown, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface FactureMensuelle {
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
  paiements: { montant: number; methode: string }[];
  relances: { id: string; niveau: number }[];
}

interface FacturesMensuellesProps {
  factures: FactureMensuelle[];
}

// Noms des mois en français
const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function getMonthKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const monthIdx = parseInt(month) - 1;
  return `${NOMS_MOIS[monthIdx]} ${year}`;
}

function formatMoney(amount: number, devise: string) {
  const currency = devise === "XOF" ? "DJF" : devise;
  return new Intl.NumberFormat("fr-DJ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

interface MonthGroup {
  key: string;
  label: string;
  factures: FactureMensuelle[];
  total: number;
  totalPaye: number;
  totalRestant: number;
  nbPayees: number;
  nbEnAttente: number;
  nbEnRetard: number;
  nbRelancees: number;
}

export function FacturesMensuelles({ factures }: FacturesMensuellesProps) {
  const t = useTranslations("facturation");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Grouper les factures par mois (basé sur createdAt)
  const monthGroups = useMemo<MonthGroup[]>(() => {
    const groups = new Map<string, FactureMensuelle[]>();

    for (const f of factures) {
      if (f.statut === "ANNULEE") continue;
      const key = getMonthKey(f.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }

    const result: MonthGroup[] = [];
    for (const [key, facs] of groups) {
      const total = facs.reduce((s, f) => s + f.montant, 0);
      const totalPaye = facs.reduce(
        (s, f) => s + f.paiements.reduce((ps, p) => ps + p.montant, 0),
        0
      );
      result.push({
        key,
        label: getMonthLabel(key),
        factures: facs.sort((a, b) => a.eleve.nom.localeCompare(b.eleve.nom)),
        total,
        totalPaye,
        totalRestant: total - totalPaye,
        nbPayees: facs.filter((f) => f.statut === "PAYEE").length,
        nbEnAttente: facs.filter((f) => f.statut === "EN_ATTENTE").length,
        nbEnRetard: facs.filter((f) => f.statut === "EN_RETARD").length,
        nbRelancees: facs.filter((f) => f.relances.length > 0).length,
      });
    }

    // Trier par mois décroissant (plus récent en premier)
    return result.sort((a, b) => b.key.localeCompare(a.key));
  }, [factures]);

  if (monthGroups.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t("noInvoices")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* En-tête */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("monthlyView")}</h3>
      </div>

      {/* Cartes par mois */}
      {monthGroups.map((group) => {
        const isExpanded = expandedMonth === group.key;
        const tauxRecouvrement = group.total > 0
          ? Math.round((group.totalPaye / group.total) * 100)
          : 0;

        return (
          <Card key={group.key} className="overflow-hidden">
            {/* En-tête du mois — cliquable pour déplier */}
            <button
              onClick={() => setExpandedMonth(isExpanded ? null : group.key)}
              className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-semibold text-sm">{group.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("invoiceCount", { count: group.factures.length })}
                    </p>
                  </div>
                </div>

                {/* Stats compactes */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Payé */}
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="font-medium text-green-600">{group.nbPayees}</span>
                    <span className="text-muted-foreground">{t("monthlyPaid")}</span>
                  </div>
                  {/* En attente */}
                  {group.nbEnAttente > 0 && (
                    <div className="flex items-center gap-1 text-xs">
                      <Clock className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="font-medium text-yellow-600">{group.nbEnAttente}</span>
                      <span className="text-muted-foreground">{t("monthlyPending")}</span>
                    </div>
                  )}
                  {/* En retard */}
                  {group.nbEnRetard > 0 && (
                    <div className="flex items-center gap-1 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      <span className="font-medium text-red-600">{group.nbEnRetard}</span>
                      <span className="text-muted-foreground">{t("monthlyOverdue")}</span>
                    </div>
                  )}
                  {/* Relancées */}
                  {group.nbRelancees > 0 && (
                    <div className="flex items-center gap-1 text-xs">
                      <XCircle className="h-3.5 w-3.5 text-orange-500" />
                      <span className="font-medium text-orange-600">{group.nbRelancees}</span>
                      <span className="text-muted-foreground">{t("monthlyReminded")}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Solde mensuel */}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Wallet className="h-3 w-3" />
                    {t("monthlyTotal")}
                  </p>
                  <p className="text-sm font-bold">{formatMoney(group.total, group.factures[0]?.devise ?? "DJF")}</p>
                </div>
                <div className="bg-tint-emerald rounded-lg px-3 py-2 border border-emerald-200/40 dark:border-emerald-900/30">
                  <p className="text-xs text-vif-emerald flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {t("monthlyCollected")}
                  </p>
                  <p className="text-sm font-bold text-vif-emerald font-data">{formatMoney(group.totalPaye, group.factures[0]?.devise ?? "DJF")}</p>
                </div>
                <div className={cn(
                  "rounded-lg px-3 py-2",
                  group.totalRestant > 0
                    ? "bg-tint-rose border border-rose-200/40 dark:border-rose-900/30"
                    : "bg-muted/30"
                )}>
                  <p className={cn(
                    "text-xs flex items-center gap-1",
                    group.totalRestant > 0 ? "text-vif-rose" : "text-muted-foreground"
                  )}>
                    <TrendingDown className="h-3 w-3" />
                    {t("monthlyBalance")}
                  </p>
                  <p className={cn(
                    "text-sm font-bold font-data",
                    group.totalRestant > 0 ? "text-vif-rose" : "text-vif-emerald"
                  )}>
                    {formatMoney(group.totalRestant, group.factures[0]?.devise ?? "DJF")}
                  </p>
                </div>
              </div>

              {/* Barre de progression du recouvrement */}
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{t("collectionRate")}</span>
                  <span className="font-medium">{tauxRecouvrement}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      tauxRecouvrement >= 75 ? "bg-gradient-to-r from-emerald-500 to-teal-500" : tauxRecouvrement >= 50 ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-rose-500 to-red-500"
                    )}
                    style={{ width: `${tauxRecouvrement}%` }}
                  />
                </div>
              </div>
            </button>

            {/* Détail des factures du mois */}
            {isExpanded && (
              <div className="border-t">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-muted/30">
                      <tr className="border-b">
                        <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">{t("colStudent")}</th>
                        <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">{t("colLabel")}</th>
                        <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">{t("colAmount")}</th>
                        <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">{t("colPaid")}</th>
                        <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">{t("colStatus")}</th>
                        <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground hidden sm:table-cell">{t("reminders")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.factures.map((f, i) => {
                        const paye = f.paiements.reduce((s, p) => s + p.montant, 0);
                        const restant = f.montant - paye;
                        const isRelancee = f.relances.length > 0;
                        return (
                          <tr key={f.id} className={cn("border-b last:border-0", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-xs">{f.eleve.prenom} {f.eleve.nom}</div>
                              <div className="text-xs text-muted-foreground">{f.eleve.matricule} · {f.eleve.classe?.nom ?? "—"}</div>
                            </td>
                            <td className="px-4 py-2.5 text-xs hidden sm:table-cell">{f.libelle}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-xs">{formatMoney(f.montant, f.devise)}</td>
                            <td className="px-4 py-2.5 text-right text-xs hidden sm:table-cell">
                              <span className={paye > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                                {formatMoney(paye, f.devise)}
                              </span>
                              {restant > 0 && (
                                <div className="text-xs text-red-500">{formatMoney(restant, f.devise)}</div>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant={
                                  f.statut === "PAYEE" ? "success" :
                                  f.statut === "EN_RETARD" ? "destructive" :
                                  f.statut === "ANNULEE" ? "secondary" :
                                  "warning"
                                }
                                className="text-[10px]"
                              >
                                {f.statut === "PAYEE" && <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />}
                                {f.statut === "EN_RETARD" && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                                {f.statut === "EN_ATTENTE" && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                                {t(
                                  f.statut === "PAYEE" ? "statusPaid" :
                                  f.statut === "EN_RETARD" ? "statusOverdue" :
                                  f.statut === "ANNULEE" ? "statusCancelled" :
                                  "statusPending"
                                )}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-xs hidden sm:table-cell">
                              {isRelancee ? (
                                <span className="text-orange-600 font-medium">
                                  {t("reminderCount", { count: f.relances.length })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
