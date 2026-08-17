"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Plus, Play, FileText, Link as LinkIcon, AlignLeft,
  HelpCircle, ChevronRight, Eye, Trash2, Users, Clock,
  GraduationCap, Layers, Search, X, Loader2, Star, ArrowLeft,
  CheckCircle2, Video, Upload, Globe, BookMarked,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { SiteColor } from "@/lib/site-colors";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Niveau = "DEBUTANT" | "INTERMEDIAIRE" | "AVANCE";
type StatutCours = "BROUILLON" | "PUBLIE" | "ARCHIVE";
type TypeContenu = "VIDEO" | "DOCUMENT" | "LIEN" | "TEXTE" | "QUIZ";

interface ContenuCours {
  id: string;
  titre: string;
  type: TypeContenu;
  ordre: number;
  url: string | null;
  texte: string | null;
  dureeMin: number | null;
  isGratuit: boolean;
  createdAt: string | Date;
}

interface Cours {
  id: string;
  titre: string;
  description: string | null;
  niveau: Niveau;
  statut: StatutCours;
  matiereNom: string | null;
  classeNom: string | null;
  auteurNom: string | null;
  imageUrl: string | null;
  dureeMin: number | null;
  nbVues: number;
  nbInscrits: number;
  siteId?: string | null;
  siteNom?: string | null;
  createdAt: string | Date;
  _count?: { contenus: number; progressions: number };
  contenus?: ContenuCours[];
}

// ─── Config ────────────────────────────────────────────────────────────────────

const NIVEAU_CONFIG: Record<Niveau, { labelKey: string; color: string }> = {
  DEBUTANT:       { labelKey: "beginner",      color: "bg-green-50 text-green-700 border-green-200" },
  INTERMEDIAIRE:  { labelKey: "intermediate", color: "bg-blue-50 text-blue-700 border-blue-200" },
  AVANCE:         { labelKey: "advanced",      color: "bg-purple-50 text-purple-700 border-purple-200" },
};

const STATUT_CONFIG: Record<StatutCours, { labelKey: string; color: string }> = {
  BROUILLON: { labelKey: "statusDraft",     color: "bg-gray-100 text-gray-600" },
  PUBLIE:    { labelKey: "statusPublished", color: "bg-green-100 text-green-700" },
  ARCHIVE:   { labelKey: "statusArchived",  color: "bg-orange-100 text-orange-700" },
};

const TYPE_CONTENU_CONFIG: Record<TypeContenu, { labelKey: string; icon: React.ReactNode; color: string }> = {
  VIDEO:    { labelKey: "typeVideo",    icon: <Video className="w-4 h-4" />,       color: "text-red-500" },
  DOCUMENT: { labelKey: "typeDocument", icon: <FileText className="w-4 h-4" />,    color: "text-blue-500" },
  LIEN:     { labelKey: "typeLink",     icon: <Globe className="w-4 h-4" />,       color: "text-cyan-500" },
  TEXTE:    { labelKey: "typeText",     icon: <AlignLeft className="w-4 h-4" />,   color: "text-gray-600" },
  QUIZ:     { labelKey: "typeQuiz",     icon: <HelpCircle className="w-4 h-4" />,  color: "text-purple-500" },
};

// ─── Modal Création Cours ───────────────────────────────────────────────────────

function CreerCoursModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (c: Cours) => void;
}) {
  const t = useTranslations("cours");
  const [form, setForm] = useState({
    titre: "", description: "",
    niveau: "INTERMEDIAIRE" as Niveau,
    matiereNom: "", classeNom: "",
    dureeMin: "",
    statut: "BROUILLON" as StatutCours,
  });
  const [isPending, startTransition] = useTransition();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/cours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            dureeMin: form.dureeMin ? parseInt(form.dureeMin) : undefined,
          }),
        });
        if (!res.ok) throw new Error();
        const { cours } = await res.json();
        toast.success(t("courseCreated"));
        onCreate(cours);
        onClose();
      } catch {
        toast.error(t("createError"));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg border-0 shadow-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-5 h-5 text-primary" /> {t("newCourse")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t("courseTitle")}</label>
            <Input value={form.titre} onChange={e => set("titre", e.target.value)}
              placeholder="Ex : Introduction aux mathématiques" className="text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t("description")}</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Objectifs, contenu du cours…"
              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{t("level")}</label>
              <select value={form.niveau} onChange={e => set("niveau", e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background">
                <option value="DEBUTANT">{t("beginner")}</option>
                <option value="INTERMEDIAIRE">{t("intermediate")}</option>
                <option value="AVANCE">{t("advanced")}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{t("estimatedDuration")}</label>
              <Input type="number" value={form.dureeMin} onChange={e => set("dureeMin", e.target.value)}
                placeholder="60" className="text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{t("subject")}</label>
              <Input value={form.matiereNom} onChange={e => set("matiereNom", e.target.value)}
                placeholder="Mathématiques" className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{t("targetClass")}</label>
              <Input value={form.classeNom} onChange={e => set("classeNom", e.target.value)}
                placeholder="Terminale S" className="text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t("status")}</label>
            <div className="flex gap-2">
              {(["BROUILLON", "PUBLIE"] as StatutCours[]).map(s => (
                <button key={s} onClick={() => set("statut", s)}
                  className={cn("flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
                    form.statut === s ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-500"
                  )}>
                  {t(STATUT_CONFIG[s].labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending || !form.titre} className="flex-1 gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t("createCourse")}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Modal Ajout Contenu ────────────────────────────────────────────────────────

function AjouterContenuModal({ coursId, ordre, onClose, onAdded }: {
  coursId: string;
  ordre: number;
  onClose: () => void;
  onAdded: (c: ContenuCours) => void;
}) {
  const t = useTranslations("cours");
  const [form, setForm] = useState({
    titre: "", type: "TEXTE" as TypeContenu,
    url: "", texte: "", dureeMin: "",
  });
  const [isPending, startTransition] = useTransition();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cours/${coursId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_contenu",
            titre: form.titre,
            type: form.type,
            url: form.url || undefined,
            texte: form.texte || undefined,
            dureeMin: form.dureeMin ? parseInt(form.dureeMin) : undefined,
            ordre,
          }),
        });
        if (!res.ok) throw new Error();
        const { contenu } = await res.json();
        toast.success(t("contentAdded"));
        onAdded(contenu);
        onClose();
      } catch {
        toast.error(t("addError"));
      }
    });
  };

  const needsUrl = ["VIDEO", "DOCUMENT", "LIEN"].includes(form.type);
  const needsTexte = ["TEXTE", "QUIZ"].includes(form.type);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg border-0 shadow-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="w-5 h-5 text-primary" /> {t("addContent")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t("contentTitle")}</label>
            <Input value={form.titre} onChange={e => set("titre", e.target.value)}
              placeholder="Ex : Chapitre 1 — Introduction" className="text-sm" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">{t("contentType")}</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {(Object.keys(TYPE_CONTENU_CONFIG) as TypeContenu[]).map(tc => (
                <button key={tc} onClick={() => set("type", tc)}
                  className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all",
                    form.type === tc ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-500"
                  )}>
                  <span className={form.type === tc ? "text-primary" : TYPE_CONTENU_CONFIG[tc].color}>
                    {TYPE_CONTENU_CONFIG[tc].icon}
                  </span>
                  {t(TYPE_CONTENU_CONFIG[tc].labelKey)}
                </button>
              ))}
            </div>
          </div>

          {needsUrl && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{t("urlLabel")}</label>
              <Input value={form.url} onChange={e => set("url", e.target.value)}
                placeholder={form.type === "VIDEO" ? "https://youtube.com/watch?v=..." : "https://..."}
                className="text-sm" />
            </div>
          )}

          {needsTexte && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                {form.type === "QUIZ" ? t("quizLabel") : t("contentLabel")}
              </label>
              <textarea value={form.texte} onChange={e => set("texte", e.target.value)}
                rows={5} placeholder={form.type === "QUIZ" ? "Q1: ...\nA) ...\nB) ...\nRéponse: A" : "Rédigez le contenu ici…"}
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t("estimatedDuration")}</label>
            <Input type="number" value={form.dureeMin} onChange={e => set("dureeMin", e.target.value)}
              placeholder="15" className="text-sm" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending || !form.titre} className="flex-1 gap-2">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t("add")}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Carte Cours ────────────────────────────────────────────────────────────────

