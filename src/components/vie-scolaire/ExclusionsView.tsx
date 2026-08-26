"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle2, Clock, CalendarClock, BookOpen,
  Loader2, MailCheck, UserCheck, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";

type EtatExclusion = "EN_COURS" | "A_VENIR" | "CLOSE";
type TypeExclusion = "EXCLUSION_COURS" | "EXCLUSION_TEMP";

const TYPE_LABELS: Record<TypeExclusion, string> = {
  EXCLUSION_COURS: "Exclusion de cours",
  EXCLUSION_TEMP: "Exclusion temporaire",
};

const ETAT_CONFIG: Record<
  EtatExclusion,
  { label: string; variant: "destructive" | "warning" | "success" | "outline"; icon: React.ReactNode }
> = {
  EN_COURS: { label: "En cours", variant: "destructive", icon: <AlertTriangle className="w-3 h-3" /> },
  A_VENIR: { label: "À venir", variant: "warning", icon: <CalendarClock className="w-3 h-3" /> },
  CLOSE: { label: "Réintégré", variant: "success", icon: <CheckCircle2 className="w-3 h-3" /> },
};

interface Exclusion {
  id: string;
  type: string;
  description: string | null;
  dateDebut: string;
  dateFin: string | null;
  dateRetourEffective: string | null;
  travailDonne: string | null;
  parentNotifie: boolean;
  accuseReceptionParent: string | null;
  reintegrePar: string | null;
  incident: {
    id: string;
    type: string;
    gravite: number;
    date: string;
    description: string;
    eleve: {
      id: string;
      nom: string;
      prenom: string;
      matricule: string;
      classe: { id: string; nom: string } | null;
    };
  };
  etat: EtatExclusion;
  joursRetardReintegration: number;
}

