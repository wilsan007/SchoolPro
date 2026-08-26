"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, FileText, CheckCircle2, XCircle, Clock,
  UserPlus, BookOpen, Phone, Mail, Calendar, Loader2,
  Upload, FileCheck2, AlertTriangle, FolderOpen, History,
  Image as ImageIcon, Baby, IdCard, ScrollText, Trash2,
  Check, X, Lock, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatutDossier = "INCOMPLET" | "EN_COURS" | "COMPLETE" | "VALIDE" | "CLOS";
type TypeDoc = "PHOTO" | "ACTE_NAISSANCE" | "PIECE_PARENT" | "BULLETIN_SCOLAIRE";
type LienParente = "PERE" | "MERE" | "TUTEUR" | "AUTRE";
type Sexe = "M" | "F";

interface PieceDoc {
  url: string;
  nom: string;
  taille: number;
  mimeType: string;
  ajouteLe: string;
  ajouteParId?: string;
}

interface DossierInscription {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: Date | string;
  lieuNaissance: string | null;
  sexe: Sexe;
  nationalite: string | null;
  classeVoulue: string;
  annee: string;
  parentNom: string;
  parentPrenom: string;
  parentEmail: string | null;
  parentPhone: string;
  parentLien: LienParente;
  dossierStatut: StatutDossier;
  documentsInscription: Partial<Record<TypeDoc, PieceDoc>> | null;
  creePar: { id: string; name: string } | null;
  validePar: { id: string; name: string } | null;
  valideLe: Date | string | null;
  closLe: Date | string | null;
  createdAt: Date | string;
  _count?: { historique: number };
}

interface HistoriqueEntry {
  id: string;
  type: string;
  description: string;
  auteurNom: string | null;
  auteur: { name: string } | null;
  donnees: unknown;
  createdAt: Date | string;
}

// ─── Config statuts dossier ───────────────────────────────────────────────────

