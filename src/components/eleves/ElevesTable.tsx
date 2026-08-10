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
  classe: { nom: string; niveau: string } | null;
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
  classes: string[];
  initialQuery: string;
  initialClasse: string;
  initialStatut: string;
}

export function ElevesTable({ eleves, total, effectifs, classes, initialQuery, initialClasse, initialStatut }: ElevesTableProps) {
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
  const effectifDe = (classe: string, charges: number) => effectifs?.[classe] ?? charges;

  // Groupement des élèves par niveau scolaire, puis par niveau de classe, puis par classe
  const groupedEleves = SCHOOL_GROUP_ORDER.map((group) => {
    const classesInGroup = new Map<string, Eleve[]>();
    for (const eleve of sorted) {
      const classeNom = eleve.classe?.nom ?? "Sans classe";
      const niveau = eleve.classe?.niveau ?? "";
      const eleveGroup = eleve.classe ? getSchoolGroup(niveau, classeNom) : "Autre";
      if (eleveGroup !== group) continue;
      if (!classesInGroup.has(classeNom)) classesInGroup.set(classeNom, []);
      classesInGroup.get(classeNom)!.push(eleve);
    }
    // Regrouper les classes par niveau (ex: toutes les 6ème A/B/C ensemble)
    const classesByNiveau = new Map<string, { classe: string; eleves: Eleve[] }[]>();
    for (const [classe, eleves] of Array.from(classesInGroup.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const niveauKey = eleves[0]?.classe?.niveau ?? classe;
      if (!classesByNiveau.has(niveauKey)) classesByNiveau.set(niveauKey, []);
      classesByNiveau.get(niveauKey)!.push({ classe, eleves });
    }
    return {
      group,
      classesByNiveau: Array.from(classesByNiveau.entries()).map(([niveau, classes]) => ({ niveau, classes })),
    };
  }).filter((g) => g.classesByNiveau.length > 0);

  return (
    <Card>
      {/* Barre de recherche */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4 border-b">
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
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
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
          <div className="flex items-center gap-1 px-4 pt-3 border-b">
            {groupedEleves.map(({ group, classesByNiveau }) => {
              const totalGroup = classesByNiveau.reduce(
                (s, n) => s + n.classes.reduce((s2, c) => s2 + effectifDe(c.classe, c.eleves.length), 0), 0
              );
              return (
                <button
                  key={group}
                  onClick={() => {
                    setActiveGroup(activeGroup === group ? null : group);
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

          {/* Boutons de classes horizontaux, regroupés par niveau */}
          {activeGroup && (
            <div className="px-4 py-3 border-b bg-muted/20">
              {groupedEleves
                .find((g) => g.group === activeGroup)
                ?.classesByNiveau.map(({ niveau, classes }) => (
                  <div key={niveau} className="flex items-center gap-2 mb-2 last:mb-0">
                    <span className="text-xs font-semibold text-muted-foreground min-w-[60px] flex-shrink-0">
                      {niveau}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {classes.map(({ classe, eleves: classeEleves }) => (
                        <button
                          key={classe}
                          onClick={() => setActiveClass(activeClass === classe ? null : classe)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-lg transition-all border",
                            activeClass === classe
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background border-border hover:border-primary/40 hover:bg-accent"
                          )}
                        >
                          {classe}
                          <span className={cn(
                            "ml-1.5 text-[10px]",
                            activeClass === classe ? "opacity-80" : "text-muted-foreground"
                          )}>
                            {effectifDe(classe, classeEleves.length)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Tableau des élèves de la classe sélectionnée */}
          {activeGroup && activeClass && (
            <div className="overflow-x-auto">
              {(() => {
                const groupData = groupedEleves.find((g) => g.group === activeGroup);
                const classData = groupData?.classesByNiveau
                  .flatMap((n) => n.classes)
                  .find((c) => c.classe === activeClass);
                if (!classData) return null;
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground w-10">#</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                          <button onClick={() => toggleSort("prenom")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {t("etColStudent")} <SortIcon field="prenom" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">{t("etColMatricule")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">{t("etColBirth")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">{t("etColParent")}</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                          <button onClick={() => toggleSort("statut")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            {t("etColStatus")} <SortIcon field="statut" />
                          </button>
                        </th>
                        <th className="px-4 py-2 w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {classData.eleves.map((eleve, i) => {
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
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {eleve.matricule}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(eleve.dateNaissance)}
                            </td>
                            <td className="px-4 py-3">
                              {tuteur ? (
                                <div>
                                  <p className="font-medium text-sm">{tuteur.prenom} {tuteur.nom}</p>
                                  <p className="text-xs text-muted-foreground">{tuteur.phone}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
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
                );
              })()}
            </div>
          )}

          {/* Message si aucun groupe/classe sélectionné */}
          {(!activeGroup || !activeClass) && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {!activeGroup
                ? t("selectLevelForClasses")
                : t("selectClassForStudents")}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
