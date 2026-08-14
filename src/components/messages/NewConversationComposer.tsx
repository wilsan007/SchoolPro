"use client";

/**
 * Composeur de conversation — version redesignée
 * ===============================================
 *
 * Deux modes de ciblage, complémentaires :
 *
 *   1. **Mode Audience** — pour les diffusions et annonces groupées.
 *      L'utilisateur choisit une portée (établissement, site, structure,
 *      niveau, classe) puis coche les publics voulus (parents, élèves,
 *      enseignants, personnel, direction). Plusieurs publics peuvent être
 *      cochés simultanément — « parents + enseignants de 6e B » en un seul
 *      envoi. Un aperçu chiffré se met à jour en temps réel.
 *
 *   2. **Mode Personnes** — pour les messages directs et petits groupes.
 *      Recherche individuelle par nom, avec filtrage par rôle.
 *
 * Trois intentions (Message / Annonce / Groupe) déterminent le type
 * technique stocké en base, déduit côté serveur.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, X, Users, User, GraduationCap, Building2, Layers,
  Megaphone, MessageSquare, Hash, Loader2, AlertTriangle, Send, UserCheck,
  CheckSquare, Square, ChevronRight, School,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Types (miroir de src/lib/messaging-audience.ts)
// ------------------------------------------------------------

type Intent = "MESSAGE" | "ANNONCE" | "GROUPE";

type AudienceScope =
  | { kind: "TENANT" }
  | { kind: "SITE"; id: string }
  | { kind: "STRUCTURE"; id: string }
  | { kind: "NIVEAU"; value: string }
  | { kind: "CLASSE"; id: string };

type AudienceGroup = "ALL" | "PARENTS" | "ELEVES" | "ENSEIGNANTS" | "PERSONNEL" | "DIRECTION";

interface TargetingOptions {
  scopes: AudienceScope["kind"][];
  groups: AudienceGroup[];
  sites: { id: string; nom: string }[];
  structures: { id: string; nom: string }[];
  niveaux: string[];
  classes: { id: string; nom: string; niveau: string; siteId: string | null }[];
}

interface Person {
  id: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
}

interface Preview {
  count: number;
  breakdown: { group: AudienceGroup; count: number }[];
  sansCompte: number;
  truncated: boolean;
  max: number;
}

type ComposerMode = "audience" | "persons";

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------

const INTENTS: { id: Intent; label: string; hint: string; icon: typeof Send; color: string }[] = [
  { id: "MESSAGE", label: "Message", hint: "Chacun peut répondre", icon: MessageSquare, color: "text-blue-500" },
  { id: "ANNONCE", label: "Annonce", hint: "Diffusion, lecture seule", icon: Megaphone, color: "text-orange-500" },
  { id: "GROUPE", label: "Groupe", hint: "Espace de discussion durable", icon: Hash, color: "text-purple-500" },
];

const GROUP_LABEL: Record<AudienceGroup, string> = {
  ALL: "Tout le monde",
  PARENTS: "Les parents",
  ELEVES: "Les élèves",
  ENSEIGNANTS: "Les enseignants",
  PERSONNEL: "Le personnel",
  DIRECTION: "La direction",
};

const GROUP_ICON: Record<AudienceGroup, typeof Users> = {
  ALL: Users,
  PARENTS: UserCheck,
  ELEVES: GraduationCap,
  ENSEIGNANTS: Users,
  PERSONNEL: Users,
  DIRECTION: Building2,
};

const GROUP_COLOR: Record<AudienceGroup, string> = {
  ALL: "text-gray-500",
  PARENTS: "text-purple-500",
  ELEVES: "text-green-500",
  ENSEIGNANTS: "text-blue-500",
  PERSONNEL: "text-teal-500",
  DIRECTION: "text-indigo-500",
};

const SCOPE_LABEL: Record<AudienceScope["kind"], string> = {
  TENANT: "Tout l'établissement",
  SITE: "Un site",
  STRUCTURE: "Une structure",
  NIVEAU: "Un niveau",
  CLASSE: "Une classe",
};

const SCOPE_ICON: Record<AudienceScope["kind"], typeof Building2> = {
  TENANT: Building2,
  SITE: School,
  STRUCTURE: Layers,
  NIVEAU: Layers,
  CLASSE: GraduationCap,
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  TENANT_ADMIN: "Direction",
  PRINCIPAL: "Chef d'établissement",
  SECRETARY: "Secrétariat",
  TEACHER: "Enseignant",
  CLASS_TEACHER: "Prof. principal",
  COUNSELOR: "Conseiller",
  NURSE: "Infirmerie",
  ACCOUNTANT: "Comptabilité",
  PARENT: "Parent",
  STUDENT: "Élève",
};

/** Comparaison insensible à la casse et aux accents. */
function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// ------------------------------------------------------------
// Composant
// ------------------------------------------------------------

