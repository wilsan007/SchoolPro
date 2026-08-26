"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getSchoolGroup, SCHOOL_GROUP_ORDER, type SchoolGroup } from "@/lib/school-groups";
import { Search, CheckCircle, XCircle, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

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
    classe: { nom: string; niveau: string } | null;
  };
}

const statutIcons = {
  JUSTIFIEE: <CheckCircle className="h-4 w-4 text-[#14b8a6]" />,
  INJUSTIFIEE: <XCircle className="h-4 w-4 text-[#dc2626]" />,
  EN_ATTENTE: <Clock className="h-4 w-4 text-[#9b6fe0]" />,
};

const statutVariants = {
  JUSTIFIEE: "success",
  INJUSTIFIEE: "destructive",
  EN_ATTENTE: "warning",
} as const;

const statutBadgeColors: Record<string, string> = {
  JUSTIFIEE: "bg-[#14b8a6]/10 text-[#0d9488] border-[#14b8a6]/20",
  INJUSTIFIEE: "bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/20",
  EN_ATTENTE: "bg-[#9b6fe0]/10 text-[#7c3aed] border-[#9b6fe0]/20",
};

const motifLabels: Record<string, string> = {
  INJUSTIFIE: "Injustifié",
  MALADIE: "Maladie",
  FAMILIALE: "Raison familiale",
  TRANSPORT: "Transport",
  AUTRE: "Autre",
};

