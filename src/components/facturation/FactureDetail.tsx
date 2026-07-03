"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, CheckCircle, XCircle, Plus, FileText, CreditCard } from "lucide-react";
import Link from "next/link";
import { enregistrerPaiement, annulerFacture, type PaiementFormData } from "@/lib/actions/facture";

interface Paiement {
  id: string;
  montant: number;
  devise: string;
  methode: string;
  reference: string | null;
  date: Date;
  recu?: string | null;
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
  };
}

const statutConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  EN_ATTENTE: { label: "En attente", variant: "warning" },
  PAYEE: { label: "Payée", variant: "success" },
  EN_RETARD: { label: "En retard", variant: "destructive" },
  ANNULEE: { label: "Annulée", variant: "secondary" },
};

function formatMoney(amount: number, devise: string) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise }).format(amount);
}

export function FactureDetail({ facture }: FactureDetailProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [showPaiement, setShowPaiement] = useState(false);
  const [paiement, setPaiement] = useState<PaiementFormData>({
    montant: 0,
    methode: "espèces",
    reference: "",
  });

  const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalPaye;
  const cfg = statutConfig[facture.statut] ?? statutConfig.EN_ATTENTE;
  const tuteur = facture.eleve.parents[0]?.parent;

  async function handlePaiement(e: React.FormEvent) {
    e.preventDefault();
    if (paiement.montant <= 0) {
      toast.error("Le montant doit être positif");
      return;
    }
    setIsPending(true);
    try {
      await enregistrerPaiement(facture.id, paiement);
      toast.success("Paiement enregistré avec succès");
      setShowPaiement(false);
      setPaiement({ montant: 0, methode: "espèces", reference: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsPending(false);
    }
  }

  async function handleStripeCheckout() {
    setIsPending(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factureId: facture.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Paiement en ligne indisponible");
    } finally {
      setIsPending(false);
    }
  }

  async function handleAnnuler() {
    if (!confirm("Voulez-vous vraiment annuler cette facture ?")) return;
    setIsPending(true);
    try {
      await annulerFacture(facture.id);
      toast.success("Facture annulée");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue");
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
            Retour aux factures
          </Link>
        </Button>
        {facture.statut !== "ANNULEE" && facture.statut !== "PAYEE" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive"
              onClick={handleAnnuler}
              disabled={isPending}
            >
              <XCircle className="h-4 w-4" />
              Annuler
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleStripeCheckout}
              disabled={isPending}
            >
              <CreditCard className="h-4 w-4" />
              Payer en ligne
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setShowPaiement(!showPaiement)}
              disabled={isPending}
            >
              <Plus className="h-4 w-4" />
              Encaisser un paiement
            </Button>
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
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{facture.libelle}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Créée le {new Date(facture.createdAt).toLocaleDateString("fr-FR")}
                {facture.echeance && ` · Échéance: ${new Date(facture.echeance).toLocaleDateString("fr-FR")}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Montant</p>
              <p className="text-2xl font-bold">{formatMoney(facture.montant, facture.devise)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Élève & Tuteur */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Élève</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="font-medium">{facture.eleve.prenom} {facture.eleve.nom}</p>
            <p className="text-sm text-muted-foreground">{facture.eleve.matricule}</p>
            <p className="text-sm text-muted-foreground">{facture.eleve.classe?.nom ?? "N/A"} — {facture.eleve.classe?.niveau ?? ""}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/eleves/${facture.eleve.id}`}>Voir la fiche</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tuteur légal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {tuteur ? (
              <>
                <p className="font-medium">{tuteur.prenom} {tuteur.nom}</p>
                {tuteur.phone && <p className="text-sm text-muted-foreground">{tuteur.phone}</p>}
                {tuteur.email && <p className="text-sm text-muted-foreground">{tuteur.email}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun tuteur enregistré</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Récapitulatif financier */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Facturé</p>
            <p className="text-lg font-bold">{formatMoney(facture.montant, facture.devise)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Encaissé</p>
            <p className="text-lg font-bold text-green-600">{formatMoney(totalPaye, facture.devise)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Restant dû</p>
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
            <CardTitle className="text-sm">Encaisser un paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePaiement} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="montant">Montant ({facture.devise}) *</Label>
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
                <Label htmlFor="methode">Méthode *</Label>
                <select
                  id="methode"
                  value={paiement.methode}
                  onChange={(e) => setPaiement({ ...paiement, methode: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="espèces">Espèces</option>
                  <option value="wave">Wave</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="carte">Carte bancaire</option>
                  <option value="virement">Virement</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reference">Référence</Label>
                <Input
                  id="reference"
                  placeholder="N° transaction..."
                  value={paiement.reference ?? ""}
                  onChange={(e) => setPaiement({ ...paiement, reference: e.target.value })}
                />
              </div>
              <div className="md:col-span-3 flex gap-2">
                <Button type="submit" size="sm" className="gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Valider le paiement
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPaiement(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Historique des paiements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historique des paiements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {facture.paiements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun paiement enregistré</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-right px-4 py-2 font-medium">Montant</th>
                    <th className="text-left px-4 py-2 font-medium">Méthode</th>
                    <th className="text-left px-4 py-2 font-medium">Référence</th>
                    <th className="text-center px-4 py-2 font-medium">Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {facture.paiements.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-600">{formatMoney(p.montant, p.devise)}</td>
                      <td className="px-4 py-2 capitalize">{p.methode}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.reference ?? "—"}</td>
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
