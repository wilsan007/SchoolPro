"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  UserPlus,
  FileText,
  ClipboardList,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Bell,
  Briefcase,
  GraduationCap,
  Activity,
  Clock,
  ChevronRight,
  Shield,
  UserCheck,
  Banknote,
  Wallet,
  HeartPulse,
  MessageCircle,
  MessageSquare,
  Lock,
  UserX,
  BookOpen,
} from "lucide-react";

export interface ActivityItemData {
  id: string;
  type: ActivityType;
  titre: string;
  description?: string;
  date: string;
  href: string;
  acteur?: { id: string; nom: string; role: string } | null;
}

type ActivityType =
  | "saisie_absence"
  | "saisie_note"
  | "rapport_incident"
  | "resolution_incident"
  | "classement_incident"
  | "reintegration_sanction"
  | "facture"
  | "paiement"
  | "depense"
  | "conge_demande"
  | "conge_approbation"
  | "inscription"
  | "bulletin_genere"
  | "bulletin_publie"
  | "bulletin_modifie"
  | "bulletin_verrouille"
  | "passage_infirmerie"
  | "entretien"
  | "communication"
  | "seance_commentaire"
  | "audit";

type PeriodeKey = "aujourdhui" | "semaine" | "mois" | "recent";

const PERIODES: { key: PeriodeKey; label: string }[] = [
  { key: "recent", label: "Dernière action" },
  { key: "aujourdhui", label: "Aujourd'hui" },
  { key: "semaine", label: "Cette semaine" },
  { key: "mois", label: "Ce mois" },
];

const CONFIG_TYPE: Record<
  ActivityType,
  { icone: typeof UserPlus; couleur: string; bg: string }
> = {
  saisie_absence: { icone: UserX, couleur: "text-orange-600", bg: "bg-orange-500/10" },
  saisie_note: { icone: FileText, couleur: "text-blue-600", bg: "bg-blue-500/10" },
  rapport_incident: { icone: ShieldAlert, couleur: "text-red-600", bg: "bg-red-500/10" },
  resolution_incident: { icone: ShieldCheck, couleur: "text-emerald-600", bg: "bg-emerald-500/10" },
  classement_incident: { icone: Shield, couleur: "text-slate-500", bg: "bg-slate-500/10" },
  reintegration_sanction: { icone: UserCheck, couleur: "text-emerald-600", bg: "bg-emerald-500/10" },
  facture: { icone: Receipt, couleur: "text-emerald-600", bg: "bg-emerald-500/10" },
  paiement: { icone: Banknote, couleur: "text-teal-600", bg: "bg-teal-500/10" },
  depense: { icone: Wallet, couleur: "text-amber-600", bg: "bg-amber-500/10" },
  conge_demande: { icone: Briefcase, couleur: "text-violet-600", bg: "bg-violet-500/10" },
  conge_approbation: { icone: Briefcase, couleur: "text-violet-600", bg: "bg-violet-500/10" },
  inscription: { icone: UserPlus, couleur: "text-teal-600", bg: "bg-teal-500/10" },
  bulletin_genere: { icone: FileText, couleur: "text-blue-600", bg: "bg-blue-500/10" },
  bulletin_publie: { icone: FileText, couleur: "text-sky-600", bg: "bg-sky-500/10" },
  bulletin_modifie: { icone: FileText, couleur: "text-indigo-600", bg: "bg-indigo-500/10" },
  bulletin_verrouille: { icone: Lock, couleur: "text-slate-600", bg: "bg-slate-500/10" },
  passage_infirmerie: { icone: HeartPulse, couleur: "text-rose-600", bg: "bg-rose-500/10" },
  entretien: { icone: MessageCircle, couleur: "text-indigo-600", bg: "bg-indigo-500/10" },
  communication: { icone: Bell, couleur: "text-sky-600", bg: "bg-sky-500/10" },
  seance_commentaire: { icone: MessageSquare, couleur: "text-cyan-600", bg: "bg-cyan-500/10" },
  audit: { icone: Activity, couleur: "text-slate-500", bg: "bg-slate-500/10" },
};

function formatTempsRelatif(dateStr: string): string {
  const date = new Date(dateStr);
  const maintenant = new Date();
  const diff = maintenant.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const heures = Math.floor(diff / 3_600_000);
  const jours = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (heures < 24) return `il y a ${heures}h`;
  if (jours === 1) return "hier";
  if (jours < 7) return `il y a ${jours}j`;
  return date.toLocaleDateString("fr", { day: "2-digit", month: "short" });
}

function formatHeure(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Timeline d'activité — affiche les actions récentes des acteurs de l'établissement
 * avec un toggle de période (aujourd'hui / semaine / mois / dernière action).
 *
 * Les données sont passées en props pour chaque période : la page serveur
 * précharge les 4 périodes, et le composant client bascule entre elles
 * sans rechargement.
 */
export function ActivityTimeline({
  itemsParPeriode,
}: {
  itemsParPeriode: Record<PeriodeKey, ActivityItemData[]>;
}) {
  const [periode, setPeriode] = useState<PeriodeKey>("recent");

  const items = useMemo(
    () => itemsParPeriode[periode] ?? [],
    [itemsParPeriode, periode]
  );

  return (
    <Card className="overflow-hidden rounded-[22px] border border-border bg-card">
      {/* En-tête avec toggle de période */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Activité récente</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {items.length} événement{items.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODES.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={periode === p.key ? "default" : "ghost"}
              className="h-8 px-3 text-xs rounded-xl"
              onClick={() => setPeriode(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {items.length === 0 ? (
        <div className="py-10 text-center">
          <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Aucune activité sur cette période.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {items.map((item) => {
            const config = CONFIG_TYPE[item.type] ?? CONFIG_TYPE.audit;
            const Icone = config.icone;
            const isLink = item.href && item.href !== "#";

            const content = (
              <div className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors">
                {/* Icône */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                    <Icone className={cn("h-4 w-4", config.couleur)} />
                  </div>
                </div>

                {/* Contenu */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.titre}</p>
                    <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                      {formatTempsRelatif(item.date)}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    {item.acteur && (
                      <span className="inline-flex items-center rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {item.acteur.role}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {formatHeure(item.date)}
                    </span>
                  </div>
                </div>

                {/* Flèche si lien */}
                {isLink && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-2" />
                )}
              </div>
            );

            return isLink ? (
              <Link key={item.id} href={item.href}>
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
