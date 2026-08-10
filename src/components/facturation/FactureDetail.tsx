"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle, XCircle, Plus, FileText, Printer, CreditCard, Download } from "lucide-react";
import Link from "next/link";
import { enregistrerPaiement, annulerFacture, type PaiementFormData } from "@/lib/actions/facture";
import { useTranslations } from "next-intl";

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

export function FactureDetail({ facture }: FactureDetailProps) {
  const t = useTranslations("facturation");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [paiement, setPaiement] = useState<PaiementFormData>({
    montant: 0,
    methode: "espèces",
    reference: "",
  });
  const [lastPaiementId, setLastPaiementId] = useState<string | null>(null);

  const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalPaye;
  const cfg = statutConfig[facture.statut] ?? statutConfig.EN_ATTENTE;
  const tuteur = facture.eleve.parents[0]?.parent;

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

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/facturation">
            <ArrowLeft className="h-4 w-4" />
            {t("backToInvoices")}
          </Link>
        </Button>
        {facture.statut !== "ANNULEE" && facture.statut !== "PAYEE" && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={`/api/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4" />
                {t("printInvoice")}
              </a>
            </Button>
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
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setShowPaiement(!showPaiement)}
              disabled={isPending}
            >
              <Plus className="h-4 w-4" />
              {t("collectPayment")}
            </Button>
          </div>
        )}
        {facture.statut === "PAYEE" && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={`/api/factures/${facture.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4" />
                {t("printInvoice")}
              </a>
            </Button>
            {facture.paiements.length > 0 && (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={`/api/paiements/${facture.paiements[0].id}/recu`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" />
                  {t("printReceipt")}
                </a>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Facture header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold font-mono">{facture.numero}</h2>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-3 gap-4">
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
            <p className={`text-lg font-bold ${restant > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatMoney(restant, facture.devise)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Formulaire de paiement */}
      {showPaiement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("collectPayment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePaiement} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="montant">{t("amount")} ({facture.devise}) *</Label>
                <Input
                  id="montant"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paiement.montant || ""}
                  onChange={(e) => setPaiement({ ...paiement, montant: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="methode">{t("method")} *</Label>
                <select
                  id="methode"
                  value={paiement.methode}
                  onChange={(e) => setPaiement({ ...paiement, methode: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="espèces">{t("cash")}</option>
                  <option value="waffi">{t("waffi")}</option>
                  <option value="cac_pay">{t("cacPay")}</option>
                  <option value="dahab_plus">{t("dahabPlus")}</option>
                  <option value="saba_pay">{t("sabaPay")}</option>
                  <option value="faida">{t("faida")}</option>
                  <option value="virement">{t("transfer")}</option>
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
              <div className="md:col-span-3 flex gap-2">
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
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <span>{t("paymentRecordedPrintReceipt")}</span>
            </div>
            <Button asChild size="sm" className="gap-2">
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
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t("date")}</th>
                    <th className="text-right px-4 py-2 font-medium">{t("amount")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("method")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("reference")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("recordedBy")}</th>
                    <th className="text-center px-4 py-2 font-medium">{t("receipt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.paiements.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600">{formatMoney(p.montant, p.devise)}</td>
                      <td className="px-4 py-2 capitalize">{p.methode}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.reference ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.enregistrePar?.name ?? "—"}</td>
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
