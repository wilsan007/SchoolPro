"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import {
  Circle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Plus,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BUCKET_ORDER,
  BUCKET_COLORS,
  grouperParBucket,
  type BucketTache,
} from "@/lib/tache-buckets";

// ── Types ──────────────────────────────────────────────────────

export interface TacheData {
  id: string;
  titre: string;
  description: string | null;
  type: string;
  priorite: string;
  statut: string;
  echeance: string | null;
  dateFaite: string | null;
  sourceType: string | null;
  sourceId: string | null;
  classe: { id: string; nom: string } | null;
  matiere: { id: string; nom: string } | null;
  assigneeA: { id: string; name: string | null; email: string | null };
  creePar: { id: string; name: string | null } | null;
}

interface Props {
  taches: TacheData[];
  /** Date de référence (Time Machine-aware). ISO string. */
  maintenant: string;
  /** Afficher le bouton "synchroniser" (régénère les tâches auto). */
  showSync?: boolean;
  /** Afficher le formulaire de création rapide. */
  showCreate?: boolean;
  /** Liste d'utilisateurs pour le formulaire (optionnel). */
  users?: Array<{ id: string; name: string | null; email: string | null }>;
  /** Mode compact (pour intégration dans d'autres pages). */
  compact?: boolean;
  /** Titre de la section. */
  title?: string;
}

// ── Icônes par statut ──────────────────────────────────────────

const STATUT_ICONS: Record<string, React.ReactNode> = {
  A_FAIRE: <Circle className="w-4 h-4 text-slate-400" />,
  EN_COURS: <Loader2 className="w-4 h-4 text-blue-500" />,
  FAIT: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  ANNULE: <AlertCircle className="w-4 h-4 text-red-500" />,
};

const PRIORITE_COLORS: Record<string, string> = {
  BASSE: "bg-slate-50 text-slate-600 border-slate-200",
  NORMALE: "bg-blue-50 text-blue-600 border-blue-200",
  HAUTE: "bg-orange-50 text-orange-600 border-orange-200",
  URGENTE: "bg-red-50 text-red-600 border-red-200",
};

const TYPE_ICONS: Record<string, string> = {
  saisie_notes: "📝",
  validation_seance: "📖",
  correction_devoirs: "✏️",
  remise_bulletins: "📄",
  traitement_incident: "⚠️",
  justification_absence: "👤",
  relance_facture: "💰",
  reinscription: "🔄",
  preparation_cours: "📚",
  conseil_classe: "🏛️",
  rendez_vous_parent: "💬",
  reunion_pedagogique: "👥",
  autre: "📌",
};

// ── Composant principal ────────────────────────────────────────

