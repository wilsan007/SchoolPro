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
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatutCandidature = "SOUMISE" | "EN_EXAMEN" | "ADMIS" | "REFUSE" | "INSCRIT" | "ANNULE";
type LienParente = "PERE" | "MERE" | "TUTEUR" | "AUTRE";
type Sexe = "M" | "F";

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
}

// ─── Config statuts ───────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<StatutCandidature, { labelKey: string; color: string; icon: React.ReactNode }> = {
  SOUMISE: { labelKey: "statusSubmitted", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <ClipboardList className="w-3 h-3" /> },
  EN_EXAMEN: { labelKey: "statusExam", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <Clock className="w-3 h-3" /> },
  ADMIS: { labelKey: "statusAdmitted", color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  REFUSE: { labelKey: "statusRefused", color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle className="w-3 h-3" /> },
  INSCRIT: { labelKey: "statusEnrolled", color: "bg-purple-50 text-purple-700 border-purple-200", icon: <UserPlus className="w-3 h-3" /> },
  ANNULE: { labelKey: "statusCancelled", color: "bg-gray-100 text-gray-500 border-gray-200", icon: <XCircle className="w-3 h-3" /> },
};

const WORKFLOW: StatutCandidature[] = ["SOUMISE", "EN_EXAMEN", "ADMIS", "INSCRIT"];

// ─── Formulaire de candidature ────────────────────────────────────────────────

function CandidatureForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Candidature) => void;
}) {
  const t = useTranslations("admissions");
  const anneeActuelle = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [form, setForm] = useState({
    nom: "", prenom: "", dateNaissance: "", sexe: "M" as Sexe,
    classeVoulue: "", annee: anneeActuelle,
    parentNom: "", parentPrenom: "", parentEmail: "", parentPhone: "",
    parentLien: "PERE" as LienParente,
  });
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await fetch("/api/admissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error();
        const { candidature } = await res.json();
        toast.success(t("candidatureSaved"));
        onCreated(candidature);
        onClose();
      } catch {
        toast.error(t("saveError"));
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">{t("desiredClass")}</label>
                  <Input value={form.classeVoulue} onChange={(e) => set("classeVoulue", e.target.value)} required placeholder="6ème, Terminale S…" className="text-sm" />
                </div>
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
              <div className="grid grid-cols-2 gap-3">
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

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isPending} className="flex-1 gap-2">
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
  onUpdate,
}: {
  candidature: Candidature;
  onUpdate: (updated: Candidature) => void;
}) {
  const t = useTranslations("admissions");
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const config = STATUT_CONFIG[candidature.statut];

  const handleStatut = (statut: StatutCandidature) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admissions/${candidature.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        if (!res.ok) throw new Error();
        const { candidature: updated } = await res.json();
        onUpdate(updated);
        toast.success(t("statusUpdated", { status: t(STATUT_CONFIG[statut].labelKey) }));
      } catch {
        toast.error(t("updateError"));
      }
    });
  };

  // Actions disponibles selon le statut
  const actions: { label: string; statut: StatutCandidature; variant?: string }[] = [];
  if (candidature.statut === "SOUMISE") {
    actions.push({ label: t("summonExam"), statut: "EN_EXAMEN" });
    actions.push({ label: t("reject"), statut: "REFUSE", variant: "destructive" });
  }
  if (candidature.statut === "EN_EXAMEN") {
    actions.push({ label: t("admit"), statut: "ADMIS" });
    actions.push({ label: t("reject"), statut: "REFUSE", variant: "destructive" });
  }
  if (candidature.statut === "ADMIS") {
    actions.push({ label: t("confirmEnrollment"), statut: "INSCRIT" });
  }

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
          <Badge className={cn("text-xs gap-1 flex-shrink-0", config.color)}>
            {config.icon} {t(config.labelKey)}
          </Badge>
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

        {/* Actions */}
        {actions.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {actions.map((a) => (
              <Button
                key={a.statut}
                size="sm"
                variant={a.variant === "destructive" ? "destructive" : "outline"}
                className="text-xs h-7"
                disabled={isPending}
                onClick={() => handleStatut(a.statut)}
              >
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : a.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface AdmissionsViewProps {
  candidatures: Candidature[];
}

export function AdmissionsView({ candidatures: initial }: AdmissionsViewProps) {
  const t = useTranslations("admissions");
  const [candidatures, setCandidatures] = useState<Candidature[]>(initial);
  const [search, setSearch] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<StatutCandidature | "TOUS">("TOUS");
  const [showForm, setShowForm] = useState(false);

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
    <div className="space-y-6">
      {showForm && (
        <CandidatureForm onClose={() => setShowForm(false)} onCreated={handleCreated} />
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("totalCandidatures", { count: stats.total, s: stats.total > 1 ? "s" : "" })}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t("newCandidature")}
        </Button>
      </div>

      {/* Pipeline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CandidatureCard key={c.id} candidature={c} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
