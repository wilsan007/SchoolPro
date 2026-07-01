"use client";

import { useState, useMemo } from "react";
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

const statutLabels = {
  ACTIF: "Actif",
  TRANSFERE: "Transféré",
  DIPLOME: "Diplômé",
  EXCLU: "Exclu",
  ABANDONNE: "Abandonné",
};

export function ElevesTable({ eleves }: { eleves: Eleve[] }) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"nom" | "classe" | "statut">("nom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);
  const [classeFilter, setClasseFilter] = useState<string>("");
  const [statutFilter, setStatutFilter] = useState<string>("");

  const classes = useMemo(
    () => Array.from(new Set(eleves.map((e) => e.classe?.nom).filter(Boolean))).sort(),
    [eleves]
  );
  const statuts = useMemo(
    () => Array.from(new Set(eleves.map((e) => e.statut))).sort(),
    [eleves]
  );

  const filtered = eleves
    .filter((e) => {
      const q = search.toLowerCase();
      const matchesSearch =
        e.nom.toLowerCase().includes(q) ||
        e.prenom.toLowerCase().includes(q) ||
        e.matricule.toLowerCase().includes(q) ||
        e.classe?.nom.toLowerCase().includes(q);
      const matchesClasse = !classeFilter || e.classe?.nom === classeFilter;
      const matchesStatut = !statutFilter || e.statut === statutFilter;
      return matchesSearch && matchesClasse && matchesStatut;
    })
    .sort((a, b) => {
      let va = "", vb = "";
      if (sortField === "nom") { va = a.nom; vb = b.nom; }
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

  return (
    <Card>
      {/* Barre de recherche */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, matricule, classe..."
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
          Filtres
          {(classeFilter || statutFilter) && (
            <span className="ml-1 flex h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
        <p className="text-sm text-muted-foreground ml-auto">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
        </p>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <label htmlFor="classe-filter" className="text-sm text-muted-foreground">Classe</label>
            <select
              id="classe-filter"
              value={classeFilter}
              onChange={(e) => setClasseFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="statut-filter" className="text-sm text-muted-foreground">Statut</label>
            <select
              id="statut-filter"
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Tous</option>
              {statuts.map((s) => (
                <option key={s} value={s}>{statutLabels[s as keyof typeof statutLabels] ?? s}</option>
              ))}
            </select>
          </div>
          {(classeFilter || statutFilter) && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground"
              onClick={() => { setClasseFilter(""); setStatutFilter(""); }}
            >
              <X className="h-4 w-4" />
              Réinitialiser
            </Button>
          )}
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-10">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                <button onClick={() => toggleSort("nom")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Élève <SortIcon field="nom" />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matricule</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                <button onClick={() => toggleSort("classe")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Classe <SortIcon field="classe" />
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Naissance</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Parent/Tuteur</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                <button onClick={() => toggleSort("statut")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Statut <SortIcon field="statut" />
                </button>
              </th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Aucun élève trouvé
                </td>
              </tr>
            ) : (
              filtered.map((eleve, i) => {
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
                            {eleve.sexe === "F" ? "♀" : "♂"} · {eleve.regime ?? "externe"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {eleve.matricule}
                    </td>
                    <td className="px-4 py-3">
                      {eleve.classe ? (
                        <div>
                          <p className="font-medium">{eleve.classe.nom}</p>
                          <p className="text-xs text-muted-foreground">{eleve.classe.niveau}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Non affecté</span>
                      )}
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
                        {statutLabels[eleve.statut as keyof typeof statutLabels] ?? eleve.statut}
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
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
