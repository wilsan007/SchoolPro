"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Calendar,
  Users,
  GraduationCap,
  Send,
  DollarSign,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Plus,
  Ban,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Phone,
  Mail,
  MessageCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PromotionPreview } from "./PromotionPreview";
import { SuiviReinscriptions } from "./SuiviReinscriptions";
import {
  creerCampagne,
  avancerEtape,
  annulerCampagne,
  clôturerAncienneAnnee,
  executerPromotionCampagne,
  previewPromotionCampagne,
  envoyerInvitations,
  marquerSansReponse,
  genererFraisRenouvellement,
  genererMensualitesCampagne,
  activerNouvelleAnnee,
  verifierEtape,
} from "@/app/(dashboard)/parametres/reinscription/actions";

interface InvitationData {
  id: string;
  statut: string;
  dateInvitation: string;
  dateReponse: string | null;
  canal: string;
  parentPhone: string | null;
  parentEmail: string | null;
  nbRelances: number;
  decisionPromotion: string | null;
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string;
    statut: string;
    classe: { nom: string; niveau: string } | null;
    parents: Array<{
      parent: { nom: string; prenom: string; telephone: string | null; email: string | null };
    }>;
  };
}

interface CampagneData {
  id: string;
  libelle: string;
  anneeSource: string;
  anneeCible: string;
  statut: string;
  etapeActuelle: number;
  nbElevesTotal: number;
  nbReinscrits: number;
  nbNonReinscrits: number;
  nbDiplomes: number;
  revenusPrevus: number;
  dateDebut: string;
  dateFin: string | null;
  invitations: InvitationData[];
}

interface AnneeData {
  id: string;
  libelle: string;
  statut: string;
  isCurrent: boolean;
}

interface StatsData {
  campagne: CampagneData;
  statuts: { invite: number; confirme: number; refuse: number; sansReponse: number };
  revenusPrevus: number;
  tauxReinscription: number;
}

const ETAPES = [
  { num: 1, icon: Calendar, key: "step1" },
  { num: 2, icon: CheckCircle2, key: "step2" },
  { num: 3, icon: GraduationCap, key: "step3" },
  { num: 4, icon: Users, key: "step4" },
  { num: 5, icon: DollarSign, key: "step5" },
  { num: 6, icon: Rocket, key: "step6" },
];

