"use client";

import { useState, useTransition, useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, ClipboardList, CheckCircle2, XCircle,
  Clock, UserPlus, BookOpen, Phone, Mail, Calendar,
  Loader2, ChevronDown, ChevronUp, FileText, Star,
  FolderOpen, Upload, Send, ShieldCheck, Lock,
  DollarSign, CreditCard, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { optionsMoisScolarite, formatMoisScolarite, moisScolariteDefaut } from "@/lib/admissions/mois-scolarite";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatutCandidature = "SOUMISE" | "DOSSIER_COMPLET" | "EN_EXAMEN" | "ADMIS" | "REFUSE" | "INSCRIT" | "ANNULE";
type StatutDossier = "INCOMPLET" | "EN_COURS" | "COMPLETE" | "VALIDE" | "CLOS";
type LienParente = "PERE" | "MERE" | "TUTEUR" | "AUTRE";
type Sexe = "M" | "F";

interface DocumentInscription {
  type: string;
  url: string;
  nom?: string;
  taille?: number;
  ajouteLe?: string;
  ajouteParId?: string;
}

interface FactureLiee {
  id: string;
  numero: string;
  libelle: string;
  montant: number;
  devise: string;
  statut: string;
  mois: string | null;
  paiements: { montant: number }[];
}

interface ClasseOption {
  id: string;
  nom: string;
  niveau: string;
  siteId: string | null;
  site: { nom: string } | null;
}

interface Candidature {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: Date | string;
  sexe: Sexe;
  classeVoulue: string;
  annee: string;
  parentNom: string;
  parentPrenom: string;
  parentEmail: string | null;
  parentPhone: string;
  parentLien: LienParente;
  statut: StatutCandidature;
  dateExamen: Date | string | null;
  noteExamen: number | null;
  commentaire: string | null;
  motifRefus: string | null;
  createdAt: Date | string;
  siteId: string | null;
  // Dossier d'inscription
  dossierStatut?: StatutDossier;
  documentsInscription?: DocumentInscription[] | null;
  creeParId?: string | null;
  valideParId?: string | null;
  valideLe?: Date | string | null;
}

// ─── Config statuts candidature ───────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutCandidature, { labelKey: string; color: string; icon: React.ReactNode }> = {
  SOUMISE: { labelKey: "statusSubmitted", color: "badge-vif-sky", icon: <ClipboardList className="w-3 h-3" /> },
  DOSSIER_COMPLET: { labelKey: "statusDossierComplete", color: "badge-vif-teal", icon: <FolderOpen className="w-3 h-3" /> },
  EN_EXAMEN: { labelKey: "statusExam", color: "badge-vif-amber", icon: <Clock className="w-3 h-3" /> },
  ADMIS: { labelKey: "statusAdmitted", color: "badge-vif-emerald", icon: <CheckCircle2 className="w-3 h-3" /> },
  REFUSE: { labelKey: "statusRefused", color: "badge-vif-rose", icon: <XCircle className="w-3 h-3" /> },
  INSCRIT: { labelKey: "statusEnrolled", color: "badge-vif-violet", icon: <UserPlus className="w-3 h-3" /> },
  ANNULE: { labelKey: "statusCancelled", color: "bg-muted text-muted-foreground border-border", icon: <XCircle className="w-3 h-3" /> },
};

// ─── Config statuts dossier ───────────────────────────────────────────────────

const DOSSIER_CONFIG: Record<StatutDossier, { labelKey: string; color: string; icon: React.ReactNode }> = {
  INCOMPLET: { labelKey: "dossierIncomplete", color: "badge-vif-rose", icon: <FolderOpen className="w-3 h-3" /> },
  EN_COURS: { labelKey: "dossierInProgress", color: "badge-vif-amber", icon: <Clock className="w-3 h-3" /> },
  COMPLETE: { labelKey: "dossierComplete", color: "badge-vif-sky", icon: <CheckCircle2 className="w-3 h-3" /> },
  VALIDE: { labelKey: "dossierValidated", color: "badge-vif-emerald", icon: <ShieldCheck className="w-3 h-3" /> },
  CLOS: { labelKey: "dossierClosed", color: "badge-vif-violet", icon: <Lock className="w-3 h-3" /> },
};

