"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { getInitials, formatDate } from "@/lib/utils";
import {
  Search, Filter, Eye, Edit, MoreHorizontal,
  ChevronUp, ChevronDown, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSchoolGroup, SCHOOL_GROUP_ORDER, type SchoolGroup } from "@/lib/school-groups";
import { useTranslations } from "next-intl";
import type { SiteColor } from "@/lib/site-colors";
import { CascadeClassFilter } from "@/components/classes/CascadeClassFilter";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

interface Eleve {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  dateNaissance: Date;
  sexe: string;
  statut: string;
  regime: string | null;
  photoUrl: string | null;
  classe: { id: string; nom: string; niveau: string; site: { id: string; nom: string } | null } | null;
  parents: Array<{
    parent: { nom: string; prenom: string; phone: string };
  }>;
}

const statutColors = {
  ACTIF: "success",
  TRANSFERE: "info",
  DIPLOME: "secondary",
  EXCLU: "destructive",
  ABANDONNE: "warning",
} as const;

const STATUT_CODES = ["ACTIF", "TRANSFERE", "DIPLOME", "EXCLU", "ABANDONNE"] as const;

interface ElevesTableProps {
  eleves: Eleve[];
  total: number;
  /**
   * Effectif réel de chaque classe, mesuré en base (nom de classe → nombre).
   *
   * Indispensable : `eleves` est plafonné à 500 lignes côté serveur, donc
   * compter les éléments chargés sous-estimerait les effectifs sans le dire.
   */
  effectifs?: Record<string, number>;
  classes: { id: string; nom: string; siteNom: string | null }[];
  /** Hiérarchie des classes (catégorie → niveau → classe) pour les filtres cascade. */
  hierarchie?: ClassesHierarchie;
  siteColors: Record<string, SiteColor>;
  initialQuery: string;
  initialClasse: string;
  initialStatut: string;
}

