"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Banknote, FileText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getFactureByNumero } from "@/lib/actions/facture";

interface FactureFound {
  id: string;
  numero: string;
  libelle: string;
  montant: number;
  devise: string;
  statut: string;
  echeance: Date | null;
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    classe: { nom: string } | null;
  };
}

export function PaiementParNumero({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("facturation");
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [facture, setFacture] = useState<FactureFound | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rechercher(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setFacture(null);

    const cleaned = numero.trim();
    if (!cleaned) {
      setError(t("invoiceNumberRequired"));
      return;
    }

    setLoading(true);
    try {
      const f = await getFactureByNumero(cleaned);
      if (!f) {
        setError(t("invoiceNotFound"));
      } else if (f.statut === "PAYEE") {
        setError(t("invoiceAlreadyPaid"));
      } else if (f.statut === "ANNULEE") {
        setError(t("invoiceCancelled"));
      } else {
        setFacture(f);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setNumero("");
    setFacture(null);
    setError(null);
  }

  if (!open) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          {t("payByInvoiceNumber")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={rechercher} className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invoice-number">{t("invoiceNumber")}</Label>
            <Input
              id="invoice-number"
              placeholder={t("invoiceNumberPlaceholder")}
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value);
                if (facture || error) {
                  setFacture(null);
                  setError(null);
                }
              }}
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="mt-6 gap-2"
            disabled={loading || !numero.trim()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("search")}
          </Button>
        </form>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}

        {facture && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-mono font-semibold">{facture.numero}</span>
                </div>
                <p className="text-sm text-muted-foreground">{facture.libelle}</p>
                <p className="text-xs text-muted-foreground">
                  {facture.eleve.prenom} {facture.eleve.nom} — {facture.eleve.matricule}
                  {facture.eleve.classe?.nom ? ` · ${facture.eleve.classe.nom}` : ""}
                </p>
              </div>
              <Badge variant={facture.statut === "EN_RETARD" ? "destructive" : "warning"}>
                {facture.statut.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" className="gap-2">
                <Link href={`/facturation/${facture.id}?action=paiement`} onClick={reset}>
                  <Banknote className="h-4 w-4" />
                  {t("collectPayment")}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/facturation/${facture.id}`} onClick={reset}>
                  {t("detail")}
                </Link>
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