// Types de documents requis
const TYPES_DOCUMENTS = [
  { key: "acte_naissance", labelKey: "docBirthCert" },
  { key: "photo_identite", labelKey: "docPhoto" },
  { key: "carte_identite_parent", labelKey: "docParentId" },
  { key: "bulletin_precedent", labelKey: "docReportCard" },
  { key: "certificat_transfert", labelKey: "docTransferCert" },
];

// Pièces obligatoires pour le passage à EN_EXAMEN
const PIECES_OBLIGATOIRES = ["acte_naissance", "photo_identite", "carte_identite_parent"];

// Rôles autorisés à valider le dossier et finaliser l'inscription
const ROLES_DIRECTION = ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"];
// Rôles autorisés à finaliser l'inscription (INSCRIT)
const ROLES_INSCRIPTION = ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT"];

const WORKFLOW: StatutCandidature[] = ["SOUMISE", "DOSSIER_COMPLET", "EN_EXAMEN", "ADMIS", "INSCRIT"];

const PAYMENT_METHODS = [
  { value: "especes", labelKey: "payCash" },
  { value: "waffi", labelKey: "payWaffi" },
  { value: "cac_pay", labelKey: "payCacPay" },
  { value: "dahab_plus", labelKey: "payDahabPlus" },
  { value: "saba_pay", labelKey: "paySabaPay" },
  { value: "faida", labelKey: "payFaida" },
  { value: "virement", labelKey: "payTransfer" },
];

// ─── Modal : choix du mois de scolarité avant admission ───────────────────────