export function ElevesTable({ eleves, total, effectifs, classes, hierarchie, siteColors, initialQuery, initialClasse, initialStatut }: ElevesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("eleves");
  const tCommon = useTranslations("common");
  const tStatut = useTranslations("eleveDetail");

  const [search, setSearch] = useState(initialQuery);
  const [sortField, setSortField] = useState<"prenom" | "classe" | "statut">("prenom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(Boolean(initialClasse || initialStatut));
  const [activeGroup, setActiveGroup] = useState<SchoolGroup | null>(null);
  const [activeSite, setActiveSite] = useState<string | "all">("all");
  const [activeClass, setActiveClass] = useState<string | null>(null);

  // Recherche : mise à jour de l'URL avec un debounce
  useEffect(() => {
    if (search === initialQuery) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set("q", search);
      else params.delete("q");
      router.push(`?${params.toString()}`);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setFilter(key: "classeId" | "statut", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  }

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("classeId");
    params.delete("statut");
    router.push(`?${params.toString()}`);
  }

  const sorted = [...eleves].sort((a, b) => {
    let va = "", vb = "";
    if (sortField === "prenom") { va = a.prenom; vb = b.prenom; }
    else if (sortField === "classe") { va = a.classe?.nom ?? ""; vb = b.classe?.nom ?? ""; }
    else { va = a.statut; vb = b.statut; }
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: typeof sortField }) {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-20" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />;
  }

  /**
   * Effectif à afficher pour une classe : la mesure faite en base si elle est
   * disponible, sinon le nombre de lignes chargées. Sans filtre d'écran, les
   * deux coïncident ; avec un filtre, la mesure serveur reste la référence.
   */
  const effectifDe = (classeId: string, charges: number) => effectifs?.[classeId] ?? charges;

  // Groupement des élèves par niveau scolaire, puis par niveau de classe, puis par classe.
  // La cle de regroupement est l'id de la classe pour distinguer deux classes
  // homonymes situees sur des sites differents.
  const groupedEleves = SCHOOL_GROUP_ORDER.map((group) => {
    const classesInGroup = new Map<string, { nom: string; niveau: string; siteId: string | null; siteNom: string | null; eleves: Eleve[] }>();
    for (const eleve of sorted) {
      const classe = eleve.classe;
      const eleveGroup = classe ? getSchoolGroup(classe.niveau, classe.nom) : "Autre";
      if (eleveGroup !== group) continue;

      const key = classe?.id ?? "__sans_classe__";
      if (!classesInGroup.has(key)) {
        classesInGroup.set(key, {
          nom: classe?.nom ?? "Sans classe",
          niveau: classe?.niveau ?? "",
          siteId: classe?.site?.id ?? null,
          siteNom: classe?.site?.nom ?? null,
          eleves: [],
        });
      }
      classesInGroup.get(key)!.eleves.push(eleve);
    }
    // Regrouper les classes par niveau (ex: toutes les 6ème A/B/C ensemble)
    const classesByNiveau = new Map<string, { id: string; nom: string; niveau: string; siteId: string | null; siteNom: string | null; eleves: Eleve[] }[]>();
    for (const [id, data] of Array.from(classesInGroup.entries()).sort((a, b) => a[1].nom.localeCompare(b[1].nom))) {
      const niveauKey = data.eleves[0]?.classe?.niveau ?? data.nom;
      if (!classesByNiveau.has(niveauKey)) classesByNiveau.set(niveauKey, []);
      classesByNiveau.get(niveauKey)!.push({ id, nom: data.nom, niveau: data.niveau, siteId: data.siteId, siteNom: data.siteNom, eleves: data.eleves });
    }
    return {
      group,
      classesByNiveau: Array.from(classesByNiveau.entries()).map(([niveau, classes]) => ({ niveau, classes })),
    };
  }).filter((g) => g.classesByNiveau.length > 0);

  const activeGroupData = activeGroup ? groupedEleves.find((g) => g.group === activeGroup) : undefined;

  const siteOptions = activeGroupData
    ? (() => {
        const map = new Map<string, { siteId: string; siteNom: string; count: number }>();
        let total = 0;
        for (const n of activeGroupData.classesByNiveau) {
          for (const c of n.classes) {
            const key = c.siteId ?? "__none__";
            const existing = map.get(key);
            if (!existing) {
              map.set(key, { siteId: key, siteNom: c.siteNom ?? "Sans site", count: 0 });
            }
            const count = effectifDe(c.id, c.eleves.length);
            map.get(key)!.count += count;
            total += count;
          }
        }
        const all = [{ siteId: "all" as const, siteNom: tCommon("all"), count: total }];
        const sites = Array.from(map.values()).sort((a, b) => a.siteNom.localeCompare(b.siteNom));
        return [...all, ...sites];
      })()
    : [];

  const fallbackColor: SiteColor = { base: "#6b7280", light: "#f3f4f6", border: "#e5e7eb", text: "#374151" };

  const classesBySite = activeGroupData
    ? (() => {
        const map = new Map<string, { siteId: string; siteNom: string | null; color: SiteColor; classes: { id: string; nom: string; niveau: string; siteId: string | null; siteNom: string | null; eleves: Eleve[] }[] }>();
        for (const n of activeGroupData.classesByNiveau) {
          for (const c of n.classes) {
            const key = c.siteId ?? "__none__";
            const color = c.siteId ? (siteColors[c.siteId] ?? fallbackColor) : fallbackColor;
            if (!map.has(key)) {
              map.set(key, { siteId: key, siteNom: c.siteNom, color, classes: [] });
            }
            map.get(key)!.classes.push(c);
          }
        }
        return Array.from(map.values()).sort((a, b) => (a.siteNom ?? "").localeCompare(b.siteNom ?? ""));
      })()
    : [];

  const filteredClassesByNiveau = activeGroupData
    ? activeGroupData.classesByNiveau
        .map(({ niveau, classes }) => ({
          niveau,
          classes: activeSite === "all" ? classes : classes.filter((c) => (c.siteId ?? "__none__") === activeSite),
        }))
        .filter((n) => n.classes.length > 0)
    : [];

  const displayedEleves = sorted.filter((e) => {
    if (!activeGroup) return false;
    const eleveGroup = e.classe ? getSchoolGroup(e.classe.niveau, e.classe.nom) : "Autre";
    if (eleveGroup !== activeGroup) return false;
    const eleveSiteId = e.classe?.site?.id ?? "__none__";
    if (activeSite !== "all" && eleveSiteId !== activeSite) return false;
    if (activeClass && e.classe?.id !== activeClass) return false;
    return true;
  });

  return (
    <Card>
      {/* Barre de recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            <Filter className="h-4 w-4" />
            {tCommon("filter")}
            {(initialClasse || initialStatut) && (
              <span className="ml-1 flex h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
          <p className="text-sm text-muted-foreground ml-auto">
            {total}
          </p>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 px-4 pb-4 border-b">
          {/* Filtre classe : cascade catégorie → niveau → classe si hiérarchie disponible */}
          {hierarchie && hierarchie.length > 0 ? (
            <CascadeClassFilter
              hierarchie={hierarchie}
              initialClasseId={initialClasse || null}
              onChange={({ classeId }) => setFilter("classeId", classeId ?? "")}
            />
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor="classe-filter" className="text-sm text-muted-foreground">{tCommon("class")}</label>
              <select
                id="classe-filter"
                value={initialClasse}
                onChange={(e) => setFilter("classeId", e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{tCommon("all")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}{c.siteNom ? ` — ${c.siteNom}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="statut-filter" className="text-sm text-muted-foreground">{tCommon("status")}</label>
            <select
              id="statut-filter"
              value={initialStatut}
              onChange={(e) => setFilter("statut", e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{tCommon("all")}</option>
              {STATUT_CODES.map((s) => (
                <option key={s} value={s}>{tStatut(`statut${s}`)}</option>
              ))}
            </select>
          </div>
          {(initialClasse || initialStatut) && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={resetFilters}
            >
              <X className="h-4 w-4" />
              {tCommon("reset")}
            </Button>
          )}
        </div>
      )}

      {/* Navigation par onglets horizontaux : Primaire | Collège | Lycée */}
      {groupedEleves.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t("noStudents")}
        </div>
      ) : (
        <>
          {/* Onglets groupes scolaires */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b overflow-x-auto">
            {groupedEleves.map(({ group, classesByNiveau }) => {
              const totalGroup = classesByNiveau.reduce(
                (s, n) => s + n.classes.reduce((s2, c) => s2 + effectifDe(c.id, c.eleves.length), 0), 0
              );
              return (
                <button
                  key={group}
                  onClick={() => {
                    setActiveGroup(activeGroup === group ? null : group);
                    setActiveSite("all");
                    setActiveClass(null);
                  }}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2",
                    activeGroup === group
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  {group}
                  <span className="ml-1.5 text-xs opacity-70">({totalGroup})</span>
                </button>
              );
            })}
          </div>

          {/* Sous-onglets par site */}
          {activeGroup && (
            <div className="flex items-center gap-1 px-4 pt-3 border-b bg-muted/20 overflow-x-auto">
              {siteOptions.map((site) => {
                const color = site.siteId === "all" ? undefined : (siteColors[site.siteId] ?? fallbackColor);
                const isActive = activeSite === site.siteId;
                const isAll = site.siteId === "all";
                return (
                  <button
                    key={site.siteId}
                    onClick={() => {
                      setActiveSite(site.siteId);
                      setActiveClass(null);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-b-2",
                      isActive ? "bg-background" : "hover:bg-muted/40",
                      isAll && isActive ? "border-primary text-primary" : "",
                      isAll && !isActive ? "text-muted-foreground" : ""
                    )}
                    style={
                      color
                        ? { color: color.text, borderColor: isActive ? color.base : "transparent" }
                        : undefined
                    }
                  >
                    {site.siteNom}
                    <span className="ml-1.5 text-[10px] opacity-70">({site.count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Blocs de classes par site */}
          {activeGroup && (
            <div className="px-4 py-3 border-b bg-muted/20">
              {activeSite === "all" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {classesBySite.map((site) => {
                    const niveaux = new Map<string, typeof site.classes>();
                    for (const c of site.classes) {
                      if (!niveaux.has(c.niveau)) niveaux.set(c.niveau, []);
                      niveaux.get(c.niveau)!.push(c);
                    }
                    const niveauEntries = Array.from(niveaux.entries()).sort(([a], [b]) => a.localeCompare(b));
                    return (
                      <div
                        key={site.siteId}
                        className="rounded-lg border p-3"
                        style={{ borderColor: site.color.border, backgroundColor: site.color.light }}
                      >
                        <div className="mb-2 text-sm font-semibold" style={{ color: site.color.text }}>
                          {site.siteNom ?? "Sans site"}
                          <span className="ml-1.5 text-[10px] opacity-80">
                            ({site.classes.reduce((s, c) => s + effectifDe(c.id, c.eleves.length), 0)})
                          </span>
                        </div>
                        <div className="space-y-2">
                          {niveauEntries.map(([niveau, classes]) => (
                            <div key={niveau} className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-foreground min-w-[60px] flex-shrink-0">
                                {niveau}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {classes.map(({ id, nom, eleves: classeEleves }) => (
                                  <button
                                    key={id}
                                    onClick={() => setActiveClass(activeClass === id ? null : id)}
                                    className={cn(
                                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                                      activeClass === id ? "shadow-sm" : "hover:bg-white/60"
                                    )}
                                    style={
                                      activeClass === id
                                        ? { backgroundColor: site.color.base, borderColor: site.color.base, color: "#fff" }
                                        : { borderColor: site.color.border, color: site.color.text }
                                    }
                                  >
                                    {nom}
                                    <span className="ml-1.5 text-[10px] opacity-80">
                                      {effectifDe(id, classeEleves.length)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                filteredClassesByNiveau.map(({ niveau, classes }) => {
                  const siteColor = siteColors[activeSite] ?? fallbackColor;
                  return (
                    <div key={niveau} className="flex items-center gap-2 mb-2 last:mb-0">
                      <span className="text-xs font-semibold text-muted-foreground min-w-[60px] flex-shrink-0">
                        {niveau}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {classes.map(({ id, nom, eleves: classeEleves }) => (
                          <button
                            key={id}
                            onClick={() => setActiveClass(activeClass === id ? null : id)}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                              activeClass === id ? "shadow-sm" : "hover:bg-white/60"
                            )}
                            style={
                              activeClass === id
                                ? { backgroundColor: siteColor.base, borderColor: siteColor.base, color: "#fff" }
                                : { borderColor: siteColor.border, color: siteColor.text }
                            }
                          >
                            {nom}
                            <span className="ml-1.5 text-[10px] opacity-80">
                              {effectifDe(id, classeEleves.length)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tableau des élèves du site / de la classe sélectionnés */}
          {activeGroup && displayedEleves.length > 0 && (
            <div className="overflow-x-auto p-2">
              <div className="px-4 py-2 text-sm font-medium text-muted-foreground">
                {displayedEleves.length} élève{displayedEleves.length > 1 ? "s" : ""}
                {activeSite !== "all" ? ` — ${siteOptions.find((s) => s.siteId === activeSite)?.siteNom ?? ""}` : ""}
                {activeClass ? ` — ${filteredClassesByNiveau.flatMap((n) => n.classes).find((c) => c.id === activeClass)?.nom ?? ""}` : ""}
              </div>
              <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-10">#</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                          <button onClick={() => toggleSort("prenom")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {t("etColStudent")} <SortIcon field="prenom" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">{t("etColMatricule")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">{t("etColBirth")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">{t("etColClasse")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">{t("etColParent")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">
                          <button onClick={() => toggleSort("statut")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {t("etColStatus")} <SortIcon field="statut" />
                          </button>
                        </th>
                        <th className="px-4 py-2 w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {displayedEleves.map((eleve, i) => {
                        const tuteur = eleve.parents[0]?.parent;
                        return (
                          <tr
                            key={eleve.id}
                            className={cn(
                              "border-b last:border-0 hover:bg-muted/30 transition-colors",
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            )}
                          >
                            <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  {eleve.photoUrl && <AvatarImage src={eleve.photoUrl} />}
                                  <AvatarFallback className={cn(
                                    "text-xs font-semibold",
                                    eleve.sexe === "F"
                                      ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                  )}>
                                    {getInitials(`${eleve.prenom} ${eleve.nom}`)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{eleve.prenom} {eleve.nom}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {eleve.sexe === "F" ? "♀" : "♂"} · {eleve.regime ?? t("etExternal")}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                              {eleve.matricule}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                              {formatDate(eleve.dateNaissance)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {eleve.classe ? (
                                <span>
                                  {eleve.classe.nom}
                                  {eleve.classe.site && activeSite === "all" ? (
                                    (() => {
                                      const siteColor = siteColors[eleve.classe.site.id] ?? fallbackColor;
                                      return (
                                        <span
                                          className="ml-1 text-[10px]"
                                          style={{ color: siteColor?.text }}
                                        >
                                          ({eleve.classe.site.nom})
                                        </span>
                                      );
                                    })()
                                  ) : null}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {tuteur ? (
                                <div>
                                  <p className="font-medium text-sm">{tuteur.prenom} {tuteur.nom}</p>
                                  <p className="text-xs text-muted-foreground">{tuteur.phone}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <Badge variant={statutColors[eleve.statut as keyof typeof statutColors] ?? "secondary"}>
                                {tStatut.has(`statut${eleve.statut}`) ? tStatut(`statut${eleve.statut}`) : eleve.statut}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href={`/eleves/${eleve.id}`}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href={`/eleves/${eleve.id}`}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
            </div>
          )}

          {/* Message si aucun groupe sélectionné */}
          {!activeGroup && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {t("selectLevelForClasses")}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
