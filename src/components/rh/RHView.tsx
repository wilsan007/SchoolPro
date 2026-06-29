"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Briefcase, Search, Users, Clock, DollarSign,
  BookOpen, Star, ChevronDown, ChevronUp, Calendar,
  Loader2, CheckCircle2, FileText, Edit2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TypeContrat = "CDI" | "CDD" | "VACATAIRE" | "FONCTIONNAIRE" | "STAGIAIRE";

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const CONTRAT_CONFIG: Record<TypeContrat, { label: string; color: string }> = {
  CDI: { label: "CDI", color: "bg-green-50 text-green-700 border-green-200" },
  CDD: { label: "CDD", color: "bg-blue-50 text-blue-700 border-blue-200" },
  VACATAIRE: { label: "Vacataire", color: "bg-orange-50 text-orange-700 border-orange-200" },
  FONCTIONNAIRE: { label: "Fonctionnaire", color: "bg-purple-50 text-purple-700 border-purple-200" },
  STAGIAIRE: { label: "Stagiaire", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

interface BulletinPaie {
  id: string;
  mois: number;
  annee: number;
  heuresEffectuees: number;
  salaireBase: number;
  netAPayer: number;
  isPaye: boolean;
}

interface FicheRH {
  id: string;
  typeContrat: TypeContrat;
  salaireBase: number | null;
  tarifHoraire: number | null;
  diplome: string | null;
  echelon: number;
  grade: string | null;
  evaluation: string | null;
  congesAnnuels: number;
  congesPris: number;
  bulletinsPaie: BulletinPaie[];
}

interface EmploiTempsItem {
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiere: { nom: string; couleur: string | null };
  classe: { nom: string };
}

interface EnseignantRH {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    phone: string | null;
    isActive: boolean;
  };
  specialite: string | null;
  typeContrat: string | null;
  ficheRH: FicheRH | null;
  emploiTemps: EmploiTempsItem[];
  classesPrincipales: { id: string; nom: string; niveau: string }[];
}

// ─── Calcul heures hebdo ──────────────────────────────────────────────────────

function calcHeuresHebdo(emploiTemps: EmploiTempsItem[]): number {
  const totalMinutes = emploiTemps.reduce((sum, et) => {
    const [hd, md] = et.heureDebut.split(":").map(Number);
    const [hf, mf] = et.heureFin.split(":").map(Number);
    return sum + (hf * 60 + mf) - (hd * 60 + md);
  }, 0);
  return Math.round(totalMinutes / 60 * 10) / 10;
}

// ─── Carte enseignant RH ──────────────────────────────────────────────────────

function EnseignantRHCard({
  enseignant,
  onUpdate,
}: {
  enseignant: EnseignantRH;
  onUpdate: (id: string, ficheRH: FicheRH) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [generatingPaie, setGeneratingPaie] = useState(false);

  const heuresHebdo = calcHeuresHebdo(enseignant.emploiTemps);
  const ficheRH = enseignant.ficheRH;
  const contrat = ficheRH?.typeContrat ?? (enseignant.typeContrat as TypeContrat | null);
  const contratConfig = contrat ? CONTRAT_CONFIG[contrat] : null;

  const now = new Date();
  const moisActuel = now.getMonth() + 1;
  const anneeActuelle = now.getFullYear();

  const handleGenererPaie = () => {
    startTransition(async () => {
      setGeneratingPaie(true);
      try {
        const res = await fetch(`/api/rh/${enseignant.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mois: moisActuel, annee: anneeActuelle }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Bulletin de paie ${MOIS_FR[moisActuel - 1]} généré`);
        // Refresh simple
        window.location.reload();
      } catch {
        toast.error("Erreur lors de la génération");
      } finally {
        setGeneratingPaie(false);
      }
    });
  };

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {/* En-tête */}
        <div className="flex items-start gap-4">
          <Avatar className="h-11 w-11 flex-shrink-0">
            {enseignant.user.avatarUrl && (
              <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-semibold">
                {getInitials(enseignant.user.name)}
              </AvatarFallback>
            )}
            <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-semibold">
              {getInitials(enseignant.user.name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                  {enseignant.user.name}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {enseignant.specialite ?? "Matière non définie"}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {contratConfig && (
                  <Badge className={cn("text-xs", contratConfig.color)}>
                    {contratConfig.label}
                  </Badge>
                )}
                <Badge className={cn(
                  "text-xs",
                  enseignant.user.isActive
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                )}>
                  {enseignant.user.isActive ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>

            {/* Stats rapides */}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="font-medium text-gray-700 dark:text-gray-300">{heuresHebdo}h</span>/sem
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {enseignant.emploiTemps.length} créneaux
              </span>
              {ficheRH?.salaireBase && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {formatCurrency(ficheRH.salaireBase)}
                </span>
              )}
              {ficheRH?.grade && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500" />
                  {ficheRH.grade}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Classes principales */}
        {enseignant.classesPrincipales.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {enseignant.classesPrincipales.map((c) => (
              <Badge key={c.id} className="text-xs bg-primary/10 text-primary border-primary/20">
                PP {c.nom}
              </Badge>
            ))}
          </div>
        )}

        {/* Emploi du temps résumé */}
        {enseignant.emploiTemps.length > 0 && (
          <div className="mt-3 space-y-1">
            {enseignant.emploiTemps.slice(0, 3).map((et, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-primary/40 flex-shrink-0" />
                <span className="font-medium text-gray-600 dark:text-gray-400 capitalize">
                  {et.jour.charAt(0) + et.jour.slice(1).toLowerCase()}
                </span>
                <span>{et.heureDebut}–{et.heureFin}</span>
                <span>•</span>
                <span>{et.matiere.nom}</span>
                <span>•</span>
                <span>{et.classe.nom}</span>
              </div>
            ))}
            {enseignant.emploiTemps.length > 3 && (
              <p className="text-xs text-gray-400 pl-4">
                +{enseignant.emploiTemps.length - 3} autre{enseignant.emploiTemps.length - 3 > 1 ? "s" : ""}…
              </p>
            )}
          </div>
        )}

        {/* Section paie (dépliable) */}
        <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Bulletins de paie ({ficheRH?.bulletinsPaie.length ?? 0})
            </span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              {ficheRH?.bulletinsPaie && ficheRH.bulletinsPaie.length > 0 ? (
                ficheRH.bulletinsPaie.map((bp) => (
                  <div
                    key={bp.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs"
                  >
                    <span className="text-gray-600 dark:text-gray-400">
                      {MOIS_FR[bp.mois - 1]} {bp.annee}
                    </span>
                    <span className="text-gray-500">{bp.heuresEffectuees}h effectuées</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(bp.netAPayer)}
                    </span>
                    <Badge className={cn(
                      "text-xs",
                      bp.isPaye
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-orange-50 text-orange-600 border-orange-200"
                    )}>
                      {bp.isPaye ? "Payé" : "En attente"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 py-2 text-center">Aucun bulletin généré</p>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={handleGenererPaie}
                disabled={generatingPaie}
                className="w-full gap-2 text-xs mt-2"
              >
                {generatingPaie ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Calendar className="w-3.5 h-3.5" />
                )}
                Générer bulletin {MOIS_FR[moisActuel - 1]}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface RHViewProps {
  enseignants: EnseignantRH[];
}

export function RHView({ enseignants: initial }: RHViewProps) {
  const [enseignants, setEnseignants] = useState<EnseignantRH[]>(initial);
  const [search, setSearch] = useState("");
  const [filtreContrat, setFiltreContrat] = useState<TypeContrat | "TOUS">("TOUS");

  const stats = useMemo(() => {
    const totalHeures = enseignants.reduce((s, e) => s + calcHeuresHebdo(e.emploiTemps), 0);
    const avecFiche = enseignants.filter((e) => e.ficheRH).length;
    const masseTotal = enseignants.reduce((s, e) => s + (e.ficheRH?.salaireBase ?? 0), 0);
    return {
      total: enseignants.length,
      actifs: enseignants.filter((e) => e.user.isActive).length,
      totalHeures: Math.round(totalHeures * 10) / 10,
      avecFiche,
      masseTotal,
    };
  }, [enseignants]);

  const filtered = useMemo(() => {
    return enseignants.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        `${e.user.name} ${e.user.email} ${e.specialite ?? ""}`.toLowerCase().includes(q);
      const contrat = e.ficheRH?.typeContrat ?? e.typeContrat;
      const matchContrat = filtreContrat === "TOUS" || contrat === filtreContrat;
      return matchSearch && matchContrat;
    });
  }, [enseignants, search, filtreContrat]);

  const handleUpdate = (id: string, ficheRH: FicheRH) => {
    setEnseignants((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ficheRH } : e))
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Enseignants</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.total}</p>
                <p className="text-xs text-gray-400">{stats.actifs} actifs</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Heures/semaine</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.totalHeures}h</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Fiches RH</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.avecFiche}</p>
                <p className="text-xs text-gray-400">sur {stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Masse salariale</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                  {formatCurrency(stats.masseTotal)}
                </p>
                <p className="text-xs text-gray-400">par mois</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un enseignant…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["TOUS", "CDI", "CDD", "VACATAIRE", "FONCTIONNAIRE"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltreContrat(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    filtreContrat === f
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                  )}
                >
                  {f === "TOUS" ? "Tous" : CONTRAT_CONFIG[f as TypeContrat].label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucun enseignant trouvé</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((e) => (
            <EnseignantRHCard key={e.id} enseignant={e} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
