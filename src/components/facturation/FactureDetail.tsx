"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Plus,
  FileText,
  Printer,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { enregistrerPaiement, annulerFacture, type PaiementFormData } from "@/lib/actions/facture";
import { getPaymentMethodsForSelect, getPaymentMethodType, getPaymentMethodColor } from "@/lib/payment-methods";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface Paiement {
  id: string;
  montant: number;
  devise: string;
  methode: string;
  reference: string | null;
  date: Date;
  recu?: string | null;
  enregistrePar?: { id: string; name: string } | null;
}

interface FactureDetailProps {
  facture: {
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
      classe: { nom: string; niveau: string } | null;
      parents: { parent: { nom: string; prenom: string; phone: string | null; email: string | null } }[];
    };
    paiements: Paiement[];
    createdBy?: { id: string; name: string } | null;
  };
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

function PaymentMethodBadge({ method, t }: { method: string; t: (k: string) => string }) {
  const type = getPaymentMethodType(method);
  const pm = getPaymentMethodsForSelect().find((m) => m.id === method);
  const label = pm ? t(pm.labelKey) : method;

  const variantByType: Record<string, "default" | "success" | "warning" | "secondary" | "destructive"> = {
    CASH: "success",
    MOBILE_MONEY: "default",
    BANK: "secondary",
    CARD: "warning",
  };

  return (
    <Badge variant={variantByType[type ?? ""] ?? "secondary"} className="capitalize">
      {label}
    </Badge>
  );
}