export function TaskTimeline({
  taches: initial,
  maintenant,
  showSync = false,
  showCreate = false,
  users = [],
  compact = false,
  title,
}: Props) {
  const [taches, setTaches] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set());

  const now = new Date(maintenant);
  const grouped = grouperParBucket(taches, now);

  // Tâches non terminées pour le compteur de badge.
  const enRetard = grouped.EN_RETARD.length;
  const aujourdhui = grouped.AUJOURDHUI.length;
  const totalActif = taches.filter((t) => t.statut === "A_FAIRE" || t.statut === "EN_COURS").length;

  // Sync : régénère les tâches auto depuis l'état du système.
  const handleSync = useCallback(() => {
    setSyncing(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/taches/sync", { method: "POST" });
        if (!res.ok) throw new Error("Sync échoué");
        const result = await res.json();
        toast.success(`${result.created} tâche(s) créée(s), ${result.closed} fermée(s)`);

        // Recharger les tâches.
        const tachesRes = await fetch("/api/taches?sync=0&mine=1");
        if (tachesRes.ok) {
          const data = await tachesRes.json();
          setTaches(data.taches);
        }
      } catch {
        toast.error("Erreur de synchronisation");
      } finally {
        setSyncing(false);
      }
    });
  }, []);

  // Changer le statut d'une tâche.
  const changerStatut = useCallback((id: string, statut: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/taches/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut }),
        });
        if (!res.ok) throw new Error("Échec");
        setTaches((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  statut,
                  dateFaite: statut === "FAIT" ? new Date().toISOString() : t.dateFaite,
                }
              : t
          )
        );
        if (statut === "FAIT") toast.success("Tâche terminée ✓");
      } catch {
        toast.error("Erreur lors de la mise à jour");
      }
    });
  }, []);

  const toggleBucket = (bucket: string) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      {(title || showSync) && (
        <div className="flex items-center gap-3 flex-wrap">
          {title && (
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          )}
          {enRetard > 0 && (
            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
              {enRetard} en retard
            </Badge>
          )}
          {aujourdhui > 0 && (
            <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
              {aujourdhui} {"aujourd'hui"}
            </Badge>
          )}
          <div className="flex-1" />
          {showSync && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSync}
              disabled={syncing || isPending}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              {syncing ? "Sync…" : "Synchroniser"}
            </Button>
          )}
        </div>
      )}

      {/* Buckets temporels */}
      {BUCKET_ORDER.map((bucket) => {
        const items = grouped[bucket];
        if (items.length === 0) return null;

        const colors = BUCKET_COLORS[bucket];
        const isCollapsed = collapsedBuckets.has(bucket);

        return (
          <div key={bucket} className="space-y-1.5">
            {/* En-tête du bucket */}
            <button
              onClick={() => toggleBucket(bucket)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg border-l-4 transition-colors hover:bg-muted/30",
                colors.border,
                colors.bg
              )}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
              <span className={cn("text-sm font-medium", colors.text)}>
                {colors.label}
              </span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", colors.bg, colors.text)}>
                {items.length}
              </span>
            </button>

            {/* Tâches du bucket */}
            {!isCollapsed && (
              <div className={cn("space-y-1.5", compact ? "" : "ml-2")}>
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    tache={t}
                    onChangerStatut={changerStatut}
                    disabled={isPending}
                    compact={compact}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* État vide */}
      {totalActif === 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-3 p-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Tout est à jour
              </p>
              <p className="text-sm text-muted-foreground">
                Aucune tâche en attente. Bon travail !
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Carte de tâche individuelle ────────────────────────────────

function TaskCard({
  tache,
  onChangerStatut,
  disabled,
  compact,
}: {
  tache: TacheData;
  onChangerStatut: (id: string, statut: string) => void;
  disabled: boolean;
  compact: boolean;
}) {
  const enRetard =
    tache.statut !== "FAIT" &&
    tache.statut !== "ANNULE" &&
    tache.echeance &&
    new Date(tache.echeance) < new Date();

  const typeIcon = TYPE_ICONS[tache.type] ?? TYPE_ICONS.autre;
  const isAuto = !!tache.sourceType;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 bg-white dark:bg-slate-900/50 rounded-xl border transition-all hover:shadow-sm",
        enRetard ? "border-red-200 dark:border-red-900/50" : "border-slate-200 dark:border-slate-800",
        tache.statut === "FAIT" && "opacity-60"
      )}
    >
      {/* Bouton de statut */}
      <button
        onClick={() => onChangerStatut(tache.id, tache.statut === "FAIT" ? "A_FAIRE" : "FAIT")}
        className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform"
        disabled={disabled}
        title={tache.statut === "FAIT" ? "Rouvrir" : "Terminer"}
      >
        {STATUT_ICONS[tache.statut]}
      </button>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm", !compact && "font-medium", tache.statut === "FAIT" && "line-through text-slate-400")}>
            {typeIcon} {tache.titre}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1 py-0 h-4", PRIORITE_COLORS[tache.priorite] ?? PRIORITE_COLORS.NORMALE)}
          >
            {tache.priorite}
          </Badge>
          {isAuto && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-violet-50 text-violet-600 border-violet-200">
              Auto
            </Badge>
          )}
          {tache.classe && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {tache.classe.nom}
            </Badge>
          )}
          {tache.matiere && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {tache.matiere.nom}
            </Badge>
          )}
        </div>

        {tache.description && !compact && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tache.description}</p>
        )}

        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {!compact && (
            <span className="flex items-center gap-0.5">
              <User className="w-3 h-3" />
              {tache.assigneeA.name ?? tache.assigneeA.email}
            </span>
          )}
          {tache.echeance && (
            <span className={cn("flex items-center gap-0.5", enRetard && "text-red-500 font-medium")}>
              <Calendar className="w-3 h-3" />
              {formatDateShort(tache.echeance)}
              {enRetard && " · en retard"}
            </span>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      {tache.statut !== "FAIT" && tache.statut !== "ANNULE" && (
        <div className="flex gap-1 flex-shrink-0">
          {tache.statut === "A_FAIRE" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onChangerStatut(tache.id, "EN_COURS")}
              disabled={disabled}
            >
              Démarrer
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-emerald-600"
            onClick={() => onChangerStatut(tache.id, "FAIT")}
            disabled={disabled}
          >
            Terminer
          </Button>
        </div>
      )}
    </div>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffJours = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffJours === 0) return "Aujourd'hui";
  if (diffJours === 1) return "Demain";
  if (diffJours === -1) return "Hier";
  if (diffJours > 0 && diffJours <= 7) return `Dans ${diffJours}j`;
  if (diffJours < 0 && diffJours >= -7) return `Il y a ${Math.abs(diffJours)}j`;

  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