export function CampagneReinscriptionWizard({
  campagneActive,
  campagnes,
  annees,
  stats,
  userRole,
}: {
  campagneActive: CampagneData | null;
  campagnes: CampagneData[];
  annees: AnneeData[];
  stats: StatsData | null;
  userRole: string;
}) {
  const t = useTranslations("reinscription");
  const [isPending, startTransition] = useTransition();
  const [etape, setEtape] = useState(campagneActive?.etapeActuelle ?? 1);
  const [showCreateForm, setShowCreateForm] = useState(!campagneActive);
  const [form, setForm] = useState({ libelle: "", anneeSource: "", anneeCible: "" });
  const [verification, setVerification] = useState<{ ok: boolean; message?: string } | null>(null);
  const [moisGen, setMoisGen] = useState(9); // Septembre par défaut

  const isAdmin = userRole === "TENANT_ADMIN" || userRole === "SUPER_ADMIN" || userRole === "ACCOUNTANT";
  const isTerminee = campagneActive?.statut === "TERMINEE" || campagneActive?.statut === "ANNULEE";

  // Vérifier l'étape courante au chargement
  useEffect(() => {
    if (campagneActive) {
      startTransition(async () => {
        const result = await verifierEtape(campagneActive.id, etape);
        setVerification(result);
      });
    }
  }, [campagneActive, etape]);

  // Auto-suggest libellé et années
  useEffect(() => {
    if (!form.libelle && annees.length > 0) {
      const courante = annees.find((a) => a.isCurrent);
      const sourceLibelle = courante?.libelle ?? annees[0].libelle;
      const anneeDebut = parseInt(sourceLibelle.split("-")[1] ?? "2026");
      const cibleLibelle = `${anneeDebut}-${anneeDebut + 1}`;
      setForm((p) => ({
        ...p,
        libelle: `Réinscription ${cibleLibelle}`,
        anneeSource: sourceLibelle,
        anneeCible: cibleLibelle,
      }));
    }
  }, [annees, form.libelle]);

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await creerCampagne(form);
        toast.success(t("campagneCreated", { count: result.nbInvitations }));
        setShowCreateForm(false);
        // Recharger la page
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleEtapeSuivante() {
    if (!campagneActive) return;
    startTransition(async () => {
      try {
        const nextEtape = etape + 1;
        await avancerEtape(campagneActive.id, nextEtape);
        setEtape(nextEtape);
        toast.success(t("stepAdvanced"));
        if (nextEtape >= 6) {
          window.location.reload();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleEtapePrecedente() {
    if (etape > 1) {
      setEtape(etape - 1);
    }
  }

  async function handleAnnuler() {
    if (!campagneActive) return;
    if (!confirm(t("confirmCancel"))) return;
    startTransition(async () => {
      try {
        await annulerCampagne(campagneActive.id);
        toast.success(t("campagneCancelled"));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  // Actions spécifiques par étape
  async function handleCloturer() {
    if (!campagneActive) return;
    startTransition(async () => {
      try {
        const result = await clôturerAncienneAnnee(campagneActive.id);
        toast.success(result.alreadyClosed ? t("alreadyClosed") : t("yearClosed"));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleEnvoyerInvitations() {
    if (!campagneActive) return;
    startTransition(async () => {
      try {
        const result = await envoyerInvitations(campagneActive.id, "WHATSAPP");
        toast.success(t("invitationsSent", { sent: result.envoyees, errors: result.erreurs }));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleMarquerSansReponse() {
    if (!campagneActive) return;
    if (!confirm(t("confirmMarkNoResponse"))) return;
    startTransition(async () => {
      try {
        const result = await marquerSansReponse(campagneActive.id);
        toast.success(t("markedNoResponse", { count: result.nbMarques }));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleGenererFrais() {
    if (!campagneActive) return;
    startTransition(async () => {
      try {
        const result = await genererFraisRenouvellement(campagneActive.id);
        toast.success(t("feesGenerated", { generated: result.generated, skipped: result.skipped }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleGenererMensualites() {
    if (!campagneActive) return;
    startTransition(async () => {
      try {
        const result = await genererMensualitesCampagne(campagneActive.id, moisGen);
        toast.success(t("monthlyGenerated", { generated: result.generated, skipped: result.skipped }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  async function handleActiver() {
    if (!campagneActive) return;
    if (!confirm(t("confirmActivate"))) return;
    startTransition(async () => {
      try {
        await activerNouvelleAnnee(campagneActive.id);
        toast.success(t("yearActivated"));
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      }
    });
  }

  // ====== RENDER ======

  // Pas de campagne active → formulaire de création
  if (!campagneActive && showCreateForm) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-primary" />
              {t("newCampaign")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreer} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="libelle">{t("campaignName")}</Label>
                <Input
                  id="libelle"
                  value={form.libelle}
                  onChange={(e) => setForm((p) => ({ ...p, libelle: e.target.value }))}
                  placeholder="Réinscription 2026-2027"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="anneeSource">{t("sourceYear")}</Label>
                  <select
                    id="anneeSource"
                    value={form.anneeSource}
                    onChange={(e) => setForm((p) => ({ ...p, anneeSource: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    required
                  >
                    <option value="">—</option>
                    {annees.map((a) => (
                      <option key={a.id} value={a.libelle}>
                        {a.libelle} {a.isCurrent ? "(active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="anneeCible">{t("targetYear")}</Label>
                  <Input
                    id="anneeCible"
                    value={form.anneeCible}
                    onChange={(e) => setForm((p) => ({ ...p, anneeCible: e.target.value }))}
                    placeholder="2026-2027"
                    required
                  />
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                {t("createHint")}
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="submit" size="sm" disabled={isPending} className="gap-2">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("create")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Campagnes passées */}
        {campagnes.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t("pastCampaigns")}</h3>
            <div className="space-y-2">
              {campagnes.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.libelle}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.anneeSource} → {c.anneeCible}
                    </div>
                  </div>
                  <Badge variant={c.statut === "TERMINEE" ? "default" : c.statut === "ANNULEE" ? "destructive" : "secondary"}>
                    {t(`statut.${c.statut.toLowerCase()}`)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!campagneActive) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("noCampaign")}</p>
      </div>
    );
  }

  const progression = Math.round((etape / 6) * 100);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* En-tête campagne */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{campagneActive.libelle}</h2>
              <p className="text-sm text-muted-foreground">
                {campagneActive.anneeSource} → {campagneActive.anneeCible}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isTerminee ? "default" : "secondary"}>
                {t(`statut.${campagneActive.statut.toLowerCase()}`)}
              </Badge>
              {!isTerminee && isAdmin && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={handleAnnuler} disabled={isPending}>
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Barre de progression */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>{t("progress")}</span>
              <span>{progression}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                style={{ width: `${progression}%` }}
              />
            </div>
          </div>

          {/* Stats rapides */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <StatCard label={t("totalStudents")} value={stats.campagne.nbElevesTotal} icon={Users} color="text-blue-600" />
              <StatCard label={t("reinscrits")} value={stats.statuts.confirme} icon={CheckCircle2} color="text-green-600" />
              <StatCard label={t("diplomes")} value={stats.campagne.nbDiplomes} icon={GraduationCap} color="text-violet-600" />
              <StatCard label={t("tauxReinscription")} value={`${stats.tauxReinscription}%`} icon={TrendingUp} color="text-amber-600" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stepper visuel */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {ETAPES.map((etapeConfig, idx) => {
          const Icon = etapeConfig.icon;
          const isCurrent = etape === etapeConfig.num;
          const isDone = etape > etapeConfig.num;
          const isClickable = etapeConfig.num <= etape;
          return (
            <div key={etapeConfig.num} className="flex items-center flex-1 min-w-0">
              <button
                onClick={() => isClickable && setEtape(etapeConfig.num)}
                disabled={!isClickable}
                className={cn(
                  "flex flex-col items-center gap-1.5 transition-all",
                  isClickable ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    isCurrent && "border-primary bg-primary/10 text-primary scale-110",
                    isDone && "border-green-500 bg-green-500/10 text-green-600",
                    !isCurrent && !isDone && "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={cn("text-xs font-medium whitespace-nowrap", isCurrent && "text-primary")}>
                  {t(`${etapeConfig.key}.title`)}
                </span>
              </button>
              {idx < ETAPES.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-2 transition-all", isDone ? "bg-green-500" : "bg-muted-foreground/20")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Vérification de l'étape */}
      {verification && !verification.ok && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">{t("verificationFailed")}</p>
            <p className="mt-1">{verification.message}</p>
          </div>
        </div>
      )}

      {/* Contenu de l'étape courante */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const Icon = ETAPES[etape - 1].icon;
              return <Icon className="h-5 w-5 text-primary" />;
            })()}
            {t(`${ETAPES[etape - 1].key}.title`)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ÉTAPE 1: Préparation */}
          {etape === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("step1.description")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ChecklistItem
                  label={t("step1.targetYearExists")}
                  ok={annees.some((a) => a.libelle === campagneActive.anneeCible)}
                />
                <ChecklistItem
                  label={t("step1.tarifsConfigured")}
                  ok={true}
                  hint={t("step1.tarifsHint")}
                />
                <ChecklistItem
                  label={t("step1.sourceYearActive")}
                  ok={annees.some((a) => a.libelle === campagneActive.anneeSource && a.isCurrent)}
                />
                <ChecklistItem
                  label={t("step1.invitationsCreated")}
                  ok={campagneActive.invitations.length > 0}
                  hint={`${campagneActive.invitations.length} ${t("invitations")}`}
                />
              </div>
            </div>
          )}

          {/* ÉTAPE 2: Clôture */}
          {etape === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("step2.description")}</p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{campagneActive.anneeSource}</span>
                  <Badge variant={
                    annees.find((a) => a.libelle === campagneActive.anneeSource)?.statut === "CLOTUREE" ? "default" :
                    annees.find((a) => a.libelle === campagneActive.anneeSource)?.statut === "ARCHIVEE" ? "secondary" : "outline"
                  }>
                    {annees.find((a) => a.libelle === campagneActive.anneeSource)?.statut === "CLOTUREE" ? t("closed") :
                     annees.find((a) => a.libelle === campagneActive.anneeSource)?.statut === "ARCHIVEE" ? t("archived") : t("open")}
                  </Badge>
                </div>
              </div>
              {isAdmin && (
                <Button onClick={handleCloturer} disabled={isPending || annees.find((a) => a.libelle === campagneActive.anneeSource)?.statut === "CLOTUREE"} className="gap-2">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {t("step2.close")}
                </Button>
              )}
            </div>
          )}

          {/* ÉTAPE 3: Promotion */}
          {etape === 3 && (
            <PromotionPreview
              campagneId={campagneActive.id}
              anneeSource={campagneActive.anneeSource}
              anneeCible={campagneActive.anneeCible}
              isAdmin={isAdmin}
              onExecuted={() => window.location.reload()}
            />
          )}

          {/* ÉTAPE 4: Réinscriptions */}
          {etape === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("step4.description")}</p>

              {/* Actions d'envoi */}
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleEnvoyerInvitations} disabled={isPending} className="gap-2">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t("step4.sendInvitations")}
                  </Button>
                  <Button onClick={handleMarquerSansReponse} variant="outline" disabled={isPending} className="gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("step4.markNoResponse")}
                  </Button>
                </div>
              )}

              {/* Suivi détaillé */}
              <SuiviReinscriptions invitations={campagneActive.invitations} isAdmin={isAdmin} />
            </div>
          )}

          {/* ÉTAPE 5: Frais */}
          {etape === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("step5.description")}</p>

              {/* Stats revenus */}
              {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">{t("step5.renewalFees")}</div>
                    <div className="text-2xl font-bold text-green-600 mt-1">
                      {stats.revenusPrevus.toLocaleString()} DJF
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">{t("step5.reinscrits")}</div>
                    <div className="text-2xl font-bold mt-1">{stats.statuts.confirme}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">{t("step5.taux")}</div>
                    <div className="text-2xl font-bold text-amber-600 mt-1">{stats.tauxReinscription}%</div>
                  </div>
                </div>
              )}

              {(isAdmin || userRole === "ACCOUNTANT") && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenererFrais} disabled={isPending} className="gap-2">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    {t("step5.generateRenewal")}
                  </Button>
                  <div className="flex items-center gap-2">
                    <select
                      value={moisGen}
                      onChange={(e) => setMoisGen(parseInt(e.target.value))}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value={9}>Septembre</option>
                      <option value={10}>Octobre</option>
                      <option value={11}>Novembre</option>
                      <option value={12}>Décembre</option>
                      <option value={1}>Janvier</option>
                      <option value={2}>Février</option>
                      <option value={3}>Mars</option>
                      <option value={4}>Avril</option>
                      <option value={5}>Mai</option>
                      <option value={6}>Juin</option>
                    </select>
                    <Button onClick={handleGenererMensualites} variant="outline" disabled={isPending} className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t("step5.generateMonthly")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 6: Activation */}
          {etape === 6 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("step6.description")}</p>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-6 text-center">
                <Rocket className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold">{t("step6.ready")}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t("step6.readyDesc")}</p>
                {isAdmin && (
                  <Button onClick={handleActiver} disabled={isPending} size="lg" className="mt-4 gap-2 bg-green-600 hover:bg-green-700">
                    {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                    {t("step6.activate")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation entre étapes */}
      {!isTerminee && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleEtapePrecedente}
            disabled={etape === 1 || isPending}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("previous")}
          </Button>
          {etape < 6 && (
            <Button
              onClick={handleEtapeSuivante}
              disabled={isPending || (verification ? !verification.ok : false)}
              className="gap-2"
            >
              {t("next")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-xl font-bold mt-1", color)}>{value}</div>
    </div>
  );
}

function ChecklistItem({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border p-3">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
      )}
      <div className="min-w-0">
        <p className={cn("text-sm", ok ? "text-foreground" : "text-muted-foreground")}>{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
