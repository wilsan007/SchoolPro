"use client";

/**
 * Composeur de conversation
 * =========================
 *
 * Ce que font les logiciels scolaires historiques (Pronote, EcoleDirecte) :
 * un arbre de cases à cocher site → niveau → classe → public. Le ciblage est
 * complet mais l'écran est intimidant et lent à parcourir.
 *
 * Ce que font les messageries grand public (WhatsApp, Remind) : deux clics,
 * mais aucun ciblage — impossible d'écrire « aux parents de 6e B ».
 *
 * On garde la puissance des premiers et la rapidité des secondes :
 *
 *   • **un seul champ** qui cherche simultanément les personnes et les
 *     audiences (« 6e B », « parents », « Diallo ») — le principe de la
 *     palette de commandes (Linear, Superhuman) appliqué au ciblage ;
 *   • **des pastilles** pour ce qui est sélectionné, comme un champ « À : »
 *     de messagerie (Gmail) ;
 *   • **un aperçu chiffré** des destinataires avant l'envoi (Intercom) — on
 *     ne diffuse jamais à l'aveugle ;
 *   • **trois intentions** au lieu de huit types techniques : le type stocké
 *     en base est déduit côté serveur.
 *
 * Le clavier suffit de bout en bout : ↑ ↓ pour parcourir, Entrée pour
 * choisir, Retour arrière pour retirer la dernière pastille, ⌘/Ctrl+Entrée
 * pour envoyer.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, X, Users, User, GraduationCap, Building2, Layers,
  Megaphone, MessageSquare, Hash, Loader2, AlertTriangle, Send, UserCheck,
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

interface AudiencePick {
  scope: AudienceScope;
  group: AudienceGroup;
  label: string;
  sublabel: string;
}

type Suggestion =
  | ({ kind: "person" } & Person)
  | ({ kind: "audience" } & AudiencePick);

interface Preview {
  count: number;
  breakdown: { group: AudienceGroup; count: number }[];
  sansCompte: number;
  truncated: boolean;
  max: number;
}

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------

const INTENTS: { id: Intent; label: string; hint: string; icon: typeof Send }[] = [
  { id: "MESSAGE", label: "Message", hint: "Chacun peut répondre", icon: MessageSquare },
  { id: "ANNONCE", label: "Annonce", hint: "Diffusion, lecture seule", icon: Megaphone },
  { id: "GROUPE", label: "Groupe", hint: "Espace de discussion durable", icon: Hash },
];

const GROUP_LABEL: Record<AudienceGroup, string> = {
  ALL: "Tout le monde",
  PARENTS: "Les parents",
  ELEVES: "Les élèves",
  ENSEIGNANTS: "Les enseignants",
  PERSONNEL: "Le personnel",
  DIRECTION: "La direction",
};

/** Mots que l'utilisateur tape naturellement pour désigner un public. */
const GROUP_KEYWORDS: Record<AudienceGroup, string[]> = {
  ALL: ["tout", "tous", "toute", "monde"],
  PARENTS: ["parent", "parents", "famille", "familles", "tuteur"],
  ELEVES: ["eleve", "eleves", "élève", "élèves", "etudiant"],
  ENSEIGNANTS: ["enseignant", "enseignants", "prof", "profs", "professeur"],
  PERSONNEL: ["personnel", "staff", "equipe", "équipe"],
  DIRECTION: ["direction", "administration", "admin", "secretariat"],
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

/** Comparaison insensible à la casse et aux accents : « eleve » trouve « élève ». */
function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function scopeIcon(kind: AudienceScope["kind"]) {
  switch (kind) {
    case "TENANT": return Building2;
    case "SITE": return Building2;
    case "STRUCTURE": return Layers;
    case "NIVEAU": return Layers;
    case "CLASSE": return GraduationCap;
  }
}

function groupIcon(group: AudienceGroup) {
  switch (group) {
    case "PARENTS": return UserCheck;
    case "ELEVES": return GraduationCap;
    case "ENSEIGNANTS": return Users;
    default: return Users;
  }
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
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TargetingOptions | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [audience, setAudience] = useState<AudiencePick | null>(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Options de ciblage : un seul appel à l'ouverture ---
  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages/audience")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
        return r.json();
      })
      .then((data: TargetingOptions) => { if (!cancelled) setOptions(data); })
      // Les erreurs sont affichées, pas avalées : c'est précisément ce qui
      // rendait l'ancien sélecteur de classe vide et muet.
      .catch((e: Error) => { if (!cancelled) setOptionsError(e.message); });
    return () => { cancelled = true; };
  }, []);

  // --- Recherche de personnes, débouncée et faite côté serveur ---
  useEffect(() => {
    if (audience) { setPeople([]); return; }
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
  }, [query, audience]);

  // --- Aperçu de l'audience ---
  useEffect(() => {
    if (!audience) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    fetch("/api/messages/audience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: audience.scope, group: audience.group }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [audience]);

  // --- Génération des suggestions d'audience ---
  const audienceSuggestions = useMemo<AudiencePick[]>(() => {
    if (!options || audience) return [];
    const q = norm(query);
    const out: AudiencePick[] = [];
    const groups = options.groups;

    // Quel public l'utilisateur est-il en train de nommer ?
    const namedGroups = groups.filter((g) =>
      q.length >= 2 && GROUP_KEYWORDS[g].some((k) => norm(k).startsWith(q) || q.startsWith(norm(k)))
    );
    // Une annonce s'adresse rarement aux élèves seuls : on met les parents en
    // tête, c'est le cas d'usage dominant en établissement.
    const defaultGroups = (namedGroups.length > 0 ? namedGroups : groups).slice(0, 3);

    const push = (scope: AudienceScope, group: AudienceGroup, label: string, sublabel: string) => {
      if (!groups.includes(group)) return;
      out.push({ scope, group, label, sublabel });
    };

    // Classes — la portée la plus utilisée, donc la première proposée.
    if (options.scopes.includes("CLASSE")) {
      const matches = options.classes.filter(
        (c) => !q || norm(c.nom).includes(q) || norm(c.niveau).includes(q) || namedGroups.length > 0
      );
      for (const c of matches.slice(0, q ? 6 : 4)) {
        for (const g of defaultGroups) {
          push({ kind: "CLASSE", id: c.id }, g, `${GROUP_LABEL[g]} de ${c.nom}`, c.niveau);
        }
      }
    }

    // Niveaux
    if (options.scopes.includes("NIVEAU")) {
      const matches = options.niveaux.filter((n) => !q || norm(n).includes(q) || namedGroups.length > 0);
      for (const n of matches.slice(0, q ? 4 : 2)) {
        for (const g of defaultGroups.slice(0, 2)) {
          push({ kind: "NIVEAU", value: n }, g, `${GROUP_LABEL[g]} du niveau ${n}`, "Toutes les classes du niveau");
        }
      }
    }

    // Structures (Maternelle, Primaire, Collège, Lycée)
    if (options.scopes.includes("STRUCTURE")) {
      const matches = options.structures.filter((s) => !q || norm(s.nom).includes(q) || namedGroups.length > 0);
      for (const s of matches.slice(0, 3)) {
        for (const g of defaultGroups.slice(0, 2)) {
          push({ kind: "STRUCTURE", id: s.id }, g, `${GROUP_LABEL[g]} — ${s.nom}`, "Cycle complet");
        }
      }
    }

    // Sites
    if (options.scopes.includes("SITE")) {
      const matches = options.sites.filter((s) => !q || norm(s.nom).includes(q) || namedGroups.length > 0);
      for (const s of matches.slice(0, 3)) {
        for (const g of defaultGroups.slice(0, 2)) {
          push({ kind: "SITE", id: s.id }, g, `${GROUP_LABEL[g]} — ${s.nom}`, "Site entier");
        }
      }
    }

    // Établissement entier — volontairement en dernier : la portée la plus
    // large ne doit jamais être le choix par défaut du curseur.
    if (options.scopes.includes("TENANT")) {
      for (const g of defaultGroups.slice(0, 2)) {
        push({ kind: "TENANT" }, g, `${GROUP_LABEL[g]} — tout l'établissement`, "Toutes classes, tous sites");
      }
    }

    return out.slice(0, 12);
  }, [options, query, audience]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (audience) return [];
    const selected = new Set(selectedPeople.map((p) => p.id));
    return [
      ...audienceSuggestions.map((a) => ({ kind: "audience" as const, ...a })),
      ...people.filter((p) => !selected.has(p.id)).map((p) => ({ kind: "person" as const, ...p })),
    ];
  }, [audienceSuggestions, people, selectedPeople, audience]);

  useEffect(() => { setHighlight(0); }, [query, intent]);

  // --- Sélection ---
  const choose = useCallback((s: Suggestion) => {
    if (s.kind === "person") {
      setSelectedPeople((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]));
    } else {
      // Une audience est exclusive : mélanger « les parents de 6e B » et trois
      // personnes nommées produit une conversation dont plus personne ne sait
      // qui la compose.
      setSelectedPeople([]);
      setAudience({ scope: s.scope, group: s.group, label: s.label, sublabel: s.sublabel });
    }
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && suggestions[highlight]) {
      e.preventDefault();
      choose(suggestions[highlight]);
    } else if (e.key === "Backspace" && query === "") {
      if (audience) setAudience(null);
      else setSelectedPeople((prev) => prev.slice(0, -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  // --- Envoi ---
  const recipientCount = audience ? (preview?.count ?? null) : selectedPeople.length;
  const canSend =
    message.trim().length > 0 &&
    !creating &&
    (audience ? (preview?.count ?? 0) > 0 : selectedPeople.length > 0);

  const handleCreate = async () => {
    if (!canSend) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          firstMessage: message.trim(),
          subject: subject.trim() || undefined,
          ...(audience
            ? { audience: { scope: audience.scope, group: audience.group } }
            : { participantIds: selectedPeople.map((p) => p.id) }),
        }),
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

  const AudienceIcon = audience ? scopeIcon(audience.scope.kind) : Users;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-xl my-auto overflow-hidden border"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleCreate(); }
        }}
      >
        {/* Intention — trois choix, pas huit types techniques */}
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
                <Icon className="h-4 w-4" />
                <span className="font-medium">{it.label}</span>
                <span className="text-[10px] opacity-70 hidden sm:block">{it.hint}</span>
                {active && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3">
          {/* Champ unique : personnes ET audiences */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              À qui ?
            </label>
            <div className="border rounded-lg focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
              <div className="flex flex-wrap items-center gap-1.5 p-1.5">
                {audience && (
                  <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-md pl-2 pr-1 py-1 text-xs font-medium max-w-full">
                    <AudienceIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{audience.label}</span>
                    <button
                      onClick={() => setAudience(null)}
                      className="hover:bg-primary/20 rounded p-0.5 shrink-0"
                      aria-label="Retirer l'audience"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
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
                      aria-label={`Retirer ${p.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1.5 flex-1 min-w-[140px] px-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={
                      audience ? "Audience définie" : "Une classe, un public, ou un nom…"
                    }
                    disabled={!!audience}
                    className="flex-1 bg-transparent outline-none text-sm py-1 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Suggestions */}
              {!audience && (
                <div ref={listRef} className="max-h-64 overflow-y-auto border-t">
                  {optionsError && (
                    <div className="flex items-center gap-2 p-3 text-xs text-destructive">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Ciblage indisponible : {optionsError}
                    </div>
                  )}
                  {!optionsError && suggestions.length === 0 && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      {loadingPeople || !options ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        "Aucun résultat"
                      )}
                    </div>
                  )}
                  {suggestions.map((s, i) => {
                    const active = i === highlight;
                    if (s.kind === "audience") {
                      const Icon = scopeIcon(s.scope.kind);
                      const GIcon = groupIcon(s.group);
                      return (
                        <button
                          key={`a-${s.scope.kind}-${"id" in s.scope ? s.scope.id : "value" in s.scope ? s.scope.value : "t"}-${s.group}`}
                          data-idx={i}
                          onMouseEnter={() => setHighlight(i)}
                          onClick={() => choose(s)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                            active ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <div className="relative shrink-0">
                            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                              <Icon className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <GIcon className="h-3 w-3 absolute -bottom-1 -right-1 bg-background rounded-full p-[1px] text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{s.label}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{s.sublabel}</div>
                          </div>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={`p-${s.id}`}
                        data-idx={i}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => choose(s)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                          active ? "bg-accent" : "hover:bg-accent/50"
                        )}
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={s.avatarUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">{s.name?.[0] ?? "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{s.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {ROLE_LABEL[s.role] ?? s.role}
                          </div>
                        </div>
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Aperçu chiffré — on ne diffuse jamais à l'aveugle */}
            {audience && (
              <div className="mt-2 rounded-lg bg-muted/50 p-2.5 text-xs">
                {previewLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calcul des destinataires…
                  </span>
                ) : preview ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Users className="h-3.5 w-3.5" />
                      {preview.count} destinataire{preview.count > 1 ? "s" : ""}
                    </div>
                    {preview.breakdown.length > 1 && (
                      <div className="flex flex-wrap gap-1">
                        {preview.breakdown.map((b) => (
                          <span key={b.group} className="bg-background rounded px-1.5 py-0.5 text-[11px]">
                            {GROUP_LABEL[b.group]} · {b.count}
                          </span>
                        ))}
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
                  <span className="text-muted-foreground">Aperçu indisponible</span>
                )}
              </div>
            )}
          </div>

          {/* Sujet — utile dès qu'il y a plus de deux personnes */}
          {(audience || selectedPeople.length > 1 || intent !== "MESSAGE") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Objet <span className="opacity-60">(optionnel)</span>
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={audience ? audience.label : "Objet de la conversation"}
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

        {/* Pied : rappel de l'effet + envoi */}
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