function StatCard({
  label,
  valeur,
  icone,
  alerte,
}: {
  label: string;
  valeur: number;
  icone: React.ReactNode;
  alerte?: boolean;
}) {
  return (
    <Card className={cn(alerte && valeur > 0 && "border-red-300 bg-red-50/50")}>
      <CardContent className="pt-5 pb-4 flex items-center gap-3">
        <div
          className={cn(
            "rounded-lg p-2",
            alerte && valeur > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"
          )}
        >
          {icone}
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{valeur}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Panneau de traitement d'une exclusion ouverte : renseigner la continuité
 * pédagogique, enregistrer l'accusé de réception du parent, puis réintégrer.
 */
function PanneauTraitement({
  exclusion,
  onMaj,
}: {
  exclusion: Exclusion;
  onMaj: (maj: Partial<Exclusion>) => void;
}) {
  const [travail, setTravail] = useState(exclusion.travailDonne ?? "");
  const [enCours, setEnCours] = useState<null | "travail" | "accuse" | "reintegrer">(null);

  async function appeler(
    corps: Record<string, unknown>,
    action: "travail" | "accuse" | "reintegrer",
    succes: string
  ) {
    setEnCours(action);
    try {
      const res = await fetch(`/api/vie-scolaire/exclusions/${exclusion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Échec de l'enregistrement");
        return;
      }
      toast.success(succes);
      onMaj({
        travailDonne: data.travailDonne,
        accuseReceptionParent: data.accuseReceptionParent,
        dateRetourEffective: data.dateRetourEffective,
        reintegrePar: data.reintegrePar?.name ?? null,
        etat: data.dateRetourEffective ? "CLOSE" : exclusion.etat,
      });
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="border-t bg-slate-50/70 px-4 py-4 space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          Continuité pédagogique — travail donné à l&apos;élève
        </label>
        <textarea
          value={travail}
          onChange={(e) => setTravail(e.target.value)}
          rows={3}
          placeholder="Ex : exercices 12 à 18 p.94 en mathématiques, lecture du chapitre 3 en français…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            Obligatoire avant toute réintégration.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours !== null || travail.trim().length < 5}
            onClick={() =>
              appeler({ travailDonne: travail }, "travail", "Travail enregistré")
            }
          >
            {enCours === "travail" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Enregistrer le travail"
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {exclusion.accuseReceptionParent ? (
          <Badge variant="success" className="gap-1">
            <MailCheck className="w-3 h-3" />
            Accusé de réception le {formatDate(exclusion.accuseReceptionParent)}
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={enCours !== null}
            onClick={() =>
              appeler({ accuseReception: true }, "accuse", "Accusé de réception enregistré")
            }
          >
            {enCours === "accuse" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <MailCheck className="w-3.5 h-3.5 mr-1.5" />
                Accusé de réception parent
              </>
            )}
          </Button>
        )}

        <Button
          size="sm"
          disabled={enCours !== null}
          onClick={() =>
            appeler(
              { reintegrer: true, travailDonne: travail.trim().length >= 5 ? travail : undefined },
              "reintegrer",
              "Élève réintégré"
            )
          }
        >
          {enCours === "reintegrer" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <UserCheck className="w-3.5 h-3.5 mr-1.5" />
              Réintégrer l&apos;élève
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function LigneExclusion({
  exclusion,
  onMaj,
}: {
  exclusion: Exclusion;
  onMaj: (id: string, maj: Partial<Exclusion>) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const etat = ETAT_CONFIG[exclusion.etat];
  const eleve = exclusion.incident.eleve;
  const manqueTravail = exclusion.etat !== "CLOSE" && !exclusion.travailDonne;
  const manqueAccuse = exclusion.etat !== "CLOSE" && !exclusion.accuseReceptionParent;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {eleve.prenom} {eleve.nom}
              </span>
              <span className="text-xs text-muted-foreground">{eleve.matricule}</span>
              {eleve.classe && (
                <Badge variant="outline" className="text-xs">
                  {eleve.classe.nom}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {TYPE_LABELS[exclusion.type as TypeExclusion] ?? exclusion.type} · du{" "}
              {formatDate(exclusion.dateDebut)}
              {exclusion.dateFin ? ` au ${formatDate(exclusion.dateFin)}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {exclusion.joursRetardReintegration > 0 && (
              <Badge variant="destructive" className="gap-1">
                <Clock className="w-3 h-3" />
                Retour en retard de {exclusion.joursRetardReintegration} j
              </Badge>
            )}
            {manqueTravail && (
              <Badge variant="warning" className="gap-1">
                <BookOpen className="w-3 h-3" />
                Sans travail
              </Badge>
            )}
            {manqueAccuse && (
              <Badge variant="outline" className="gap-1">
                <MailCheck className="w-3 h-3" />
                Sans accusé
              </Badge>
            )}
            <Badge variant={etat.variant} className="gap-1">
              {etat.icon}
              {etat.label}
            </Badge>
          </div>
        </div>
      </button>

      {ouvert && (
        <>
          <div className="px-4 pb-3 text-xs space-y-1 border-t pt-3">
            <div>
              <span className="font-medium text-slate-700">Incident : </span>
              <span className="text-muted-foreground">
                {exclusion.incident.type} (gravité {exclusion.incident.gravite}) du{" "}
                {formatDate(exclusion.incident.date)} — {exclusion.incident.description}
              </span>
            </div>
            {exclusion.description && (
              <div>
                <span className="font-medium text-slate-700">Motif de l&apos;exclusion : </span>
                <span className="text-muted-foreground">{exclusion.description}</span>
              </div>
            )}
            {exclusion.travailDonne && (
              <div>
                <span className="font-medium text-slate-700">Travail donné : </span>
                <span className="text-muted-foreground">{exclusion.travailDonne}</span>
              </div>
            )}
            {exclusion.dateRetourEffective && (
              <div>
                <span className="font-medium text-slate-700">Réintégré le : </span>
                <span className="text-muted-foreground">
                  {formatDate(exclusion.dateRetourEffective)}
                  {exclusion.reintegrePar ? ` par ${exclusion.reintegrePar}` : ""}
                </span>
              </div>
            )}
          </div>

          {exclusion.etat !== "CLOSE" && (
            <PanneauTraitement
              exclusion={exclusion}
              onMaj={(maj) => onMaj(exclusion.id, maj)}
            />
          )}
        </>
      )}
    </div>
  );
}

export function ExclusionsView({
  exclusions: initiales,
  classes,
  hierarchie,
  dateReference,
}: {
  exclusions: Exclusion[];
  classes: { id: string; nom: string }[];
  hierarchie?: ClassesHierarchie;
  dateReference: string;
}) {
  const [exclusions, setExclusions] = useState(initiales);
  const [filtreEtat, setFiltreEtat] = useState<EtatExclusion | "TOUTES">("EN_COURS");
  const [filtreClasse, setFiltreClasse] = useState("TOUTES");

  function majExclusion(id: string, maj: Partial<Exclusion>) {
    setExclusions((prev) => prev.map((e) => (e.id === id ? { ...e, ...maj } : e)));
  }

  const stats = useMemo(
    () => ({
      enCours: exclusions.filter((e) => e.etat === "EN_COURS").length,
      aVenir: exclusions.filter((e) => e.etat === "A_VENIR").length,
      retards: exclusions.filter((e) => e.joursRetardReintegration > 0).length,
      sansTravail: exclusions.filter((e) => e.etat !== "CLOSE" && !e.travailDonne).length,
      sansAccuse: exclusions.filter((e) => e.etat !== "CLOSE" && !e.accuseReceptionParent).length,
    }),
    [exclusions]
  );

  const visibles = useMemo(
    () =>
      exclusions.filter(
        (e) =>
          (filtreEtat === "TOUTES" || e.etat === filtreEtat) &&
          (filtreClasse === "TOUTES" || e.incident.eleve.classe?.id === filtreClasse)
      ),
    [exclusions, filtreEtat, filtreClasse]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Exclusions en cours"
          valeur={stats.enCours}
          icone={<AlertTriangle className="w-5 h-5" />}
        />
        <StatCard
          label="À venir"
          valeur={stats.aVenir}
          icone={<CalendarClock className="w-5 h-5" />}
        />
        <StatCard
          label="Retours en retard"
          valeur={stats.retards}
          icone={<Clock className="w-5 h-5" />}
          alerte
        />
        <StatCard
          label="Sans continuité pédagogique"
          valeur={stats.sansTravail}
          icone={<BookOpen className="w-5 h-5" />}
          alerte
        />
        <StatCard
          label="Sans accusé de réception"
          valeur={stats.sansAccuse}
          icone={<MailCheck className="w-5 h-5" />}
        />
      </div>

      {(stats.sansTravail > 0 || stats.retards > 0) && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="pt-5 pb-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Conformité à régulariser</p>
              <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside">
                {stats.sansTravail > 0 && (
                  <li>
                    {stats.sansTravail} exclusion(s) sans travail donné — la continuité
                    pédagogique doit être assurée pendant toute exclusion.
                  </li>
                )}
                {stats.retards > 0 && (
                  <li>
                    {stats.retards} élève(s) dont la date de fin est dépassée sans
                    réintégration enregistrée.
                  </li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Registre — {visibles.length} exclusion(s)
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <select
                value={filtreEtat}
                onChange={(e) => setFiltreEtat(e.target.value as EtatExclusion | "TOUTES")}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="EN_COURS">En cours</option>
                <option value="A_VENIR">À venir</option>
                <option value="CLOSE">Réintégrés</option>
                <option value="TOUTES">Toutes</option>
              </select>
              <select
                value={filtreClasse}
                onChange={(e) => setFiltreClasse(e.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="TOUTES">Toutes les classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            État arrêté au {formatDate(dateReference)}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucune exclusion pour ce filtre.
            </p>
          ) : (
            visibles.map((e) => (
              <LigneExclusion key={e.id} exclusion={e} onMaj={majExclusion} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