export function NewConversationComposer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conv: { id: string } & Record<string, unknown>) => void;
}) {
  const [intent, setIntent] = useState<Intent>("MESSAGE");
  const [mode, setMode] = useState<ComposerMode>("audience");
  const [options, setOptions] = useState<TargetingOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Audience mode state
  const [selectedScope, setSelectedScope] = useState<AudienceScope | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<AudienceGroup>>(new Set());
  const [scopeStep, setScopeStep] = useState<AudienceScope["kind"] | null>(null);

  // Persons mode state
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);

  // Preview
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Message
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // --- Options de ciblage ---
  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages/audience")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
        return r.json();
      })
      .then((data: TargetingOptions) => {
        if (cancelled) return;
        setOptions(data);
        // Si l'utilisateur n'a aucune portée (parent, élève), basculer en mode personnes
        if (data.scopes.length === 0) setMode("persons");
        // Pré-sélectionner la première portée disponible
        if (data.scopes.length > 0) {
          setScopeStep(data.scopes[0]);
        }
      })
      .catch((e: Error) => { if (!cancelled) setOptionsError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // --- Recherche de personnes (mode personnes) ---
  useEffect(() => {
    if (mode !== "persons") return;
    let cancelled = false;
    setLoadingPeople(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ type: "DIRECT" });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/messages/recipients?${params}`)
        .then((r) => (r.ok ? r.json() : { recipients: [] }))
        .then((data) => { if (!cancelled) setPeople(data.recipients ?? []); })
        .catch(() => { if (!cancelled) setPeople([]); })
        .finally(() => { if (!cancelled) setLoadingPeople(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, mode]);

  // --- Aperçu de l'audience (mode audience) ---
  const activeGroups = useMemo(() => {
    if (selectedGroups.has("ALL")) return ["ALL" as AudienceGroup];
    return [...selectedGroups];
  }, [selectedGroups]);

  const hasAudience = selectedScope && activeGroups.length > 0;

  useEffect(() => {
    if (!hasAudience) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    fetch("/api/messages/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: selectedScope,
        group: activeGroups[0],
        groups: activeGroups.length > 1 ? activeGroups : undefined,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
    // `activeGroups` est mémoïsé sur `selectedGroups` : son identité ne change
    // qu'à une vraie modification de la sélection. La clé `activeGroups.join(",")`
    // utilisée auparavant était une expression composée, que le linter ne peut
    // pas vérifier — et elle n'apportait rien de plus.
  }, [selectedScope, activeGroups, hasAudience]);

  // --- Toggle group checkbox ---
  const toggleGroup = (g: AudienceGroup) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (g === "ALL") {
        // ALL is exclusive
        if (next.has("ALL")) next.clear();
        else { next.clear(); next.add("ALL"); }
      } else {
        next.delete("ALL");
        if (next.has(g)) next.delete(g);
        else next.add(g);
      }
      return next;
    });
  };

  // --- Scope selection helpers ---
  const availableScopes = options?.scopes ?? [];
  const hasScopeChoice = availableScopes.length > 1;

  const selectScope = (scope: AudienceScope) => {
    setSelectedScope(scope);
  };

  // --- Envoi ---
  const recipientCount = mode === "audience"
    ? (preview?.count ?? null)
    : selectedPeople.length;

  const canSend =
    message.trim().length > 0 &&
    !creating &&
    (mode === "audience"
      ? (preview?.count ?? 0) > 0 && hasAudience
      : selectedPeople.length > 0);

  const handleCreate = async () => {
    if (!canSend) return;
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        intent,
        firstMessage: message.trim(),
        subject: subject.trim() || undefined,
      };
      if (mode === "audience" && hasAudience) {
        body.audience = {
          scope: selectedScope,
          group: activeGroups[0],
          groups: activeGroups.length > 1 ? activeGroups : undefined,
        };
      } else {
        body.participantIds = selectedPeople.map((p) => p.id);
      }
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Échec de la création");
      else onCreated(data);
    } catch {
      setError("Impossible de joindre le serveur");
    } finally {
      setCreating(false);
    }
  };

  const audienceLabel = useMemo(() => {
    if (!hasAudience) return "";
    const groupPart = activeGroups.includes("ALL")
      ? "Tout le monde"
      : activeGroups.map((g) => GROUP_LABEL[g]).join(" + ");
    const scopePart = selectedScope
      ? (selectedScope.kind === "TENANT" ? "tout l'établissement"
        : selectedScope.kind === "SITE" ? (options?.sites.find((s) => s.id === selectedScope.id)?.nom ?? "site")
        : selectedScope.kind === "STRUCTURE" ? (options?.structures.find((s) => s.id === selectedScope.id)?.nom ?? "structure")
        : selectedScope.kind === "NIVEAU" ? `niveau ${selectedScope.value}`
        : selectedScope.kind === "CLASSE" ? (options?.classes.find((c) => c.id === selectedScope.id)?.nom ?? "classe")
        : "")
      : "";
    return `${groupPart} — ${scopePart}`;
  }, [hasAudience, activeGroups, selectedScope, options]);

  // --- Available groups for current scope ---
  const availableGroups = options?.groups ?? [];

  // --- Render scope selector tree ---
  const renderScopeSelector = () => {
    if (!options || availableScopes.length === 0) return null;

    // If only one scope kind, auto-select it
    if (availableScopes.length === 1 && !selectedScope) {
      const kind = availableScopes[0];
      if (kind === "TENANT") {
        selectScope({ kind: "TENANT" });
        return null;
      }
    }

    return (
      <div className="space-y-2">
        {/* Scope kind selector (if multiple) */}
        {hasScopeChoice && (
          <div className="flex flex-wrap gap-1.5">
            {availableScopes.map((kind) => {
              const SIcon = SCOPE_ICON[kind];
              const isActive = scopeStep === kind || selectedScope?.kind === kind;
              return (
                <button
                  key={kind}
                  onClick={() => { setScopeStep(kind); setSelectedScope(null); }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <SIcon className="h-3.5 w-3.5" />
                  {SCOPE_LABEL[kind]}
                </button>
              );
            })}
          </div>
        )}

        {/* Scope value selector based on current step */}
        {(!hasScopeChoice || scopeStep) && (
          <div className="border rounded-lg overflow-hidden">
            {/* TENANT — no value needed */}
            {(scopeStep === "TENANT" || (!hasScopeChoice && availableScopes[0] === "TENANT")) && (
              <button
                onClick={() => selectScope({ kind: "TENANT" })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  selectedScope?.kind === "TENANT" ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">Tout l&apos;établissement</span>
                {selectedScope?.kind === "TENANT" && <CheckSquare className="h-4 w-4 text-primary ml-auto" />}
              </button>
            )}

            {/* SITE */}
            {scopeStep === "SITE" && options.sites.map((s) => (
              <button
                key={s.id}
                onClick={() => selectScope({ kind: "SITE", id: s.id })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b last:border-0",
                  selectedScope?.kind === "SITE" && selectedScope.id === s.id ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <School className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">{s.nom}</span>
                {selectedScope?.kind === "SITE" && selectedScope.id === s.id && <CheckSquare className="h-4 w-4 text-primary ml-auto" />}
              </button>
            ))}

            {/* STRUCTURE */}
            {scopeStep === "STRUCTURE" && options.structures.map((s) => (
              <button
                key={s.id}
                onClick={() => selectScope({ kind: "STRUCTURE", id: s.id })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b last:border-0",
                  selectedScope?.kind === "STRUCTURE" && selectedScope.id === s.id ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">{s.nom}</span>
                {selectedScope?.kind === "STRUCTURE" && selectedScope.id === s.id && <CheckSquare className="h-4 w-4 text-primary ml-auto" />}
              </button>
            ))}

            {/* NIVEAU */}
            {scopeStep === "NIVEAU" && options.niveaux.map((n) => (
              <button
                key={n}
                onClick={() => selectScope({ kind: "NIVEAU", value: n })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b last:border-0",
                  selectedScope?.kind === "NIVEAU" && selectedScope.value === n ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">Niveau {n}</span>
                {selectedScope?.kind === "NIVEAU" && selectedScope.value === n && <CheckSquare className="h-4 w-4 text-primary ml-auto" />}
              </button>
            ))}

            {/* CLASSE — grouped by niveau */}
            {scopeStep === "CLASSE" && (
              <div className="max-h-48 overflow-y-auto">
                {options.classes.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    Aucune classe disponible pour votre périmètre.
                  </div>
                ) : (
                  Object.entries(
                    options.classes.reduce<Record<string, typeof options.classes>>((acc, c) => {
                      (acc[c.niveau] ??= []).push(c);
                      return acc;
                    }, {})
                  ).map(([niveau, classes]) => (
                    <div key={niveau}>
                      <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 sticky top-0">
                        {niveau}
                      </div>
                      {classes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectScope({ kind: "CLASSE", id: c.id })}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b last:border-0",
                            selectedScope?.kind === "CLASSE" && selectedScope.id === c.id ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm">{c.nom}</span>
                          {selectedScope?.kind === "CLASSE" && selectedScope.id === c.id && <CheckSquare className="h-4 w-4 text-primary ml-auto" />}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-2xl my-auto overflow-hidden border"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleCreate(); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
      >
        {/* Intention — trois choix */}
        <div className="flex border-b">
          {INTENTS.map((it) => {
            const Icon = it.icon;
            const active = intent === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setIntent(it.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-3 px-2 text-xs transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                <Icon className={cn("h-4 w-4", active && it.color)} />
                <span className="font-medium">{it.label}</span>
                <span className="text-[10px] opacity-70 hidden sm:block">{it.hint}</span>
                {active && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mode selector: Audience vs Personnes */}
          {availableScopes.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setMode("audience")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                  mode === "audience" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Users className="h-4 w-4" />
                Diffusion à un groupe
              </button>
              <button
                onClick={() => setMode("persons")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                  mode === "persons" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <User className="h-4 w-4" />
                Personnes individuelles
              </button>
            </div>
          )}

          {optionsError && (
            <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Ciblage indisponible : {optionsError}
            </div>
          )}

          {/* === MODE AUDIENCE === */}
          {mode === "audience" && (
            <div className="space-y-4">
              {/* 1. Portée */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  1. Portée — à qui s&apos;adresse le message ?
                </label>
                {renderScopeSelector()}
              </div>

              {/* 2. Publics — cases à cocher */}
              {selectedScope && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    2. Publics — cochez un ou plusieurs
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableGroups.map((g) => {
                      const GIcon = GROUP_ICON[g];
                      const checked = selectedGroups.has(g);
                      return (
                        <button
                          key={g}
                          onClick={() => toggleGroup(g)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all text-left",
                            checked
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:bg-accent/50 text-muted-foreground"
                          )}
                        >
                          {checked ? (
                            <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0" />
                          )}
                          <GIcon className={cn("h-3.5 w-3.5 shrink-0", checked && GROUP_COLOR[g])} />
                          <span className="truncate">{GROUP_LABEL[g]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Aperçu chiffré */}
              {hasAudience && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                  {previewLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Calcul des destinataires…
                    </span>
                  ) : preview ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 font-medium text-sm">
                        <Users className="h-4 w-4" />
                        {preview.count} destinataire{preview.count > 1 ? "s" : ""}
                        <span className="text-muted-foreground font-normal text-xs ml-1">
                          · {audienceLabel}
                        </span>
                      </div>
                      {preview.breakdown.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          {preview.breakdown.map((b) => {
                            const BIcon = GROUP_ICON[b.group];
                            return (
                              <span key={b.group} className="flex items-center gap-1 bg-background rounded-md px-2 py-1 text-[11px]">
                                <BIcon className={cn("h-3 w-3", GROUP_COLOR[b.group])} />
                                {GROUP_LABEL[b.group]} · <strong>{b.count}</strong>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {preview.sansCompte > 0 && (
                        <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>
                            {preview.sansCompte} personne{preview.sansCompte > 1 ? "s" : ""} sans compte
                            ne recevront pas ce message
                          </span>
                        </div>
                      )}
                      {preview.truncated && (
                        <div className="flex items-start gap-1.5 text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                          <span>Plus de {preview.max} personnes : affinez la portée</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    !previewLoading && <span className="text-muted-foreground">Sélectionnez une portée et au moins un public.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* === MODE PERSONNES === */}
          {mode === "persons" && (
            <div className="space-y-3">
              {/* Selected people chips */}
              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPeople.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 bg-muted rounded-md pl-1 pr-1 py-0.5 text-xs max-w-full"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={p.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[9px]">{p.name?.[0] ?? "?"}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{p.name}</span>
                      <button
                        onClick={() => setSelectedPeople((prev) => prev.filter((x) => x.id !== p.id))}
                        className="hover:bg-background rounded p-0.5 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search input */}
              <div className="border rounded-lg focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher une personne par nom…"
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                </div>

                {/* Results */}
                <div className="max-h-56 overflow-y-auto border-t">
                  {loadingPeople ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : people.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      {query ? "Aucun résultat" : "Tapez un nom pour rechercher"}
                    </div>
                  ) : (
                    people.map((p) => {
                      const selected = selectedPeople.some((sp) => sp.id === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (!selected) setSelectedPeople((prev) => [...prev, p]);
                          }}
                          disabled={selected}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b last:border-0",
                            selected ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/50"
                          )}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={p.avatarUrl ?? undefined} />
                            <AvatarFallback className="text-[10px]">{p.name?.[0] ?? "?"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {ROLE_LABEL[p.role] ?? p.role}
                            </div>
                          </div>
                          {selected ? (
                            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sujet */}
          {(hasAudience || selectedPeople.length > 1 || intent !== "MESSAGE") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Objet <span className="opacity-60">(optionnel)</span>
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={hasAudience ? audienceLabel : "Objet de la conversation"}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              {intent === "ANNONCE" ? "Votre annonce" : "Votre message"}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                intent === "ANNONCE"
                  ? "Les destinataires pourront lire sans répondre…"
                  : "Écrivez votre message…"
              }
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px] resize-y bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-destructive/10 text-destructive text-xs p-2.5 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
              {error}
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-muted/30">
          <p className="text-[11px] text-muted-foreground leading-tight">
            {intent === "ANNONCE"
              ? "Lecture seule : seuls vous et les responsables pourront écrire."
              : intent === "GROUPE"
                ? "Tout le monde pourra écrire dans ce groupe."
                : "Chaque destinataire pourra vous répondre."}
            {recipientCount !== null && recipientCount > 0 && (
              <> · <span className="font-medium">{recipientCount}</span> destinataire{recipientCount > 1 ? "s" : ""}</>
            )}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={handleCreate} disabled={!canSend}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><Send className="h-4 w-4 mr-1.5" />Envoyer</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