export function FactureDetail({ facture }: FactureDetailProps) {
  const t = useTranslations("facturation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const openPaymentFromUrl = searchParams?.get("action") === "paiement";
  const [isPending, setIsPending] = useState(false);
  const [showPaiement, setShowPaiement] = useState(openPaymentFromUrl);
  const [paiement, setPaiement] = useState<PaiementFormData>({
    montant: 0,
    methode: "espèces",
    reference: "",
  });
  const [lastPaiementId, setLastPaiementId] = useState<string | null>(null);

  const totalPaye = useMemo(() => facture.paiements.reduce((sum, p) => sum + p.montant, 0), [facture.paiements]);
  const restant = facture.montant - totalPaye;
  const cfg = statutConfig[facture.statut] ?? statutConfig.EN_ATTENTE;
  const tuteur = facture.eleve.parents[0]?.parent;
  const canPay = facture.statut !== "ANNULEE" && facture.statut !== "PAYEE" && restant > 0;

  async function handlePaiement(e: React.FormEvent) {
    e.preventDefault();
    if (paiement.montant <= 0) {
      toast.error(t("amountPositive"));
      return;
    }
    setIsPending(true);
    try {
      const result = await enregistrerPaiement(facture.id, paiement);
      toast.success(t("paymentSuccess"));
      setShowPaiement(false);
      setPaiement({ montant: 0, methode: "espèces", reference: "" });
      if (result?.id) setLastPaiementId(result.id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleAnnuler() {
    if (!confirm(t("confirmCancel"))) return;
    setIsPending(true);
    try {
      await annulerFacture(facture.id);
      toast.success(t("invoiceCancelled"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setIsPending(false);
    }
  }

  function startFullPayment() {
    setPaiement((prev) => ({ ...prev, montant: restant }));
    setShowPaiement(true);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
          <Link href="/facturation">
            <ArrowLeft className="h-4 w-4" />
            {t("backToInvoices")}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={`/api/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" />
              {t("printInvoice")}
            </a>
          </Button>
          {canPay && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive"
                onClick={handleAnnuler}
                disabled={isPending}
              >
                <XCircle className="h-4 w-4" />
                {t("cancel")}
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={startFullPayment} disabled={isPending}>
                <Wallet className="h-4 w-4" />
                {t("payBalance")}
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setShowPaiement(!showPaiement)}
                disabled={isPending}
              >
                <Plus className="h-4 w-4" />
                {t("collectPayment")}
              </Button>
            </>
          )}
          {facture.statut === "PAYEE" && facture.paiements.length > 0 && (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href={`/api/paiements/${facture.paiements[0].id}/recu`} target="_blank" rel="noopener noreferrer">
                <Printer className="h-4 w-4" />
                {t("printReceipt")}
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Facture header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg sm:text-xl font-bold font-mono truncate">{facture.numero}</h2>
                <Badge variant={cfg.variant}>{t(cfg.labelKey)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{facture.libelle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("createdOn")} {new Date(facture.createdAt).toLocaleDateString("fr-FR")}
                {facture.echeance && ` · ${t("dueOn")}: ${new Date(facture.echeance).toLocaleDateString("fr-FR")}`}
              </p>
              {facture.createdBy && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("recordedBy")}: <span className="font-medium text-gray-600 dark:text-gray-300">{facture.createdBy.name}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t("amount")}</p>
              <p className="text-2xl font-bold">{formatMoney(facture.montant, facture.devise)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Élève & Tuteur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("student")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-medium">{facture.eleve.prenom} {facture.eleve.nom}</p>
            <p className="text-sm text-muted-foreground">{facture.eleve.matricule}</p>
            <p className="text-sm text-muted-foreground">{facture.eleve.classe?.nom ?? "N/A"} — {facture.eleve.classe?.niveau ?? ""}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/eleves/${facture.eleve.id}`}>{t("viewProfile")}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("legalGuardian")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {tuteur ? (
              <>
                <p className="font-medium">{tuteur.prenom} {tuteur.nom}</p>
                {tuteur.phone && <p className="text-sm text-muted-foreground">{tuteur.phone}</p>}
                {tuteur.email && <p className="text-sm text-muted-foreground">{tuteur.email}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noGuardian")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Récapitulatif financier */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("invoiced")}</p>
            <p className="text-lg font-bold">{formatMoney(facture.montant, facture.devise)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("collected")}</p>
            <p className="text-lg font-bold text-green-600">{formatMoney(totalPaye, facture.devise)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("remaining")}</p>
            <p className={cn("text-lg font-bold", restant > 0 ? "text-red-600" : "text-green-600")}>
              {formatMoney(restant, facture.devise)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Formulaire de paiement */}
      {showPaiement && canPay && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("collectPayment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 bg-muted/50 rounded-lg flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">{t("invoice")}:</span>
              <span className="font-mono font-semibold">{facture.numero}</span>
              <span className="text-muted-foreground">· {facture.eleve.prenom} {facture.eleve.nom}</span>
              <span className="text-muted-foreground">· {t("remaining")}: </span>
              <span className="font-semibold text-red-600">{formatMoney(restant, facture.devise)}</span>
            </div>
            <form onSubmit={handlePaiement} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="montant">{t("amount")} ({facture.devise}) *</Label>
                <Input
                  id="montant"
                  type="number"
                  min="0.01"
                  max={restant}
                  step="0.01"
                  value={paiement.montant || ""}
                  onChange={(e) => setPaiement({ ...paiement, montant: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {t("remaining")}: {formatMoney(restant, facture.devise)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="methode">{t("method")} *</Label>
                <select
                  id="methode"
                  value={paiement.methode}
                  onChange={(e) => setPaiement({ ...paiement, methode: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {getPaymentMethodsForSelect().map((m) => (
                    <option key={m.id} value={m.id}>
                      {t(m.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reference">{t("reference")}</Label>
                <Input
                  id="reference"
                  placeholder={t("referencePlaceholder")}
                  value={paiement.reference ?? ""}
                  onChange={(e) => setPaiement({ ...paiement, reference: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3 flex flex-col sm:flex-row gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("validatePayment")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPaiement(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Confirmation de paiement avec impression reçu */}
      {lastPaiementId && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              <span>{t("paymentRecordedPrintReceipt")}</span>
            </div>
            <Button asChild size="sm" className="gap-2 w-full sm:w-auto">
              <a href={`/api/paiements/${lastPaiementId}/recu`} target="_blank" rel="noopener noreferrer">
                <Printer className="h-4 w-4" />
                {t("printReceipt")}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Historique des paiements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("paymentHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {facture.paiements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("noPayments")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t("date")}</th>
                    <th className="text-right px-4 py-2 font-medium">{t("amount")}</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">{t("method")}</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">{t("reference")}</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">{t("recordedBy")}</th>
                    <th className="text-center px-4 py-2 font-medium">{t("receipt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.paiements.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600">{formatMoney(p.montant, p.devise)}</td>
                      <td className="px-4 py-2 hidden sm:table-cell">
                        <PaymentMethodBadge method={p.methode} t={t} />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{p.reference ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell">{p.enregistrePar?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-center">
                        <a
                          href={`/api/paiements/${p.id}/recu`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
