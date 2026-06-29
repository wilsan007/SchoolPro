"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bell, Plus, Send, Mail, MessageSquare, Smartphone,
  Users, GraduationCap, UserCheck, BookOpen, School,
  Clock, CheckCircle2, Loader2, Eye, Trash2, CalendarClock,
  Megaphone, BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, timeAgo } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Canal = "EMAIL" | "SMS" | "PUSH" | "IN_APP";
type Statut = "BROUILLON" | "PLANIFIEE" | "EN_ENVOI" | "ENVOYEE" | "ECHEC";
type Cible = "TOUS" | "PARENTS" | "ENSEIGNANTS" | "ELEVES" | "CLASSE" | "NIVEAU";

interface Classe { id: string; nom: string; niveau: string }

interface Notification {
  id: string;
  titre: string;
  contenu: string;
  canal: Canal;
  statut: Statut;
  cible: Cible;
  classeId: string | null;
  niveau: string | null;
  nbDestinataires: number;
  nbDelivres: number;
  nbLus: number;
  planifieeAt: Date | string | null;
  envoyeeAt: Date | string | null;
  createdAt: Date | string;
  envoyePar: { name: string; avatarUrl: string | null } | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CANAL_CONFIG: Record<Canal, { label: string; icon: React.ReactNode; color: string }> = {
  IN_APP:  { label: "In-App",  icon: <Bell className="w-3.5 h-3.5" />,        color: "bg-blue-50 text-blue-700 border-blue-200" },
  EMAIL:   { label: "Email",   icon: <Mail className="w-3.5 h-3.5" />,        color: "bg-purple-50 text-purple-700 border-purple-200" },
  SMS:     { label: "SMS",     icon: <MessageSquare className="w-3.5 h-3.5" />,color: "bg-green-50 text-green-700 border-green-200" },
  PUSH:    { label: "Push",    icon: <Smartphone className="w-3.5 h-3.5" />,  color: "bg-orange-50 text-orange-700 border-orange-200" },
};

const STATUT_CONFIG: Record<Statut, { label: string; color: string; icon: React.ReactNode }> = {
  BROUILLON: { label: "Brouillon",  color: "bg-gray-100 text-gray-600 border-gray-200",    icon: <Eye className="w-3 h-3" /> },
  PLANIFIEE: { label: "Planifiée",  color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <CalendarClock className="w-3 h-3" /> },
  EN_ENVOI:  { label: "En cours",   color: "bg-blue-50 text-blue-700 border-blue-200",      icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  ENVOYEE:   { label: "Envoyée",    color: "bg-green-50 text-green-700 border-green-200",   icon: <CheckCircle2 className="w-3 h-3" /> },
  ECHEC:     { label: "Échec",      color: "bg-red-50 text-red-700 border-red-200",         icon: <Trash2 className="w-3 h-3" /> },
};

const CIBLE_CONFIG: Record<Cible, { label: string; icon: React.ReactNode }> = {
  TOUS:        { label: "Tout le monde",   icon: <School className="w-3.5 h-3.5" /> },
  PARENTS:     { label: "Parents",         icon: <UserCheck className="w-3.5 h-3.5" /> },
  ENSEIGNANTS: { label: "Enseignants",     icon: <GraduationCap className="w-3.5 h-3.5" /> },
  ELEVES:      { label: "Élèves",          icon: <Users className="w-3.5 h-3.5" /> },
  CLASSE:      { label: "Une classe",      icon: <BookOpen className="w-3.5 h-3.5" /> },
  NIVEAU:      { label: "Un niveau",       icon: <BarChart2 className="w-3.5 h-3.5" /> },
};

// ─── Formulaire de création ───────────────────────────────────────────────────

function ComposeModal({
  classes,
  onClose,
  onCreated,
}: {
  classes: Classe[];
  onClose: () => void;
  onCreated: (n: Notification) => void;
}) {
  const niveaux = [...new Set(classes.map((c) => c.niveau))];
  const [form, setForm] = useState({
    titre: "", contenu: "",
    canal: "IN_APP" as Canal,
    cible: "TOUS" as Cible,
    classeId: "", niveau: "",
    planifieeAt: "",
    envoyer: false,
  });
  const [isPending, startTransition] = useTransition();

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (envoyer: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/communication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, envoyer }),
        });
        if (!res.ok) throw new Error();
        const { notification } = await res.json();
        toast.success(envoyer ? "Notification envoyée !" : "Brouillon sauvegardé");
        onCreated(notification);
        onClose();
      } catch {
        toast.error("Erreur lors de la création");
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-0 shadow-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-5 h-5 text-primary" />
            Nouvelle notification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Titre */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">Titre *</label>
            <Input
              value={form.titre}
              onChange={(e) => set("titre", e.target.value)}
              placeholder="Ex : Réunion parents-professeurs jeudi"
              className="text-sm"
            />
          </div>

          {/* Contenu */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">Message *</label>
            <textarea
              value={form.contenu}
              onChange={(e) => set("contenu", e.target.value)}
              placeholder="Saisissez votre message…"
              rows={5}
              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{form.contenu.length} caractères</p>
          </div>

          {/* Canal + Cible */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">Canal d'envoi</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(CANAL_CONFIG) as Canal[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => set("canal", c)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-all",
                      form.canal === c
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    )}
                  >
                    {CANAL_CONFIG[c].icon} {CANAL_CONFIG[c].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">Destinataires</label>
              <div className="space-y-1">
                {(Object.keys(CIBLE_CONFIG) as Cible[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => set("cible", c)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all text-left",
                      form.cible === c
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    )}
                  >
                    {CIBLE_CONFIG[c].icon} {CIBLE_CONFIG[c].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Classe / Niveau selon cible */}
          {form.cible === "CLASSE" && (
            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">Sélectionner la classe</label>
              <select
                value={form.classeId}
                onChange={(e) => set("classeId", e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
              >
                <option value="">-- Choisir une classe --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
          )}
          {form.cible === "NIVEAU" && (
            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">Sélectionner le niveau</label>
              <select
                value={form.niveau}
                onChange={(e) => set("niveau", e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
              >
                <option value="">-- Choisir un niveau --</option>
                {niveaux.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}

          {/* Envoi différé */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block font-medium">Envoi planifié (optionnel)</label>
            <Input
              type="datetime-local"
              value={form.planifieeAt}
              onChange={(e) => set("planifieeAt", e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Boutons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleSubmit(true)}
              disabled={isPending || !form.titre || !form.contenu}
              className="flex-1 gap-2"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer maintenant
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={isPending || !form.titre || !form.contenu}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Brouillon
            </Button>
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Carte notification ───────────────────────────────────────────────────────

function NotifCard({ notif, onSend, onDelete }: {
  notif: Notification;
  onSend: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sConfig = STATUT_CONFIG[notif.statut];
  const cConfig = CANAL_CONFIG[notif.canal];
  const cibleConfig = CIBLE_CONFIG[notif.cible];

  const tauxLecture = notif.nbDestinataires > 0
    ? Math.round((notif.nbLus / notif.nbDestinataires) * 100)
    : 0;

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Megaphone className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{notif.titre}</h3>
              <Badge className={cn("text-xs gap-1 flex-shrink-0", sConfig.color)}>
                {sConfig.icon} {sConfig.label}
              </Badge>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-2 mt-1.5">
              <Badge className={cn("text-xs gap-1", cConfig.color)}>{cConfig.icon}{cConfig.label}</Badge>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                {cibleConfig.icon}
                <span>{cibleConfig.label}</span>
              </span>
              {notif.nbDestinataires > 0 && (
                <span className="text-xs text-gray-400">{notif.nbDestinataires} destinataires</span>
              )}
            </div>

            {/* Aperçu contenu */}
            <p
              className={cn(
                "text-xs text-gray-500 mt-2 leading-relaxed cursor-pointer",
                !expanded && "line-clamp-2"
              )}
              onClick={() => setExpanded(!expanded)}
            >
              {notif.contenu}
            </p>

            {/* Stats envoi */}
            {notif.statut === "ENVOYEE" && notif.nbDestinataires > 0 && (
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-blue-600">{notif.nbDelivres} délivrés</span>
                <span className="text-green-600">{notif.nbLus} lus ({tauxLecture}%)</span>
                <span className="text-gray-400">{notif.envoyeeAt ? timeAgo(notif.envoyeeAt) : ""}</span>
              </div>
            )}

            {/* Heure planifiée */}
            {notif.statut === "PLANIFIEE" && notif.planifieeAt && (
              <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600">
                <CalendarClock className="w-3 h-3" />
                Planifiée le {formatDate(notif.planifieeAt, "dd/MM/yyyy à HH:mm")}
              </div>
            )}

            {/* Expéditeur + date */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">
                Par {notif.envoyePar?.name ?? "Système"} · {formatDate(notif.createdAt)}
              </span>
              {notif.statut === "BROUILLON" && (
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-6 text-xs gap-1 px-2" onClick={() => onSend(notif.id)}>
                    <Send className="w-3 h-3" /> Envoyer
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-red-500 px-2" onClick={() => onDelete(notif.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Vue principale ───────────────────────────────────────────────────────────

interface CommunicationViewProps {
  notifications: Notification[];
  classes: Classe[];
}

export function CommunicationView({ notifications: initial, classes }: CommunicationViewProps) {
  const [notifs, setNotifs] = useState<Notification[]>(initial);
  const [showCompose, setShowCompose] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<Statut | "TOUS">("TOUS");
  const [filtreCanal, setFiltreCanal] = useState<Canal | "TOUS">("TOUS");
  const [isPending, startTransition] = useTransition();

  const stats = useMemo(() => ({
    total: notifs.length,
    envoyees: notifs.filter((n) => n.statut === "ENVOYEE").length,
    brouillons: notifs.filter((n) => n.statut === "BROUILLON").length,
    planifiees: notifs.filter((n) => n.statut === "PLANIFIEE").length,
    totalDestinataires: notifs.filter((n) => n.statut === "ENVOYEE")
      .reduce((s, n) => s + n.nbDestinataires, 0),
  }), [notifs]);

  const filtered = useMemo(() => notifs.filter((n) => {
    const ms = filtreStatut === "TOUS" || n.statut === filtreStatut;
    const mc = filtreCanal === "TOUS" || n.canal === filtreCanal;
    return ms && mc;
  }), [notifs, filtreStatut, filtreCanal]);

  const handleSend = (id: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/communication/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "envoyer" }),
        });
        if (!res.ok) throw new Error();
        setNotifs((prev) =>
          prev.map((n) => n.id === id ? { ...n, statut: "ENVOYEE", envoyeeAt: new Date() } : n)
        );
        toast.success("Notification envoyée !");
      } catch { toast.error("Erreur lors de l'envoi"); }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await fetch(`/api/communication/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "annuler" }),
        });
        setNotifs((prev) => prev.filter((n) => n.id !== id));
        toast.success("Brouillon supprimé");
      } catch { toast.error("Erreur"); }
    });
  };

  return (
    <div className="space-y-6">
      {showCompose && (
        <ComposeModal
          classes={classes}
          onClose={() => setShowCompose(false)}
          onCreated={(n) => setNotifs((prev) => [n, ...prev])}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Communication École</h2>
          <p className="text-sm text-gray-500">{stats.envoyees} notification{stats.envoyees !== 1 ? "s" : ""} envoyée{stats.envoyees !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setShowCompose(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nouveau message
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, color: "bg-blue-100 dark:bg-blue-900/30", icon: <Bell className="w-5 h-5 text-blue-600" /> },
          { label: "Envoyées", value: stats.envoyees, color: "bg-green-100 dark:bg-green-900/30", icon: <CheckCircle2 className="w-5 h-5 text-green-600" /> },
          { label: "Brouillons", value: stats.brouillons, color: "bg-gray-100 dark:bg-gray-800", icon: <Eye className="w-5 h-5 text-gray-500" /> },
          { label: "Destinataires touchés", value: stats.totalDestinataires, color: "bg-purple-100 dark:bg-purple-900/30", icon: <Users className="w-5 h-5 text-purple-600" /> },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</p>
              </div>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.color)}>
                {s.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1.5">
          {(["TOUS", "ENVOYEE", "BROUILLON", "PLANIFIEE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFiltreStatut(s as Statut | "TOUS")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filtreStatut === s
                  ? "bg-primary text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200"
              )}
            >
              {s === "TOUS" ? "Tous" : STATUT_CONFIG[s as Statut].label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["TOUS", "IN_APP", "EMAIL", "SMS", "PUSH"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFiltreCanal(c as Canal | "TOUS")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filtreCanal === c
                  ? "bg-primary text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 hover:bg-gray-200"
              )}
            >
              {c === "TOUS" ? "Tous canaux" : CANAL_CONFIG[c as Canal].label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune notification</p>
            <Button onClick={() => setShowCompose(true)} className="mt-3 gap-2" size="sm">
              <Plus className="w-3.5 h-3.5" /> Créer le premier message
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <NotifCard key={n.id} notif={n} onSend={handleSend} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