function AdmitMoisModal({
  candidature,
  onConfirm,
  onClose,
}: {
  candidature: Candidature;
  onConfirm: (moisScolarite: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("admissions");
  const anneeDebut = parseInt(candidature.annee.split("-")[0], 10) || new Date().getFullYear();
  const options = optionsMoisScolarite(anneeDebut);
  const defaut = moisScolariteDefaut();
  // Trouver l'option qui correspond au défaut, sinon prendre la première
  const [selectedMois, setSelectedMois] = useState(
    options.includes(defaut) ? defaut : options[0]
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            {t("admitCandidate")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            {t("admitMoisDescription", { name: `${candidature.prenom} ${candidature.nom}` })}
          </p>
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">
              {t("schoolMonth")}
            </label>
            <select
              value={selectedMois}
              onChange={(e) => setSelectedMois(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
            >
              {options.map((mois) => (
                <option key={mois} value={mois}>
                  {formatMoisScolarite(mois)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onConfirm(selectedMois)}
            >
              <CheckCircle2 className="w-4 h-4" />
              {t("confirmAdmit")}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Modal : encaissement inline ──────────────────────────────────────────────

function PaiementInlineModal({
  facture,
  onPaid,
  onClose,
}: {
  facture: FactureLiee;
  onPaid: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admissions");
  const [montant, setMontant] = useState("");
  const [methode, setMethode] = useState("especes");
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
  const restant = facture.montant - totalPaye;

  const handleSubmit = () => {
    const montantNum = parseFloat(montant);
    if (!montantNum || montantNum <= 0) {
      toast.error(t("invalidAmount"));
      return;
    }
    if (montantNum > restant) {
      toast.error(t("amountExceedsBalance", { restant, devise: facture.devise }));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/facturation/paiement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            factureId: facture.id,
            montant: montantNum,
            methode,
            reference: reference || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "");
        }
        toast.success(t("paymentRecorded"));
        onPaid();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("paymentError"));
      }
    });
  };

  const progressPct = facture.montant > 0 ? (totalPaye / facture.montant) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            {t("collectPayment")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Récapitulatif facture */}
          <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{t("invoiceTotal")}</span>
              <span className="font-semibold">{facture.montant.toLocaleString()} {facture.devise}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{t("alreadyPaid")}</span>
              <span className="font-semibold text-emerald-600">{totalPaye.toLocaleString()} {facture.devise}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{t("remaining")}</span>
              <span className="font-semibold text-rose-600">{restant.toLocaleString()} {facture.devise}</span>
            </div>
            {/* Barre de progression */}
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Montant */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">{t("amount")}</label>
            <Input
              type="number"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder={`${restant}`}
              max={restant}
              className="text-sm"
            />
            {parseFloat(montant) < restant && parseFloat(montant) > 0 && (
              <p className="text-xs text-amber-600 mt-1">{t("partialPaymentHint")}</p>
            )}
          </div>

          {/* Méthode */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">{t("paymentMethod")}</label>
            <select
              value={methode}
              onChange={(e) => setMethode(e.target.value)}
              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Référence */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">{t("reference")}</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("referenceOptional")}
              className="text-sm"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 gap-2"
              disabled={isPending || !montant || parseFloat(montant) <= 0}
              onClick={handleSubmit}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {t("recordPayment")}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Formulaire de candidature ────────────────────────────────────────────────

function CandidatureForm({
  classes,
  onClose,
  onCreated,
}: {
  classes: ClasseOption[];
  onClose: () => void;
  onCreated: (c: Candidature) => void;
}) {
  const t = useTranslations("admissions");
  const anneeActuelle = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [form, setForm] = useState({
    nom: "", prenom: "", dateNaissance: "", sexe: "M" as Sexe,
    classeId: "", classeVoulue: "", annee: anneeActuelle,
    parentNom: "", parentPrenom: "", parentEmail: "", parentPhone: "",
    parentLien: "PERE" as LienParente,
  });
  const [isPending, startTransition] = useTransition();

  // Détecter si plusieurs sites existent pour afficher le nom du site
  const sitesUniques = new Set(classes.map((c) => c.siteId));
  const multiSites = sitesUniques.size > 1;

  // Regrouper les classes par site pour l'affichage en <optgroup>
  const classesParSite = useMemo(() => {
    const groupes = new Map<string, { label: string; classes: ClasseOption[] }>();
    for (const c of classes) {
      const key = c.siteId ?? "__sans_site__";
      const label = c.site?.nom ?? t("unassignedSite");
      if (!groupes.has(key)) groupes.set(key, { label, classes: [] });
      groupes.get(key)!.classes.push(c);
    }
    return Array.from(groupes.entries()).map(([key, g]) => ({ key, ...g }));
  }, [classes, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = classes.length > 0
          ? { ...form, classeVoulue: undefined } // envoyer classeId, le serveur dérivera classeVoulue
          : { ...form, classeId: undefined };    // pas de classes → texte libre
        const res = await fetch("/api/admissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "");
        }
        const { candidature } = await res.json();
        toast.success(t("candidatureSaved"));
        onCreated(candidature);
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("saveError"));
      }
    });
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col border-0 shadow-2xl">
        <CardHeader className="pb-4 flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-primary" />
            {t("newCandidature")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Informations élève */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t("studentInfo")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("lastName")}</label>
                  <Input value={form.nom} onChange={(e) => set("nom", e.target.value)} required placeholder="DIALLO" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("firstName")}</label>
                  <Input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} required placeholder="Amadou" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("birthDate")}</label>
                  <Input type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("gender")}</label>
                  <select
                    value={form.sexe}
                    onChange={(e) => set("sexe", e.target.value)}
                    className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
                  >
                    <option value="M">{t("male")}</option>
                    <option value="F">{t("female")}</option>
                  </select>
                </div>
                {/* Classe : select si classes existent, texte libre sinon */}
                {classes.length > 0 ? (
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">{t("desiredClass")}</label>
                    <select
                      value={form.classeId}
                      onChange={(e) => set("classeId", e.target.value)}
                      required
                      className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
                    >
                      <option value="">{t("selectClass")}</option>
                      {multiSites
                        ? classesParSite.map((g) => (
                            <optgroup key={g.key} label={g.label}>
                              {g.classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nom}
                                </option>
                              ))}
                            </optgroup>
                          ))
                        : classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nom}
                            </option>
                          ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">{t("desiredClass")}</label>
                    <Input value={form.classeVoulue} onChange={(e) => set("classeVoulue", e.target.value)} required placeholder="6ème, Terminale S…" className="text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("schoolYear")}</label>
                  <Input value={form.annee} onChange={(e) => set("annee", e.target.value)} className="text-sm" />
                </div>
              </div>
            </div>

            {/* Informations parent */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t("parentInfo")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("lastName")}</label>
                  <Input value={form.parentNom} onChange={(e) => set("parentNom", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("firstName")}</label>
                  <Input value={form.parentPrenom} onChange={(e) => set("parentPrenom", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("email")}</label>
                  <Input type="email" value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder={t("emailOptional")} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("phone")}</label>
                  <Input value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} required placeholder="+221 77 000 00 00" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("relationship")}</label>
                  <select
                    value={form.parentLien}
                    onChange={(e) => set("parentLien", e.target.value)}
                    className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
                  >
                    <option value="PERE">{t("father")}</option>
                    <option value="MERE">{t("mother")}</option>
                    <option value="TUTEUR">{t("guardian")}</option>
                    <option value="AUTRE">{t("other")}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button type="submit" disabled={isPending} className="flex-1 gap-2 w-full sm:w-auto">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {t("saveCandidature")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Carte candidature ────────────────────────────────────────────────────────

function CandidatureCard({
  candidature,
  factures,
  onUpdate,
  onReload,
  userRole,
}: {
  candidature: Candidature;
  factures: FactureLiee[];
  onUpdate: (updated: Candidature) => void;
  onReload: () => void;
  userRole: string;
}) {
  const t = useTranslations("admissions");
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showDossier, setShowDossier] = useState(false);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showPaiementModal, setShowPaiementModal] = useState(false);
  const config = STATUT_CONFIG[candidature.statut];
  const isDirection = ROLES_DIRECTION.includes(userRole);
  const canInscrire = ROLES_INSCRIPTION.includes(userRole);
  const dossierStatut = candidature.dossierStatut ?? "INCOMPLET";
  const dossierConfig = DOSSIER_CONFIG[dossierStatut];
  const docs = candidature.documentsInscription ?? [];

  // Facture liée (la première, généralement unique)
  const facture = factures[0] ?? null;
  const facturePayee = facture?.statut === "PAYEE";
  const totalPaye = facture?.paiements.reduce((sum, p) => sum + p.montant, 0) ?? 0;
  const restant = facture ? facture.montant - totalPaye : 0;

  const handleStatut = (statut: StatutCandidature, extra?: Record<string, unknown>) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admissions/${candidature.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut, ...extra }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "");
        }
        const { candidature: updated, eleveCreeId, factureCreeId } = await res.json();
        onUpdate(updated);
        if (statut === "INSCRIT" && eleveCreeId) {
          toast.success(t("studentCreated"));
        } else if (statut === "ADMIS" && factureCreeId) {
          toast.success(t("admittedWithInvoice"));
        } else {
          toast.success(t("statusUpdated", { status: t(STATUT_CONFIG[statut].labelKey) }));
        }
        onReload();
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t("updateError"));
      }
    });
  };

  const handleAdmit = (moisScolarite: string) => {
    setShowAdmitModal(false);
    handleStatut("ADMIS", { moisScolarite });
  };

  const handleDossierStatut = (dossierStatut: StatutDossier) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admissions/${candidature.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierStatut }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "");
        }
        const { candidature: updated } = await res.json();
        onUpdate(updated);
        toast.success(t("dossierUpdated", { status: t(dossierConfig.labelKey) }));
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t("updateError"));
      }
    });
  };

  const handleAddDocument = (type: string, url: string, nom: string) => {
    startTransition(async () => {
      try {
        const newDoc: DocumentInscription = {
          type,
          url,
          nom,
          ajouteLe: new Date().toISOString(),
        };
        const updatedDocs = [...docs, newDoc];
        const res = await fetch(`/api/admissions/${candidature.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentsInscription: updatedDocs,
            dossierStatut: dossierStatut === "INCOMPLET" ? "EN_COURS" : dossierStatut,
          }),
        });
        if (!res.ok) throw new Error();
        const { candidature: updated } = await res.json();
        onUpdate(updated);
        toast.success(t("documentAdded"));
      } catch {
        toast.error(t("updateError"));
      }
    });
  };

  const handleRemoveDocument = (idx: number) => {
    startTransition(async () => {
      try {
        const updatedDocs = docs.filter((_, i) => i !== idx);
        const res = await fetch(`/api/admissions/${candidature.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentsInscription: updatedDocs }),
        });
        if (!res.ok) throw new Error();
        const { candidature: updated } = await res.json();
        onUpdate(updated);
        toast.success(t("documentRemoved"));
      } catch {
        toast.error(t("updateError"));
      }
    });
  };

  // Vérifier quels documents sont fournis
  const docsByType = new Set(docs.map((d) => d.type));
  const allDocsProvided = TYPES_DOCUMENTS.every((td) => docsByType.has(td.key));
  const piecesObligatoiresPresentes = PIECES_OBLIGATOIRES.every((p) => docsByType.has(p));

  // Actions disponibles selon le statut (workflow candidature)
  const actions: { label: string; statut: StatutCandidature; variant?: string; directionOnly?: boolean; disabled?: boolean; onClick?: () => void }[] = [];
  if (candidature.statut === "SOUMISE") {
    // Marquer dossier complet (si pièces obligatoires présentes)
    actions.push({
      label: piecesObligatoiresPresentes ? t("markDossierComplete") : t("summonExamMissingDocs"),
      statut: "EN_EXAMEN",
      disabled: !piecesObligatoiresPresentes,
    });
    actions.push({ label: t("reject"), statut: "REFUSE", variant: "destructive" });
  }
  if (candidature.statut === "DOSSIER_COMPLET") {
    actions.push({
      label: piecesObligatoiresPresentes ? t("summonExam") : t("summonExamMissingDocs"),
      statut: "EN_EXAMEN",
      disabled: !piecesObligatoiresPresentes,
    });
    actions.push({ label: t("reject"), statut: "REFUSE", variant: "destructive" });
  }
  if (candidature.statut === "EN_EXAMEN") {
    actions.push({
      label: t("admit"),
      statut: "ADMIS",
      onClick: () => setShowAdmitModal(true),
    });
    actions.push({ label: t("reject"), statut: "REFUSE", variant: "destructive" });
  }
  if (candidature.statut === "ADMIS") {
    // La finalisation (INSCRIT) est réservée à la direction + comptable
    // Gate : facture payée
    let enrollLabel = t("confirmEnrollment");
    let enrollDisabled = false;
    if (!facture) {
      enrollLabel = t("confirmEnrollmentNoInvoice");
      enrollDisabled = true;
    } else if (!facturePayee) {
      enrollLabel = t("confirmEnrollmentUnpaid");
      enrollDisabled = true;
    }
    actions.push({
      label: enrollLabel,
      statut: "INSCRIT",
      directionOnly: true,
      disabled: enrollDisabled,
    });
  }

  const handleActionClick = (action: typeof actions[0]) => {
    if (action.onClick) {
      action.onClick();
    } else {
      handleStatut(action.statut);
    }
  };

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 dark:text-white">
                {candidature.prenom} {candidature.nom}
              </p>
              <p className="text-xs text-gray-500">
                {candidature.classeVoulue} · {candidature.annee}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge className={cn("text-xs gap-1", config.color)}>
              {config.icon} {t(config.labelKey)}
            </Badge>
            <Badge className={cn("text-xs gap-1", dossierConfig.color)}>
              {dossierConfig.icon} {t(dossierConfig.labelKey)}
            </Badge>
          </div>
        </div>

        {/* Infos parent */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {candidature.parentPhone}
          </span>
          {candidature.parentEmail && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {candidature.parentEmail}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(candidature.createdAt)}
          </span>
          {candidature.noteExamen !== null && (
            <span className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
              <Star className="w-3 h-3 text-yellow-500" />
              {candidature.noteExamen}/20
            </span>
          )}
        </div>

        {/* Motif refus */}
        {candidature.statut === "REFUSE" && candidature.motifRefus && (
          <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400">
              {t("motif", { reason: candidature.motifRefus })}
            </p>
          </div>
        )}

        {/* Commentaire */}
        {candidature.commentaire && (
          <p className="mt-2 text-xs text-gray-500 italic">{candidature.commentaire}</p>
        )}

        {/* ── Facture liée (affichée à partir de ADMIS) ── */}
        {facture && (candidature.statut === "ADMIS" || candidature.statut === "INSCRIT") && (
          <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  {facture.numero}
                </span>
              </div>
              <Badge className={cn(
                "text-xs",
                facture.statut === "PAYEE" ? "badge-vif-emerald" :
                facture.statut === "EN_RETARD" ? "badge-vif-rose" :
                "badge-vif-amber"
              )}>
                {facture.statut === "PAYEE" ? t("invoicePaid") :
                 facture.statut === "EN_RETARD" ? t("invoiceOverdue") :
                 t("invoicePending")}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{t("invoiceTotal")}</span>
              <span className="font-semibold">{facture.montant.toLocaleString()} {facture.devise}</span>
            </div>
            {totalPaye > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{t("alreadyPaid")}</span>
                <span className="font-semibold text-emerald-600">{totalPaye.toLocaleString()} {facture.devise}</span>
              </div>
            )}
            {restant > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{t("remaining")}</span>
                <span className="font-semibold text-rose-600">{restant.toLocaleString()} {facture.devise}</span>
              </div>
            )}
            {/* Barre de progression */}
            {facture.montant > 0 && (
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(totalPaye / facture.montant) * 100}%` }}
                />
              </div>
            )}
            {/* Bouton encaisser si non soldée */}
            {candidature.statut === "ADMIS" && !facturePayee && (
              <Button
                size="sm"
                className="w-full text-xs h-7 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                disabled={isPending}
                onClick={() => setShowPaiementModal(true)}
              >
                <DollarSign className="w-3 h-3" />
                {t("collectPayment")}
              </Button>
            )}
          </div>
        )}

        {/* ── Dossier d'inscription ── */}
        <button
          onClick={() => setShowDossier(!showDossier)}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {t("dossierTitle")} ({docs.length}/{TYPES_DOCUMENTS.length})
          {showDossier ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showDossier && (
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2">
            {/* Liste des documents requis */}
            {TYPES_DOCUMENTS.map((td) => {
              const doc = docs.find((d) => d.type === td.key);
              const isObligatoire = PIECES_OBLIGATOIRES.includes(td.key);
              return (
                <div key={td.key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {doc ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <XCircle className={cn("w-3.5 h-3.5", isObligatoire ? "text-red-400" : "text-gray-300")} />
                    )}
                    <span className={cn(doc ? "text-gray-700 dark:text-gray-300" : isObligatoire ? "text-gray-400" : "text-gray-300")}>
                      {t(td.labelKey)}
                      {!isObligatoire && <span className="text-gray-400 ml-1">({t("optional")})</span>}
                    </span>
                  </div>
                  {doc && (
                    <div className="flex items-center gap-2">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                        <FileText className="w-3 h-3 inline" /> {doc.nom ?? "Voir"}
                      </a>
                      {!isDirection && dossierStatut !== "VALIDE" && (
                        <button
                          onClick={() => handleRemoveDocument(docs.indexOf(doc))}
                          className="text-red-400 hover:text-red-600"
                          disabled={isPending}
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Upload de documents (comptable et secrétariat, tant que le dossier n'est pas validé) */}
            {dossierStatut !== "VALIDE" && dossierStatut !== "CLOS" && (
              <DocumentUpload onAdd={handleAddDocument} disabled={isPending} />
            )}

            {/* Progression du dossier */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{t("dossierProgression")}</span>
                <span className="font-medium">{docs.length}/{TYPES_DOCUMENTS.length}</span>
              </div>
              <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    allDocsProvided ? "bg-green-500" : "bg-indigo-500"
                  )}
                  style={{ width: `${(docs.length / TYPES_DOCUMENTS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Action: marquer complet (comptable/secrétariat) */}
            {allDocsProvided && dossierStatut === "EN_COURS" && !isDirection && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs h-7 gap-1.5"
                disabled={isPending}
                onClick={() => handleDossierStatut("COMPLETE")}
              >
                <Send className="w-3 h-3" />
                {t("submitToDirector")}
              </Button>
            )}

            {/* Action: valider le dossier (direction uniquement) */}
            {isDirection && dossierStatut === "COMPLETE" && (
              <Button
                size="sm"
                className="w-full text-xs h-7 gap-1.5 bg-green-600 hover:bg-green-700"
                disabled={isPending}
                onClick={() => handleDossierStatut("VALIDE")}
              >
                <ShieldCheck className="w-3 h-3" />
                {t("validateDossier")}
              </Button>
            )}

            {/* Dossier validé par la direction */}
            {dossierStatut === "VALIDE" && candidature.valideLe && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {t("validatedBy", { date: formatDate(candidature.valideLe as string) })}
              </p>
            )}
          </div>
        )}

        {/* Actions candidature */}
        {actions.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {actions
              .filter((a) => !a.directionOnly || isDirection || (a.statut === "INSCRIT" && canInscrire))
              .map((a) => (
                <Button
                  key={a.statut}
                  size="sm"
                  variant={a.variant === "destructive" ? "destructive" : "outline"}
                  className="text-xs h-7"
                  disabled={isPending || a.disabled}
                  onClick={() => handleActionClick(a)}
                >
                  {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : a.label}
                </Button>
              ))}
          </div>
        )}

        {/* Message si l'action est réservée à la direction */}
        {actions.some((a) => a.directionOnly && !isDirection && !(a.statut === "INSCRIT" && canInscrire)) && (
          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {t("directionOnlyAction")}
          </p>
        )}
      </CardContent>

      {/* Modals */}
      {showAdmitModal && (
        <AdmitMoisModal
          candidature={candidature}
          onConfirm={handleAdmit}
          onClose={() => setShowAdmitModal(false)}
        />
      )}
      {showPaiementModal && facture && (
        <PaiementInlineModal
          facture={facture}
          onPaid={onReload}
          onClose={() => setShowPaiementModal(false)}
        />
      )}
    </Card>
  );
}

