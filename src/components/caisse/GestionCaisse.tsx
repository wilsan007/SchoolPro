"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  CheckCircle,
  XCircle,
  Wallet,
  Clock,
  ArrowRight,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface RemiseCaisse {
  id: string;
  caissierId: string;
  caissier: { id: string; name: string };
  receveurId: string | null;
  receveur: { id: string; name: string } | null;
  montantDeclare: number;
  montantRecu: number | null;
  devise: string;
  dateRemise: string;
  dateSaisieRemise: string;
  dateReception: string | null;
  dateSaisieReception: string | null;
  periodeDebut: string;
  periodeFin: string;
  commentaireReceveur: string | null;
  statut: "EN_ATTENTE" | "CONFIRME" | "REJETE";
  site: { id: string; nom: string } | null;
}

interface UserSession {
  id: string;
  role: string;
  name: string;
}

// ============================================================
// Helpers
// ============================================================
function formatMoney(amount: number, devise: string) {
  try {
    return new Intl.NumberFormat("fr-DJ", {
      style: "currency",
      currency: devise,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("fr-DJ")} ${devise}`;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Rôles qui peuvent confirmer une remise
const RECEVEUR_ROLES = new Set(["ACCOUNTANT", "TENANT_ADMIN", "SUPER_ADMIN"]);

// ============================================================
// Composant principal
// ============================================================
export function GestionCaisse({ user }: { user: UserSession }) {
  const t = useTranslations("caisse");
  const [remises, setRemises] = useState<RemiseCaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isPending, setIsPending] = useState(false);

  // Formulaire de déclaration
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    montantDeclare: 0,
    dateRemise: today,
    periodeDebut: today,
    periodeFin: today,
  });

  // Formulaire de confirmation
  const [confirmForm, setConfirmForm] = useState<Record<string, { montantRecu: number; commentaire: string }>>({});

  const canDeclare = user.role === "CAISSIER" || user.role === "ACCOUNTANT" || user.role === "TENANT_ADMIN" || user.role === "SUPER_ADMIN";
  const canConfirm = RECEVEUR_ROLES.has(user.role);

  const statutConfig: Record<
    string,
    { labelKey: string; variant: "default" | "success" | "warning" | "destructive"; icon: typeof Clock }
  > = {
    EN_ATTENTE: { labelKey: "statusEnAttente", variant: "warning", icon: Clock },
    CONFIRME: { labelKey: "statusConfirme", variant: "success", icon: CheckCircle },
    REJETE: { labelKey: "statusRejete", variant: "destructive", icon: XCircle },
  };

  const fetchRemises = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/remises-caisse");
      if (!res.ok) throw new Error(t("erreurChargement"));
      const data = await res.json();
      setRemises(data.remises ?? []);
    } catch {
      toast.error(t("erreurChargement"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRemises();
  }, [fetchRemises]);

  // ── Déclarer une remise ──
  async function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    if (form.montantDeclare <= 0) {
      toast.error(t("montantPositif"));
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch("/api/remises-caisse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montantDeclare: form.montantDeclare,
          dateRemise: new Date(form.dateRemise).toISOString(),
          periodeDebut: new Date(form.periodeDebut).toISOString(),
          periodeFin: new Date(form.periodeFin).toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? t("erreurDeclaration"));
      }
      toast.success(t("declarationSucces"));
      setShowForm(false);
      setForm({ montantDeclare: 0, dateRemise: today, periodeDebut: today, periodeFin: today });
      fetchRemises();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("erreur"));
    } finally {
      setIsPending(false);
    }
  }

  // ── Confirmer ou rejeter une remise ──
  async function handleConfirm(remiseId: string, action: "confirmer" | "rejeter") {
    const cf = confirmForm[remiseId];
    if (!cf || cf.montantRecu <= 0) {
      toast.error(t("montantRecuRequis"));
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch(`/api/remises-caisse/${remiseId}/confirmer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montantRecu: cf.montantRecu,
          action,
          commentaireReceveur: cf.commentaire || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? t("erreurConfirmation"));
      }
      if (data._warning) {
        toast.warning(data._warning);
      } else if (action === "confirmer") {
        toast.success(t("confirmationSucces"));
      } else {
        toast.success(t("rejetSucces"));
      }
      setConfirmForm((prev) => {
        const next = { ...prev };
        delete next[remiseId];
        return next;
      });
      fetchRemises();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("erreur"));
    } finally {
      setIsPending(false);
    }
  }

  // ── Stats ──
  const enAttente = remises.filter((r) => r.statut === "EN_ATTENTE");
  const confirmees = remises.filter((r) => r.statut === "CONFIRME");
  const rejetees = remises.filter((r) => r.statut === "REJETE");
  const totalDeclare = remises.reduce((s, r) => s + r.montantDeclare, 0);
  const totalConfirme = confirmees.reduce((s, r) => s + (r.montantRecu ?? 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("enAttente")}</p>
            <p className="text-2xl font-bold text-amber-600">{enAttente.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("confirmees")}</p>
            <p className="text-2xl font-bold text-green-600">{confirmees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("totalDeclare")}</p>
            <p className="text-lg font-bold">{formatMoney(totalDeclare, "DJF")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t("totalConfirme")}</p>
            <p className="text-lg font-bold text-green-600">{formatMoney(totalConfirme, "DJF")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Bouton déclarer ── */}
      {canDeclare && (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            {showForm ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {t("declarerRemise")}
          </Button>
        </div>
      )}

      {/* ── Formulaire de déclaration ── */}
      {showForm && canDeclare && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {t("declarerRemise")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDeclare} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="montantDeclare">{t("montantRemis")} *</Label>
                <Input
                  id="montantDeclare"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montantDeclare || ""}
                  onChange={(e) => setForm({ ...form, montantDeclare: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dateRemise">{t("dateRemise")} *</Label>
                <Input
                  id="dateRemise"
                  type="date"
                  value={form.dateRemise}
                  onChange={(e) => setForm({ ...form, dateRemise: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("dateSaisieAuto")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="periodeDebut">{t("periodeDebut")} *</Label>
                <Input
                  id="periodeDebut"
                  type="date"
                  value={form.periodeDebut}
                  onChange={(e) => setForm({ ...form, periodeDebut: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="periodeFin">{t("periodeFin")} *</Label>
                <Input
                  id="periodeFin"
                  type="date"
                  value={form.periodeFin}
                  onChange={(e) => setForm({ ...form, periodeFin: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("validerDeclaration")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  {t("annuler")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Liste des remises ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("historique")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : remises.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("aucuneRemise")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t("colDateRemise")}</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">{t("colCaissier")}</th>
                    <th className="text-right px-4 py-2 font-medium">{t("colMontantDeclare")}</th>
                    <th className="text-left px-4 py-2 font-medium hidden md:table-cell">{t("colReceveur")}</th>
                    <th className="text-right px-4 py-2 font-medium hidden md:table-cell">{t("colMontantRecu")}</th>
                    <th className="text-center px-4 py-2 font-medium">{t("colStatut")}</th>
                    <th className="text-center px-4 py-2 font-medium">{t("colAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {remises.map((r) => {
                    const cfg = statutConfig[r.statut] ?? statutConfig.EN_ATTENTE;
                    const isEnAttente = r.statut === "EN_ATTENTE";
                    const canConfirmThis = canConfirm && isEnAttente && r.caissierId !== user.id;
                    const cf = confirmForm[r.id] ?? { montantRecu: 0, commentaire: "" };
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <div>{formatDate(r.dateRemise)}</div>
                            <div className="text-xs text-muted-foreground">
                              {t("saisie")}: {formatDateTime(r.dateSaisieRemise)}
                            </div>
                          </td>
                          <td className="px-4 py-2 hidden sm:table-cell">{r.caissier.name}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {formatMoney(r.montantDeclare, r.devise)}
                          </td>
                          <td className="px-4 py-2 hidden md:table-cell">
                            {r.receveur?.name ?? "—"}
                            {r.dateReception && (
                              <div className="text-xs text-muted-foreground">
                                {formatDate(r.dateReception)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right hidden md:table-cell">
                            {r.montantRecu !== null ? formatMoney(r.montantRecu, r.devise) : "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={cfg.variant} className="gap-1">
                              <cfg.icon className="h-3 w-3" />
                              {t(cfg.labelKey)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {canConfirmThis ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmForm((prev) => ({
                                    ...prev,
                                    [r.id]: { montantRecu: r.montantDeclare, commentaire: "" },
                                  }))
                                }
                              >
                                <ArrowRight className="h-3 w-3" /> {t("confirmer")}
                              </Button>
                            ) : r.statut === "REJETE" && r.commentaireReceveur ? (
                              <span className="text-xs text-red-600" title={r.commentaireReceveur}>
                                {t("voirMotif")}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                        {/* ── Ligne de confirmation (expandable) ── */}
                        {confirmForm[r.id] && canConfirmThis && (
                          <tr className="bg-muted/20 border-b">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("montantRecu")} *</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={cf.montantRecu || ""}
                                    onChange={(e) =>
                                      setConfirmForm((prev) => ({
                                        ...prev,
                                        [r.id]: { ...cf, montantRecu: parseFloat(e.target.value) || 0 },
                                      }))
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {t("doitEtreIdentique", { montant: formatMoney(r.montantDeclare, r.devise) })}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{t("commentaire")}</Label>
                                  <Input
                                    value={cf.commentaire}
                                    onChange={(e) =>
                                      setConfirmForm((prev) => ({
                                        ...prev,
                                        [r.id]: { ...cf, commentaire: e.target.value },
                                      }))
                                    }
                                    placeholder={t("commentairePlaceholder")}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirm(r.id, "confirmer")}
                                    disabled={isPending}
                                    className="gap-1"
                                  >
                                    <CheckCircle className="h-3 w-3" /> {t("confirmer")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleConfirm(r.id, "rejeter")}
                                    disabled={isPending}
                                    className="gap-1"
                                  >
                                    <XCircle className="h-3 w-3" /> {t("rejeter")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setConfirmForm((prev) => {
                                        const next = { ...prev };
                                        delete next[r.id];
                                        return next;
                                      })
                                    }
                                  >
                                    {t("annuler")}
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Rejetées avec motif ── */}
      {rejetees.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm text-red-700">
              {t("remisesRejetees")} ({rejetees.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rejetees.map((r) => (
              <div key={r.id} className="text-sm border-l-2 border-red-400 pl-3 py-1">
                <span className="font-medium">{formatDate(r.dateRemise)}</span> — {r.caissier.name} →{" "}
                {r.receveur?.name ?? "—"} :{" "}
                <span className="text-red-600">{r.commentaireReceveur ?? t("motifNonPrecise")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
