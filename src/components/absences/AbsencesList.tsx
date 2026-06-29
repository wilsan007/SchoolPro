"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils";
import { Search, CheckCircle, XCircle, Clock } from "lucide-react";

interface Absence {
  id: string;
  date: Date;
  motif: string;
  statut: string;
  isRetard: boolean;
  heureDebut: string | null;
  heureFin: string | null;
  commentaire: string | null;
  eleve: {
    nom: string;
    prenom: string;
    photoUrl: string | null;
    classe: { nom: string } | null;
  };
}

const statutIcons = {
  JUSTIFIEE: <CheckCircle className="h-4 w-4 text-green-500" />,
  INJUSTIFIEE: <XCircle className="h-4 w-4 text-red-500" />,
  EN_ATTENTE: <Clock className="h-4 w-4 text-yellow-500" />,
};

const statutVariants = {
  JUSTIFIEE: "success",
  INJUSTIFIEE: "destructive",
  EN_ATTENTE: "warning",
} as const;

const motifLabels: Record<string, string> = {
  INJUSTIFIE: "Injustifié",
  MALADIE: "Maladie",
  FAMILIALE: "Raison familiale",
  TRANSPORT: "Transport",
  AUTRE: "Autre",
};

export function AbsencesList({ absences }: { absences: Absence[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "EN_ATTENTE" | "INJUSTIFIEE" | "JUSTIFIEE">("all");

  const filtered = absences.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.eleve.nom.toLowerCase().includes(q) ||
      a.eleve.prenom.toLowerCase().includes(q) ||
      a.eleve.classe?.nom.toLowerCase().includes(q);
    const matchFilter = filter === "all" || a.statut === filter;
    return matchSearch && matchFilter;
  });

  const tabs = [
    { key: "all", label: "Toutes", count: absences.length },
    { key: "EN_ATTENTE", label: "En attente", count: absences.filter((a) => a.statut === "EN_ATTENTE").length },
    { key: "INJUSTIFIEE", label: "Injustifiées", count: absences.filter((a) => a.statut === "INJUSTIFIEE").length },
    { key: "JUSTIFIEE", label: "Justifiées", count: absences.filter((a) => a.statut === "JUSTIFIEE").length },
  ] as const;

  return (
    <Card>
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher élève..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              variant={filter === tab.key ? "default" : "outline"}
              size="sm"
              className="gap-1.5 h-9"
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                filter === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
                {tab.count}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="divide-y">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Aucune absence trouvée
          </div>
        ) : (
          filtered.map((absence) => (
            <div key={absence.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
              <Avatar className="h-9 w-9 flex-shrink-0">
                {absence.eleve.photoUrl && <AvatarImage src={absence.eleve.photoUrl} />}
                <AvatarFallback className="bg-muted text-xs font-semibold">
                  {getInitials(`${absence.eleve.prenom} ${absence.eleve.nom}`)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">
                    {absence.eleve.prenom} {absence.eleve.nom}
                  </p>
                  {absence.isRetard && (
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0">Retard</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-muted-foreground">
                    {absence.eleve.classe?.nom ?? "Aucune classe"}
                  </p>
                  <span className="text-xs text-muted-foreground">·</span>
                  <p className="text-xs text-muted-foreground">
                    {motifLabels[absence.motif] ?? absence.motif}
                  </p>
                  {absence.heureDebut && (
                    <>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs text-muted-foreground">
                        {absence.heureDebut} – {absence.heureFin ?? "?"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="text-xs text-muted-foreground">{formatDate(absence.date, "dd/MM/yyyy")}</p>
                <div className="flex items-center gap-1.5">
                  {statutIcons[absence.statut as keyof typeof statutIcons]}
                  <Badge variant={statutVariants[absence.statut as keyof typeof statutVariants] ?? "secondary"} className="text-xs">
                    {absence.statut === "JUSTIFIEE" ? "Justifiée"
                      : absence.statut === "INJUSTIFIEE" ? "Injustifiée"
                      : "En attente"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  {absence.statut === "EN_ATTENTE" && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50">
                        Justifier
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50">
                        Refuser
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
