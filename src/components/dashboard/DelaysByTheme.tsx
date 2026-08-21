"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, AlertCircle, Users,
  ClipboardList, BookOpen, FileEdit, FileText,
  ShieldAlert, UserX, type LucideIcon,
} from "lucide-react";

export interface PersonneEnRetardData {
  id: string;
  nom: string;
  count: number;
  details: string[];
}

export interface ThemeRetardData {
  key: string;
  label: string;
  total: number;
  nbPersonnes: number;
  personnes: PersonneEnRetardData[];
  href: string;
  niveau: "critique" | "important" | "modere";
}

const ICONES_THEME: Record<string, LucideIcon> = {
  "saisie-notes": ClipboardList,
  "validation-seances": BookOpen,
  "correction-devoirs": FileEdit,
  "publication-bulletins": FileText,
  "traitement-incidents": ShieldAlert,
  "justification-absences": UserX,
};

const COULEURS_NIVEAU: Record<ThemeRetardData["niveau"], { border: string; bg: string; text: string; dot: string }> = {
  critique: {
    border: "border-l-red-500",
    bg: "bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  important: {
    border: "border-l-orange-500",
    bg: "bg-orange-500/5",
    text: "text-orange-700 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  modere: {
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

/**
 * Vue des retards d'exécution par thème — pour la direction.
 *
 * Chaque thème est une carte cliquable qui se déploie pour révéler les
 * personnes concernées et le détail de leurs retards. Un clic sur le
 * titre du thème mène à l'écran où agir.
 */
export function DelaysByTheme({ themes }: { themes: ThemeRetardData[] }) {
  const [themeOuvert, setThemeOuvert] = useState<string | null>(null);

  if (themes.length === 0) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3 p-4">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              Aucun retard
            </p>
            <p className="text-sm text-muted-foreground">
              Tous les enseignants et professeurs principaux sont à jour.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const totalRetards = themes.reduce((acc, t) => acc + t.total, 0);
  const totalPersonnes = new Set(themes.flatMap((t) => t.personnes.map((p) => p.id))).size;

  return (
    <div className="space-y-3">
      {/* Résumé global */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span>
          <strong className="text-foreground">{totalRetards}</strong> retard{totalRetards > 1 ? "s" : ""} ·{" "}
          <strong className="text-foreground">{totalPersonnes}</strong> personne{totalPersonnes > 1 ? "s" : ""} concernée{totalPersonnes > 1 ? "s" : ""}
        </span>
      </div>

      {/* Thèmes */}
      <div className="space-y-2">
        {themes.map((theme) => {
          const isOpen = themeOuvert === theme.key;
          const Icone = ICONES_THEME[theme.key] ?? AlertCircle;
          const couleurs = COULEURS_NIVEAU[theme.niveau];

          return (
            <Card
              key={theme.key}
              className={cn("border-l-4 overflow-hidden transition-all", couleurs.border, couleurs.bg)}
            >
              {/* En-tête cliquable */}
              <button
                onClick={() => setThemeOuvert(isOpen ? null : theme.key)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className={cn("flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center", couleurs.bg)}>
                  <Icone className={cn("h-4 w-4", couleurs.text)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{theme.label}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", couleurs.bg, couleurs.text)}>
                      {theme.total} retard{theme.total > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {theme.nbPersonnes} personne{theme.nbPersonnes > 1 ? "s" : ""} concernée{theme.nbPersonnes > 1 ? "s" : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={theme.href}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
                  >
                    Traiter →
                  </Link>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Détail dépliable */}
              {isOpen && (
                <div className="border-t bg-background/50">
                  <div className="divide-y">
                    {theme.personnes.map((personne) => (
                      <div key={personne.id} className="p-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium">{personne.nom}</span>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", couleurs.bg, couleurs.text)}>
                            {personne.count}
                          </span>
                        </div>
                        {personne.details.length > 0 && (
                          <ul className="ml-5 mt-1 space-y-0.5">
                            {personne.details.map((detail, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-muted-foreground/40 mt-0.5">•</span>
                                <span className="truncate">{detail}</span>
                              </li>
                            ))}
                            {personne.count > personne.details.length && (
                              <li className="text-xs text-muted-foreground/60 italic">
                                + {personne.count - personne.details.length} autre{personne.count - personne.details.length > 1 ? "s" : ""}
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Lien vers l'écran d'action */}
                  <div className="p-3 border-t bg-muted/20">
                    <Link
                      href={theme.href}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Traiter ces retards →
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