const STATUT_DOSSIER_CONFIG: Record<StatutDossier, { labelKey: string; color: string; icon: React.ReactNode }> = {
  INCOMPLET: { labelKey: "statutIncomplet", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900", icon: <AlertTriangle className="w-3 h-3" /> },
  EN_COURS: { labelKey: "statutEnCours", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900", icon: <Clock className="w-3 h-3" /> },
  COMPLETE: { labelKey: "statutComplete", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", icon: <FileCheck2 className="w-3 h-3" /> },
  VALIDE: { labelKey: "statutValide", color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900", icon: <CheckCircle2 className="w-3 h-3" /> },
  CLOS: { labelKey: "statutClos", color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700", icon: <Lock className="w-3 h-3" /> },
};

const TYPES_DOC_CONFIG: Record<TypeDoc, { labelKey: string; icon: React.ReactNode; accept: string }> = {
  PHOTO: { labelKey: "docPhoto", icon: <ImageIcon className="w-4 h-4" />, accept: "image/jpeg,image/png,image/webp,image/gif" },
  ACTE_NAISSANCE: { labelKey: "docActeNaissance", icon: <Baby className="w-4 h-4" />, accept: "image/*,application/pdf" },
  PIECE_PARENT: { labelKey: "docPieceParent", icon: <IdCard className="w-4 h-4" />, accept: "image/*,application/pdf" },
  BULLETIN_SCOLAIRE: { labelKey: "docBulletin", icon: <ScrollText className="w-4 h-4" />, accept: "image/*,application/pdf" },
};

const TYPES_DOC_LIST: TypeDoc[] = ["PHOTO", "ACTE_NAISSANCE", "PIECE_PARENT", "BULLETIN_SCOLAIRE"];

// ─── Formulaire nouvelle inscription ──────────────────────────────────────────

function NouvelleInscriptionForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (d: DossierInscription) => void;
}) {
  const t = useTranslations("inscriptions");
  const anneeActuelle = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [form, setForm] = useState({
    nom: "", prenom: "", dateNaissance: "", lieuNaissance: "", sexe: "M" as Sexe,
    classeVoulue: "", annee: anneeActuelle,
    parentNom: "", parentPrenom: "", parentEmail: "", parentPhone: "",
    parentLien: "PERE" as LienParente,
  });
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/inscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Erreur");
        }
        const { dossier } = await res.json();
        toast.success(t("dossierCree"));
        onCreated(dossier);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("erreurSauvegarde"));
      }
    });
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col border-0 shadow-2xl rounded-[22px]">
        <CardHeader className="pb-4 flex-shrink-0 flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-5 h-5 text-primary" />
            {t("nouvelleInscription")}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Informations élève */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {t("infosEleve")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("nom")}</label>
                  <Input value={form.nom} onChange={(e) => set("nom", e.target.value)} required placeholder="DIALLO" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("prenom")}</label>
                  <Input value={form.prenom} onChange={(e) => set("prenom", e.target.value)} required placeholder="Amadou" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("dateNaissance")}</label>
                  <Input type="date" value={form.dateNaissance} onChange={(e) => set("dateNaissance", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("lieuNaissance")}</label>
                  <Input value={form.lieuNaissance} onChange={(e) => set("lieuNaissance", e.target.value)} placeholder="Dakar" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("sexe")}</label>
                  <select value={form.sexe} onChange={(e) => set("sexe", e.target.value)} className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-input">
                    <option value="M">{t("masculin")}</option>
                    <option value="F">{t("feminin")}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("classeVoulue")}</label>
                  <Input value={form.classeVoulue} onChange={(e) => set("classeVoulue", e.target.value)} required placeholder="6ème, Terminale S…" className="text-sm" />
                </div>
              </div>
            </div>

            {/* Informations parent */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {t("infosParent")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("nom")}</label>
                  <Input value={form.parentNom} onChange={(e) => set("parentNom", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("prenom")}</label>
                  <Input value={form.parentPrenom} onChange={(e) => set("parentPrenom", e.target.value)} required className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("email")}</label>
                  <Input type="email" value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder={t("emailOptionnel")} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("telephone")}</label>
                  <Input value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} required placeholder="+221 77 000 00 00" className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("lienParente")}</label>
                  <select value={form.parentLien} onChange={(e) => set("parentLien", e.target.value)} className="w-full rounded-xl border border-input px-3 py-2 text-sm bg-input">
                    <option value="PERE">{t("pere")}</option>
                    <option value="MERE">{t("mere")}</option>
                    <option value="TUTEUR">{t("tuteur")}</option>
                    <option value="AUTRE">{t("autre")}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button type="submit" disabled={isPending} className="flex-1 gap-2 w-full sm:w-auto">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {t("creerDossier")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("annuler")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Zone d'upload d'une pièce ────────────────────────────────────────────────

function ZoneUploadPiece({
  type,
  piece,
  candidatureId,
  onUploaded,
  onRemoved,
}: {
  type: TypeDoc;
  piece: PieceDoc | undefined;
  candidatureId: string;
  onUploaded: (type: TypeDoc, piece: PieceDoc) => void;
  onRemoved: (type: TypeDoc) => void;
}) {
  const t = useTranslations("inscriptions");
  const [isUploading, setIsUploading] = useState(false);
  const cfg = TYPES_DOC_CONFIG[type];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      fd.append("candidatureId", candidatureId);
      const res = await fetch("/api/inscriptions/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Upload échoué");
      }
      const data = await res.json();
      // Enregistrer la pièce sur le dossier
      const patchRes = await fetch(`/api/inscriptions/${candidatureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ajouterDocument: { type, piece: { url: data.url, nom: data.nom, taille: data.taille, mimeType: data.mimeType } },
        }),
      });
      if (!patchRes.ok) throw new Error("Enregistrement échoué");
      const { dossier } = await patchRes.json();
      const newPiece = (dossier.documentsInscription as Record<TypeDoc, PieceDoc> | null)?.[type];
      if (newPiece) onUploaded(type, newPiece);
      toast.success(t("pieceAjoutee", { type: t(cfg.labelKey) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("erreurUpload"));
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      const res = await fetch(`/api/inscriptions/${candidatureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retirerDocument: type }),
      });
      if (!res.ok) throw new Error();
      onRemoved(type);
      toast.success(t("pieceRetiree", { type: t(cfg.labelKey) }));
    } catch {
      toast.error(t("erreurSuppression"));
    }
  };

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all",
      piece
        ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
        : "border-dashed border-border hover:border-primary/40 bg-muted/30"
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "p-1.5 rounded-lg flex-shrink-0",
            piece ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-muted text-muted-foreground"
          )}>
            {cfg.icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{t(cfg.labelKey)}</p>
            {piece ? (
              <p className="text-[11px] text-muted-foreground truncate">{piece.nom}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("nonFourni")}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {piece ? (
            <>
              <a href={piece.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Eye className="w-3.5 h-3.5" />
              </a>
              <button onClick={handleRemove} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors dark:hover:bg-red-950/40">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <label className={cn(
              "cursor-pointer p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors",
              isUploading && "pointer-events-none opacity-50"
            )}>
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <input type="file" accept={cfg.accept} onChange={handleUpload} className="hidden" />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline historique ──────────────────────────────────────────────────────

function HistoriqueTimeline({ entries }: { entries: HistoriqueEntry[] }) {
  const t = useTranslations("inscriptions");

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{t("aucunHistorique")}</p>
      </div>
    );
  }

  const iconForType = (type: string): React.ReactNode => {
    switch (type) {
      case "CREATION_DOSSIER": return <FolderOpen className="w-3.5 h-3.5" />;
      case "AJOUT_DOCUMENT": return <Upload className="w-3.5 h-3.5" />;
      case "SUPPRESSION_DOCUMENT": return <Trash2 className="w-3.5 h-3.5" />;
      case "COMPLETION_DOSSIER": return <FileCheck2 className="w-3.5 h-3.5" />;
      case "VALIDATION_DOSSIER": return <CheckCircle2 className="w-3.5 h-3.5" />;
      case "CLOTURE_DOSSIER": return <Lock className="w-3.5 h-3.5" />;
      case "CHANGEMENT_STATUT": return <Clock className="w-3.5 h-3.5" />;
      case "MODIFICATION_INFOS": return <FileText className="w-3.5 h-3.5" />;
      case "NOTE_AJOUTEE": return <FileText className="w-3.5 h-3.5" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="p-1.5 rounded-lg bg-muted text-muted-foreground">
              {iconForType(entry.type)}
            </span>
            {i < entries.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
          </div>
          <div className="flex-1 pb-3">
            <p className="text-xs font-medium">{entry.description}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {entry.auteurNom ?? entry.auteur?.name ?? t("systeme")} · {formatDate(entry.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modal détail dossier (avec historique à côté) ────────────────────────────

function DossierDetailModal({
  dossier: initial,
  onClose,
  onUpdate,
}: {
  dossier: DossierInscription;
  onClose: () => void;
  onUpdate: (d: DossierInscription) => void;
}) {
  const t = useTranslations("inscriptions");
  const [dossier, setDossier] = useState<DossierInscription>(initial);
  const [historique, setHistorique] = useState<HistoriqueEntry[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const cfg = STATUT_DOSSIER_CONFIG[dossier.dossierStatut];
  const docs = dossier.documentsInscription ?? {};

  // Charger l'historique complet au montage du modal
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/inscriptions/${dossier.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.dossier?.historique) setHistorique(data.dossier.historique);
      })
      .finally(() => { if (!cancelled) setLoadingHist(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.id]);

  const handlePieceUploaded = (type: TypeDoc, piece: PieceDoc) => {
    const newDocs = { ...docs, [type]: piece };
    setDossier({ ...dossier, documentsInscription: newDocs });
    // Recharger pour récupérer le statut recalculé + historique
    fetch(`/api/inscriptions/${dossier.id}`).then((r) => r.json()).then((data) => {
      if (data.dossier) {
        setDossier(data.dossier);
        setHistorique(data.dossier.historique ?? []);
        onUpdate(data.dossier);
      }
    });
  };

  const handlePieceRemoved = (type: TypeDoc) => {
    const newDocs = { ...docs };
    delete newDocs[type];
    setDossier({ ...dossier, documentsInscription: newDocs });
    fetch(`/api/inscriptions/${dossier.id}`).then((r) => r.json()).then((data) => {
      if (data.dossier) {
        setDossier(data.dossier);
        setHistorique(data.dossier.historique ?? []);
        onUpdate(data.dossier);
      }
    });
  };

  const changerStatut = (statut: StatutDossier) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/inscriptions/${dossier.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossierStatut: statut }),
        });
        if (!res.ok) throw new Error();
        const { dossier: updated } = await res.json();
        setDossier(updated);
        setHistorique(updated.historique ?? []);
        onUpdate(updated);
        toast.success(t("statutModifie"));
      } catch {
        toast.error(t("erreurStatut"));
      }
    });
  };

  const ajouterNote = () => {
    if (!note.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/inscriptions/${dossier.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() }),
        });
        if (!res.ok) throw new Error();
        const { dossier: updated } = await res.json();
        setHistorique(updated.historique ?? []);
        setNote("");
        toast.success(t("noteAjoutee"));
      } catch {
        toast.error(t("erreurNote"));
      }
    });
  };

  const piecesManquantes = TYPES_DOC_LIST.filter((t) => !docs[t]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-card rounded-[22px] border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-primary/10 text-primary">
              <FolderOpen className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{dossier.prenom} {dossier.nom}</h2>
              <p className="text-xs text-muted-foreground">{dossier.classeVoulue} · {dossier.annee}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs gap-1", cfg.color)}>{cfg.icon} {t(cfg.labelKey)}</Badge>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Corps : 2 colonnes (dossier | historique) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[1fr_360px] divide-y lg:divide-y-0 lg:divide-x divide-border">
          {/* Colonne gauche : dossier + pièces */}
          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Infos élève + parent */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="rounded-xl">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("infosEleve")}</h3>
                  <div className="space-y-1.5 text-sm">
                    <p><span className="text-muted-foreground">{t("nom")}:</span> {dossier.nom} {dossier.prenom}</p>
                    <p><span className="text-muted-foreground">{t("dateNaissance")}:</span> {formatDate(dossier.dateNaissance)}</p>
                    {dossier.lieuNaissance && <p><span className="text-muted-foreground">{t("lieuNaissance")}:</span> {dossier.lieuNaissance}</p>}
                    <p><span className="text-muted-foreground">{t("sexe")}:</span> {dossier.sexe === "M" ? t("masculin") : t("feminin")}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("infosParent")}</h3>
                  <div className="space-y-1.5 text-sm">
                    <p><span className="text-muted-foreground">{t("nom")}:</span> {dossier.parentPrenom} {dossier.parentNom}</p>
                    <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground" /> {dossier.parentPhone}</p>
                    {dossier.parentEmail && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-muted-foreground" /> {dossier.parentEmail}</p>}
                    <p><span className="text-muted-foreground">{t("lienParente")}:</span> {t(dossier.parentLien.toLowerCase())}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pièces d'inscription */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-primary" />
                  {t("piecesInscription")}
                </h3>
                {piecesManquantes.length > 0 ? (
                  <Badge variant="outline" className="text-xs gap-1 text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                    <AlertTriangle className="w-3 h-3" />
                    {t("piecesManquantes", { count: piecesManquantes.length })}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-200 bg-green-50 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900">
                    <Check className="w-3 h-3" /> {t("toutesPiecesFournies")}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TYPES_DOC_LIST.map((type) => (
                  <ZoneUploadPiece
                    key={type}
                    type={type}
                    piece={docs[type]}
                    candidatureId={dossier.id}
                    onUploaded={handlePieceUploaded}
                    onRemoved={handlePieceRemoved}
                  />
                ))}
              </div>
            </div>

            {/* Traçabilité */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-muted/50 p-3 space-y-1">
                <p className="text-muted-foreground font-medium">{t("creePar")}</p>
                <p>{dossier.creePar?.name ?? t("inconnu")}</p>
                <p className="text-muted-foreground">{formatDate(dossier.createdAt)}</p>
              </div>
              {dossier.validePar && (
                <div className="rounded-xl bg-green-50/50 dark:bg-green-950/20 p-3 space-y-1">
                  <p className="text-green-700 dark:text-green-300 font-medium">{t("validePar")}</p>
                  <p>{dossier.validePar.name}</p>
                  {dossier.valideLe && <p className="text-muted-foreground">{formatDate(dossier.valideLe)}</p>}
                </div>
              )}
            </div>

            {/* Actions statut */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("actionsDossier")}</h3>
              <div className="flex flex-wrap gap-2">
                {dossier.dossierStatut === "COMPLETE" && (
                  <Button size="sm" onClick={() => changerStatut("VALIDE")} disabled={isPending} className="gap-2 bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="w-4 h-4" /> {t("validerDossier")}
                  </Button>
                )}
                {dossier.dossierStatut === "VALIDE" && (
                  <Button size="sm" onClick={() => changerStatut("CLOS")} disabled={isPending} className="gap-2">
                    <Lock className="w-4 h-4" /> {t("cloturerDossier")}
                  </Button>
                )}
                {(dossier.dossierStatut === "CLOS" || dossier.dossierStatut === "VALIDE") && (
                  <Button size="sm" variant="outline" onClick={() => changerStatut("EN_COURS")} disabled={isPending} className="gap-2">
                    <FolderOpen className="w-4 h-4" /> {t("rouvrirDossier")}
                  </Button>
                )}
                {dossier.dossierStatut === "INCOMPLET" && (
                  <Button size="sm" variant="outline" onClick={() => changerStatut("EN_COURS")} disabled={isPending} className="gap-2">
                    <Clock className="w-4 h-4" /> {t("marquerEnCours")}
                  </Button>
                )}
              </div>
            </div>

            {/* Note interne */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("noteInterne")}</h3>
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className="text-sm" />
                <Button size="sm" onClick={ajouterNote} disabled={isPending || !note.trim()} className="gap-2 flex-shrink-0">
                  {t("ajouter")}
                </Button>
              </div>
            </div>
          </div>

          {/* Colonne droite : historique */}
          <div className="p-6 bg-muted/20 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">{t("historiqueDossier")}</h3>
            </div>
            {loadingHist ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <HistoriqueTimeline entries={historique} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Carte dossier (liste) ────────────────────────────────────────────────────

function DossierCard({
  dossier,
  onOpen,
}: {
  dossier: DossierInscription;
  onOpen: (d: DossierInscription) => void;
}) {
  const t = useTranslations("inscriptions");
  const cfg = STATUT_DOSSIER_CONFIG[dossier.dossierStatut];
  const docs = dossier.documentsInscription ?? {};
  const piecesFournies = TYPES_DOC_LIST.filter((t) => docs[t]).length;

  return (
    <Card
      className="rounded-[18px] border border-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
      onClick={() => onOpen(dossier)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">{dossier.prenom} {dossier.nom}</p>
              <p className="text-xs text-muted-foreground">{dossier.classeVoulue} · {dossier.annee}</p>
            </div>
          </div>
          <Badge className={cn("text-xs gap-1 flex-shrink-0", cfg.color)}>{cfg.icon} {t(cfg.labelKey)}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {dossier.parentPhone}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(dossier.createdAt)}</span>
        </div>

        {/* Indicateur pièces */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", piecesFournies === 4 ? "bg-green-500" : "bg-amber-500")}
              style={{ width: `${(piecesFournies / 4) * 100}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{piecesFournies}/4</span>
        </div>

        {dossier.creePar && (
          <p className="mt-2 text-[11px] text-muted-foreground">{t("creePar")} {dossier.creePar.name}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface InscriptionsViewProps {
  dossiers: DossierInscription[];
}

export function InscriptionsView({ dossiers: initial }: InscriptionsViewProps) {
  const t = useTranslations("inscriptions");
  const [dossiers, setDossiers] = useState<DossierInscription[]>(initial);
  const [search, setSearch] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<StatutDossier | "TOUS">("TOUS");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<DossierInscription | null>(null);

  const stats = useMemo(() => ({
    total: dossiers.length,
    incomplets: dossiers.filter((d) => d.dossierStatut === "INCOMPLET").length,
    enCours: dossiers.filter((d) => d.dossierStatut === "EN_COURS").length,
    completes: dossiers.filter((d) => d.dossierStatut === "COMPLETE").length,
    valides: dossiers.filter((d) => d.dossierStatut === "VALIDE").length,
    clos: dossiers.filter((d) => d.dossierStatut === "CLOS").length,
  }), [dossiers]);

  const filtered = useMemo(() => {
    return dossiers.filter((d) => {
      const q = search.toLowerCase();
      const matchSearch = !q || `${d.nom} ${d.prenom} ${d.classeVoulue} ${d.parentPhone}`.toLowerCase().includes(q);
      const matchStatut = filtreStatut === "TOUS" || d.dossierStatut === filtreStatut;
      return matchSearch && matchStatut;
    });
  }, [dossiers, search, filtreStatut]);

  const handleCreated = (d: DossierInscription) => setDossiers((prev) => [d, ...prev]);
  const handleUpdate = (updated: DossierInscription) =>
    setDossiers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));

  const pipelineStats: { statut: StatutDossier; count: number }[] = [
    { statut: "INCOMPLET", count: stats.incomplets },
    { statut: "EN_COURS", count: stats.enCours },
    { statut: "COMPLETE", count: stats.completes },
    { statut: "VALIDE", count: stats.valides },
    { statut: "CLOS", count: stats.clos },
  ];

  return (
    <div className="space-y-6">
      {showForm && (
        <NouvelleInscriptionForm onClose={() => setShowForm(false)} onCreated={handleCreated} />
      )}
      {selected && (
        <DossierDetailModal dossier={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />
      )}

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">{t("titre")}</h2>
          <p className="text-sm text-muted-foreground">{t("totalDossiers", { count: stats.total })}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          {t("nouvelleInscription")}
        </Button>
      </div>

      {/* Pipeline indicateurs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {pipelineStats.map((p) => {
          const cfg = STATUT_DOSSIER_CONFIG[p.statut];
          return (
            <button
              key={p.statut}
              onClick={() => setFiltreStatut(filtreStatut === p.statut ? "TOUS" : p.statut)}
              className={cn(
                "p-4 rounded-[18px] border text-left transition-all duration-200",
                filtreStatut === p.statut
                  ? "border-primary shadow-sm bg-primary/5"
                  : "border-border bg-card hover:border-primary/30 hover:-translate-y-0.5"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("p-1.5 rounded-lg", cfg.color.split(" ").slice(0, 2).join(" "))}>
                  {cfg.icon}
                </span>
                <span className="text-2xl font-bold tabular-nums">{p.count}</span>
              </div>
              <p className="text-xs font-medium text-muted-foreground">{t(cfg.labelKey)}</p>
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("rechercher")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card className="rounded-[22px] border border-border">
          <CardContent className="py-16 text-center">
            <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("aucunDossier")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <DossierCard key={d.id} dossier={d} onOpen={setSelected} />
          ))}
        </div>
      )}
    </div>
  );
}