const FALLBACK: SiteColor = {
  base: "#6b7280",
  light: "#f3f4f6",
  border: "#e5e7eb",
  text: "#374151",
};

function CoursCard({ cours, siteColors, onSelect, onDelete }: {
  cours: Cours;
  siteColors: Record<string, SiteColor>;
  onSelect: (c: Cours) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("cours");
  const nConfig = NIVEAU_CONFIG[cours.niveau];
  const sConfig = STATUT_CONFIG[cours.statut];
  const siteColor = cours.siteId ? (siteColors[cours.siteId] ?? FALLBACK) : FALLBACK;

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group"
      onClick={() => onSelect(cours)}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BookMarked className="w-5 h-5 text-primary" />
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {cours.siteId && cours.siteNom && (
              <Badge
                className="text-xs"
                style={{ backgroundColor: siteColor.light, borderColor: siteColor.border, color: siteColor.text }}
              >
                {cours.siteNom}
              </Badge>
            )}
            <Badge className={cn("text-xs border", nConfig.color)}>{t(nConfig.labelKey)}</Badge>
            <Badge className={cn("text-xs", sConfig.color)}>{t(sConfig.labelKey)}</Badge>
          </div>
        </div>

        <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-1 group-hover:text-primary transition-colors line-clamp-2">
          {cours.titre}
        </h3>

        {cours.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{cours.description}</p>
        )}

        {/* Meta */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-4">
          {cours.matiereNom && (
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />{cours.matiereNom}
            </span>
          )}
          {cours.classeNom && (
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3" />{cours.classeNom}
            </span>
          )}
          {cours.dureeMin && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />{cours.dureeMin} min
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: t("chapters"), value: cours._count?.contenus ?? 0, icon: <Layers className="w-3.5 h-3.5" /> },
            { label: t("views"), value: cours.nbVues, icon: <Eye className="w-3.5 h-3.5" /> },
            { label: t("subscribers"), value: cours.nbInscrits, icon: <Users className="w-3.5 h-3.5" /> },
          ].map(s => (
            <div key={s.label} className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex justify-center text-gray-400 mb-0.5">{s.icon}</div>
              <p className="text-base font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-400">
            {cours.auteurNom ?? "—"} · {formatDate(cours.createdAt)}
          </span>
          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500 hover:text-red-600"
              onClick={() => onDelete(cours.id)}>
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => onSelect(cours)}>
              {t("open")} <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Vue détail cours ───────────────────────────────────────────────────────────

function CoursDetail({ cours: initial, onBack }: {
  cours: Cours;
  onBack: () => void;
}) {
  const t = useTranslations("cours");
  const [cours, setCours] = useState<Cours & { contenus: ContenuCours[] }>({
    ...initial,
    contenus: initial.contenus ?? [],
  });
  const [showAddContenu, setShowAddContenu] = useState(false);
  const [publishing, startPublishing] = useTransition();

  const handlePublish = () => {
    const newStatut = cours.statut === "PUBLIE" ? "BROUILLON" : "PUBLIE";
    startPublishing(async () => {
      try {
        const res = await fetch(`/api/cours/${cours.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut: newStatut }),
        });
        if (!res.ok) throw new Error();
        const { cours: updated } = await res.json();
        setCours(c => ({ ...c, statut: updated.statut }));
        toast.success(newStatut === "PUBLIE" ? t("coursePublished") : t("courseUnpublished"));
      } catch {
        toast.error(t("error"));
      }
    });
  };

  const nConfig = NIVEAU_CONFIG[cours.niveau];
  const sConfig = STATUT_CONFIG[cours.statut];
  const totalDuree = cours.contenus.reduce((s, c) => s + (c.dureeMin ?? 0), 0);

  return (
    <div className="space-y-6">
      {showAddContenu && (
        <AjouterContenuModal
          coursId={cours.id}
          ordre={cours.contenus.length}
          onClose={() => setShowAddContenu(false)}
          onAdded={c => setCours(prev => ({ ...prev, contenus: [...prev.contenus, c] }))}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1 flex-shrink-0 w-full sm:w-auto">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            <Badge className={cn("text-xs border", nConfig.color)}>{t(nConfig.labelKey)}</Badge>
            <Badge className={cn("text-xs", sConfig.color)}>{t(sConfig.labelKey)}</Badge>
            {cours.matiereNom && <Badge variant="outline" className="text-xs">{cours.matiereNom}</Badge>}
            {cours.classeNom && <Badge variant="outline" className="text-xs">{cours.classeNom}</Badge>}
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{cours.titre}</h2>
          {cours.description && <p className="text-sm text-gray-500 mt-1">{cours.description}</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            onClick={handlePublish}
            disabled={publishing}
            variant={cours.statut === "PUBLIE" ? "outline" : "default"}
            className="gap-2"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {cours.statut === "PUBLIE" ? t("unpublish") : t("publish")}
          </Button>
          <Button onClick={() => setShowAddContenu(true)} className="gap-2">
            <Plus className="w-4 h-4" /> {t("addContentBtn")}
          </Button>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("chapters"), value: cours.contenus.length, icon: <Layers className="w-5 h-5 text-primary" />, bg: "bg-primary/10" },
          { label: t("totalDuration"), value: totalDuree > 0 ? `${totalDuree} ${t("min")}` : "—", icon: <Clock className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
          { label: t("views"), value: cours.nbVues, icon: <Eye className="w-5 h-5 text-purple-600" />, bg: "bg-purple-100" },
          { label: t("subscribers"), value: cours.nbInscrits, icon: <Users className="w-5 h-5 text-green-600" />, bg: "bg-green-100" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.bg)}>
                {s.icon}
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liste des contenus */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            {t("courseProgram", { count: cours.contenus.length, s: cours.contenus.length !== 1 ? "s" : "" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cours.contenus.length === 0 ? (
            <div className="text-center py-12">
              <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-3">{t("noContent")}</p>
              <Button onClick={() => setShowAddContenu(true)} className="gap-2" size="sm">
                <Plus className="w-3.5 h-3.5" /> {t("addFirstChapter")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {cours.contenus.map((c, i) => {
                const tConfig = TYPE_CONTENU_CONFIG[c.type];
                return (
                  <div key={c.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 font-bold text-xs text-gray-500">
                      {i + 1}
                    </div>
                    <div className={cn("flex-shrink-0", tConfig.color)}>{tConfig.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.titre}</p>
                      <p className="text-xs text-gray-400">{t(TYPE_CONTENU_CONFIG[c.type].labelKey)}{c.dureeMin ? ` · ${c.dureeMin} ${t("min")}` : ""}</p>
                    </div>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                        onClick={e => e.stopPropagation()}>
                        <LinkIcon className="w-4 h-4" />
                      </a>
                    )}
                    <CheckCircle2 className="w-4 h-4 text-gray-200 dark:text-gray-700 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Vue principale ─────────────────────────────────────────────────────────────

export function CoursView({
  siteColors,
  activeSite,
}: {
  siteColors: Record<string, SiteColor>;
  activeSite: string;
}) {
  const t = useTranslations("cours");
  const [cours, setCours] = useState<Cours[]>([]);
  const [selected, setSelected] = useState<Cours | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filtreNiveau, setFiltreNiveau] = useState<Niveau | "TOUS">("TOUS");
  const [filtreStatut, setFiltreStatut] = useState<StatutCours | "TOUS">("TOUS");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Charger les cours au montage et quand le site actif change
  useEffect(() => {
    const url = activeSite === "all" ? "/api/cours" : `/api/cours?siteId=${encodeURIComponent(activeSite)}`;
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(({ cours }) => setCours(cours ?? []))
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [t, activeSite]);

  const stats = useMemo(() => ({
    total: cours.length,
    publies: cours.filter(c => c.statut === "PUBLIE").length,
    brouillons: cours.filter(c => c.statut === "BROUILLON").length,
    totalVues: cours.reduce((s, c) => s + c.nbVues, 0),
  }), [cours]);

  const filtered = useMemo(() => cours.filter(c => {
    const ms = !search || c.titre.toLowerCase().includes(search.toLowerCase())
      || (c.matiereNom ?? "").toLowerCase().includes(search.toLowerCase())
      || (c.classeNom ?? "").toLowerCase().includes(search.toLowerCase());
    const mn = filtreNiveau === "TOUS" || c.niveau === filtreNiveau;
    const ms2 = filtreStatut === "TOUS" || c.statut === filtreStatut;
    return ms && mn && ms2;
  }), [cours, search, filtreNiveau, filtreStatut]);

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await fetch(`/api/cours/${id}`, { method: "DELETE" });
        setCours(prev => prev.filter(c => c.id !== id));
        toast.success(t("courseDeleted"));
      } catch {
        toast.error(t("deleteError"));
      }
    });
  };

  const handleSelect = async (c: Cours) => {
    // Charger les détails avec les contenus
    try {
      const res = await fetch(`/api/cours/${c.id}`);
      const { cours: detail } = await res.json();
      setSelected(detail);
    } catch {
      setSelected(c);
    }
  };

  if (selected) {
    return <CoursDetail cours={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      {showCreate && (
        <CreerCoursModal
          onClose={() => setShowCreate(false)}
          onCreate={c => setCours(prev => [c, ...prev])}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("title")}</h2>
          <p className="text-sm text-gray-500">{t("publishedCourses", { count: stats.publies, s: stats.publies !== 1 ? "s" : "" })}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" /> {t("newCourse")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("totalCourses"), value: stats.total, icon: <BookOpen className="w-5 h-5 text-primary" />, bg: "bg-primary/10" },
          { label: t("published"), value: stats.publies, icon: <Globe className="w-5 h-5 text-green-600" />, bg: "bg-green-100 dark:bg-green-900/30" },
          { label: t("drafts"), value: stats.brouillons, icon: <FileText className="w-5 h-5 text-gray-500" />, bg: "bg-gray-100 dark:bg-gray-800" },
          { label: t("totalViews"), value: stats.totalVues, icon: <Eye className="w-5 h-5 text-purple-600" />, bg: "bg-purple-100 dark:bg-purple-900/30" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.bg)}>
                {s.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")} className="pl-9 text-sm h-9" />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(["TOUS", "PUBLIE", "BROUILLON"] as const).map(s => (
            <button key={s} onClick={() => setFiltreStatut(s as StatutCours | "TOUS")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filtreStatut === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200"
              )}>
              {s === "TOUS" ? t("all") : t(STATUT_CONFIG[s as StatutCours].labelKey)}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["TOUS", "DEBUTANT", "INTERMEDIAIRE", "AVANCE"] as const).map(n => (
            <button key={n} onClick={() => setFiltreNiveau(n as Niveau | "TOUS")}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filtreNiveau === n ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200"
              )}>
              {n === "TOUS" ? t("allLevels") : t(NIVEAU_CONFIG[n as Niveau].labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-3">
              {search ? t("noCoursesSearch") : t("noCourses")}
            </p>
            {!search && (
              <Button onClick={() => setShowCreate(true)} className="gap-2" size="sm">
                <Plus className="w-3.5 h-3.5" /> {t("createFirstCourse")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CoursCard key={c.id} cours={c} siteColors={siteColors} onSelect={handleSelect} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