export function AbsencesList({ absences }: { absences: Absence[] }) {
  const t = useTranslations("absences");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "EN_ATTENTE" | "INJUSTIFIEE" | "JUSTIFIEE">("all");
  const [activeGroup, setActiveGroup] = useState<SchoolGroup | null>(null);
  const [activeClass, setActiveClass] = useState<string | null>(null);

  const filtered = absences.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      a.eleve.nom.toLowerCase().includes(q) ||
      a.eleve.prenom.toLowerCase().includes(q) ||
      a.eleve.classe?.nom.toLowerCase().includes(q);
    const matchFilter = filter === "all" || a.statut === filter;
    return matchSearch && matchFilter;
  });

  // Groupement des absences par niveau scolaire, puis par niveau de classe, puis par classe
  const groupedAbsences = SCHOOL_GROUP_ORDER.map((group) => {
    const classesInGroup = new Map<string, Absence[]>();
    for (const abs of filtered) {
      const classeNom = abs.eleve.classe?.nom ?? "Sans classe";
      const niveau = abs.eleve.classe?.niveau ?? "";
      const absGroup = abs.eleve.classe ? getSchoolGroup(niveau, classeNom) : "Autre";
      if (absGroup !== group) continue;
      if (!classesInGroup.has(classeNom)) classesInGroup.set(classeNom, []);
      classesInGroup.get(classeNom)!.push(abs);
    }
    const classesByNiveau = new Map<string, { classe: string; absences: Absence[] }[]>();
    for (const [classe, absences] of Array.from(classesInGroup.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const niveauKey = absences[0]?.eleve.classe?.niveau ?? classe;
      if (!classesByNiveau.has(niveauKey)) classesByNiveau.set(niveauKey, []);
      classesByNiveau.get(niveauKey)!.push({ classe, absences });
    }
    return {
      group,
      classesByNiveau: Array.from(classesByNiveau.entries()).map(([niveau, classes]) => ({ niveau, classes })),
    };
  }).filter((g) => g.classesByNiveau.length > 0);

  const tabs = [
    { key: "all", label: tCommon("all"), count: absences.length },
    { key: "EN_ATTENTE", label: t("pending"), count: absences.filter((a) => a.statut === "EN_ATTENTE").length },
    { key: "INJUSTIFIEE", label: t("unjustified"), count: absences.filter((a) => a.statut === "INJUSTIFIEE").length },
    { key: "JUSTIFIEE", label: t("justified"), count: absences.filter((a) => a.statut === "JUSTIFIEE").length },
  ] as const;

  function renderAbsenceRow(absence: Absence) {
    const statutKey = absence.statut as keyof typeof statutIcons;
    return (
      <div key={absence.id} className="flex items-center gap-3 sm:gap-4 px-4 py-3 hover:bg-[#0ea5e9]/[0.03] transition-all duration-200 border-b border-border/40">
        <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-border/50">
          {absence.eleve.photoUrl && <AvatarImage src={absence.eleve.photoUrl} />}
          <AvatarFallback className="bg-gradient-to-br from-[#0ea5e9]/20 to-[#9b6fe0]/20 text-xs font-semibold text-[#0369a1]">
            {getInitials(`${absence.eleve.prenom} ${absence.eleve.nom}`)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate text-foreground">
              {absence.eleve.prenom} {absence.eleve.nom}
            </p>
            {absence.isRetard && (
              <span className="inline-flex items-center rounded-full bg-[#f59e0b]/10 text-[#d97706] px-2 py-0.5 text-[10px] font-medium border border-[#f59e0b]/20">{t("late")}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {motifLabels[absence.motif] ?? absence.motif}
            </p>
            {absence.heureDebut && (
              <>
                <span className="text-xs text-muted-foreground/60">·</span>
                <p className="text-xs text-muted-foreground font-data">
                  {absence.heureDebut} – {absence.heureFin ?? "?"}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <p className="text-xs text-muted-foreground hidden sm:block font-data">{formatDate(absence.date, "dd/MM/yyyy")}</p>
          <div className="flex items-center gap-1.5">
            {statutIcons[statutKey]}
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${statutBadgeColors[absence.statut] ?? "bg-muted text-muted-foreground border-border"}`}>
              {absence.statut === "JUSTIFIEE" ? t("justified")
                : absence.statut === "INJUSTIFIEE" ? t("unjustified")
                : t("pending")}
            </span>
          </div>
          <div className="flex gap-1">
            {absence.statut === "EN_ATTENTE" && (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-[#14b8a6] hover:text-[#0d9488] hover:bg-[#14b8a6]/10 rounded-lg">
                  {t("justify")}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-[#dc2626] hover:text-red-700 hover:bg-[#dc2626]/10 rounded-lg">
                  {t("refuse")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-bloom overflow-hidden">
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-border/60 bg-bloom-header">
        <div className="relative flex-1 max-w-xs w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchStudent")}
            className="pl-8 h-9 bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                filter === tab.key
                  ? "bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] text-white shadow-[0_4px_12px_hsl(198_65%_46%/0.2)]"
                  : "border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-[#0ea5e9]/5"
              }`}
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
            </button>
          ))}
        </div>
      </div>

      {/* Navigation par onglets horizontaux : Primaire | Collège | Lycée */}
      {groupedAbsences.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t("noAbsences")}
        </div>
      ) : (
        <>
          {/* Onglets groupes scolaires */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-border/60">
            {groupedAbsences.map(({ group, classesByNiveau }) => {
              const totalGroup = classesByNiveau.reduce(
                (s, n) => s + n.classes.reduce((s2, c) => s2 + c.absences.length, 0), 0
              );
              return (
                <button
                  key={group}
                  onClick={() => {
                    setActiveGroup(activeGroup === group ? null : group);
                    setActiveClass(null);
                  }}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-t-xl transition-all duration-200 border-b-2",
                    activeGroup === group
                      ? "border-[#0ea5e9] text-[#0369a1] bg-[#0ea5e9]/5"
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
              {groupedAbsences
                .find((g) => g.group === activeGroup)
                ?.classesByNiveau.map(({ niveau, classes }) => (
                  <div key={niveau} className="flex items-center gap-2 mb-2 last:mb-0">
                    <span className="text-xs font-semibold text-muted-foreground min-w-[60px] flex-shrink-0">
                      {niveau}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {classes.map(({ classe, absences: classeAbsences }) => (
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
                            {classeAbsences.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Liste des absences de la classe sélectionnée */}
          {activeGroup && activeClass && (
            <div className="divide-y">
              {(() => {
                const groupData = groupedAbsences.find((g) => g.group === activeGroup);
                const classData = groupData?.classesByNiveau
                  .flatMap((n) => n.classes)
                  .find((c) => c.classe === activeClass);
                if (!classData) return null;
                return classData.absences.map((absence) => renderAbsenceRow(absence));
              })()}
            </div>
          )}

          {/* Message si aucun groupe/classe sélectionné */}
          {(!activeGroup || !activeClass) && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {!activeGroup
                ? t("selectLevel")
                : t("selectClass")}
            </div>
          )}
        </>
      )}
    </div>
  );
}