// ─── Upload de document ───────────────────────────────────────────────────────

function DocumentUpload({
  onAdd,
  disabled,
}: {
  onAdd: (type: string, url: string, nom: string) => void;
  disabled: boolean;
}) {
  const t = useTranslations("admissions");
  const [selectedType, setSelectedType] = useState("");
  const [url, setUrl] = useState("");

  const handleAdd = () => {
    if (!selectedType || !url) return;
    const nom = url.split("/").pop() ?? "Document";
    onAdd(selectedType, url, nom);
    setSelectedType("");
    setUrl("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 pt-2">
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className="text-xs rounded-md border border-input bg-background px-2 py-1.5 h-7"
      >
        <option value="">{t("selectDocType")}</option>
        {TYPES_DOCUMENTS.map((td) => (
          <option key={td.key} value={td.key}>
            {t(td.labelKey)}
          </option>
        ))}
      </select>
      <Input
        type="url"
        placeholder={t("docUrlPlaceholder")}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="text-xs h-7 flex-1"
      />
      <Button
        size="sm"
        variant="outline"
        className="text-xs h-7 gap-1"
        disabled={disabled || !selectedType || !url}
        onClick={handleAdd}
      >
        <Upload className="w-3 h-3" />
        {t("addDocument")}
      </Button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface AdmissionsViewProps {
  candidatures: Candidature[];
  userRole: string;
  classes?: ClasseOption[];
  facturesByCandidature?: Record<string, FactureLiee[]>;
  allSitesSelected?: boolean;
}

export function AdmissionsView({
  candidatures: initial,
  userRole,
  classes = [],
  facturesByCandidature = {},
  allSitesSelected = false,
}: AdmissionsViewProps) {
  const t = useTranslations("admissions");
  const [candidatures, setCandidatures] = useState<Candidature[]>(initial);
  const [search, setSearch] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<StatutCandidature | "TOUS">("TOUS");
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Recharger les données depuis le serveur
  const reload = () => {
    // window.location.reload() est trop agressif ; on incrémente juste la key
    // pour forcer un re-render. Les données sont mises à jour via onUpdate.
    setReloadKey((k) => k + 1);
  };

  const stats = useMemo(() => ({
    total: candidatures.length,
    soumises: candidatures.filter((c) => c.statut === "SOUMISE").length,
    enExamen: candidatures.filter((c) => c.statut === "EN_EXAMEN").length,
    admis: candidatures.filter((c) => c.statut === "ADMIS").length,
    inscrits: candidatures.filter((c) => c.statut === "INSCRIT").length,
    refuses: candidatures.filter((c) => c.statut === "REFUSE").length,
  }), [candidatures]);

  const filtered = useMemo(() => {
    return candidatures.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        `${c.nom} ${c.prenom} ${c.classeVoulue} ${c.parentPhone}`.toLowerCase().includes(q);
      const matchStatut = filtreStatut === "TOUS" || c.statut === filtreStatut;
      return matchSearch && matchStatut;
    });
  }, [candidatures, search, filtreStatut]);

  const handleCreated = (c: Candidature) => setCandidatures((prev) => [c, ...prev]);
  const handleUpdate = (updated: Candidature) =>
    setCandidatures((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  // Pipeline visuel (entonnoir)
  const pipelineStats = [
    { statut: "SOUMISE" as const, count: stats.soumises, icon: <ClipboardList className="w-4 h-4" /> },
    { statut: "EN_EXAMEN" as const, count: stats.enExamen, icon: <Clock className="w-4 h-4" /> },
    { statut: "ADMIS" as const, count: stats.admis, icon: <CheckCircle2 className="w-4 h-4" /> },
    { statut: "INSCRIT" as const, count: stats.inscrits, icon: <UserPlus className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6" key={reloadKey}>
      {showForm && (
        <CandidatureForm classes={classes} onClose={() => setShowForm(false)} onCreated={handleCreated} />
      )}

      {/* Banner d'avertissement si "Tous les sites" sélectionné */}
      {allSitesSelected && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4">
          <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">{t("allSitesWarning")}</p>
            <p className="text-amber-700 dark:text-amber-300 mt-0.5">{t("selectSiteFirst")}</p>
          </div>
        </div>
      )}

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("totalCandidatures", { count: stats.total, s: stats.total > 1 ? "s" : "" })}</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          disabled={allSitesSelected}
          className="gap-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          {t("newCandidature")}
        </Button>
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {pipelineStats.map((p) => {
          const cfg = STATUT_CONFIG[p.statut];
          return (
            <button
              key={p.statut}
              onClick={() => setFiltreStatut(filtreStatut === p.statut ? "TOUS" : p.statut)}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                filtreStatut === p.statut
                  ? "border-primary shadow-sm bg-primary/5"
                  : "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-primary/30"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("p-1.5 rounded-lg", cfg.color.split(" ").slice(0, 2).join(" "))}>
                  {p.icon}
                </span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{p.count}</span>
              </div>
              <p className="text-xs font-medium text-gray-500">{t(cfg.labelKey)}</p>
            </button>
          );
        })}
      </div>

      {/* Refusés & Annulés */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-500">
          <span className="font-medium text-red-500">{stats.refuses}</span> {t("refused", { s: stats.refuses > 1 ? "s" : "" })}
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">
          <span className="font-medium text-gray-400">
            {candidatures.filter((c) => c.statut === "ANNULE").length}
          </span>{" "}
          {t("cancelled", { s: candidatures.filter((c) => c.statut === "ANNULE").length > 1 ? "s" : "" })}
        </span>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t("noCandidatures")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CandidatureCard
              key={c.id}
              candidature={c}
              factures={facturesByCandidature[c.id] ?? []}
              onUpdate={handleUpdate}
              onReload={reload}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  );
}
