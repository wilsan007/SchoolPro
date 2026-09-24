"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Users, CheckCheck, RotateCcw, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import type { ClassesHierarchie } from "@/lib/classes-hierarchie";
import {
  creneauxHoraires, estHeureValide, heureEnMinutes, jourDepuisDate, type CreneauAppel,
} from "@/lib/absences/appel-creneaux";

interface Eleve {
  id: string;
  nom: string;
  prenom: string;
  photoUrl: string | null;
  sexe: string;
  matricule: string;
}

interface Classe {
  id: string;
  nom: string;
  niveau: string;
  eleves: Eleve[];
}

type Presence = "present" | "absent" | "retard" | null;

export interface CreneauEdt {
  classeId: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
  matiere: string;
  /** Bornes "AAAA-MM-JJ" de la période ciblée ; null = toute l'année. */
  periodeDebut: string | null;
  periodeFin: string | null;
}

/** "AAAA-MM-JJ" dans le fuseau du navigateur. */
function dateLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function heureLocale(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Créneaux proposés pour une classe un jour donné : l'EDT s'il existe, sinon des heures pleines. */
function creneauxDuJour(edt: CreneauEdt[], classeId: string, dateJour: string): { creneaux: CreneauAppel[]; depuisEdt: boolean } {
  const jour = jourDepuisDate(dateJour);
  const vus = new Set<string>();
  const creneaux: CreneauAppel[] = [];
  for (const c of edt) {
    if (c.classeId !== classeId || c.jour !== jour) continue;
    if (c.periodeDebut && c.periodeFin && (dateJour < c.periodeDebut || dateJour > c.periodeFin)) continue;
    const cle = `${c.heureDebut}-${c.heureFin}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    creneaux.push({ heureDebut: c.heureDebut, heureFin: c.heureFin, matiere: c.matiere, salle: c.salle });
  }
  creneaux.sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  return creneaux.length > 0 ? { creneaux, depuisEdt: true } : { creneaux: creneauxHoraires(), depuisEdt: false };
}

/** Créneau en cours à l'heure donnée, sinon null (journée entière). */
function creneauEnCours(creneaux: CreneauAppel[], heure: string): CreneauAppel | null {
  const m = heureEnMinutes(heure);
  return creneaux.find((c) => m >= heureEnMinutes(c.heureDebut) && m < heureEnMinutes(c.heureFin)) ?? null;
}

export function AppelInterface({
  classes,
  tenantId,
  hierarchie,
  creneauxEdt = [],
  maintenantISO,
  canWrite,
}: {
  classes: Classe[];
  tenantId: string;
  hierarchie?: ClassesHierarchie;
  creneauxEdt?: CreneauEdt[];
  /** Horloge de référence (Time Machine en démo). */
  maintenantISO?: string;
  /**
   * `absences:write` du rôle connecté. Faux ⇒ l'écran se rend en **consultation
   * seule** : ni bouton de validation, ni « tous présents », ni sélection de
   * présence. La route `/absences` est ouverte à des rôles qui ne font que
   * lire (NURSE) : leur montrer un formulaire complet pour répondre 403 à
   * l'envoi était le défaut corrigé ici.
   */
  canWrite: boolean;
}) {
  const t = useTranslations("absences");
  const locale = useLocale();
  const maintenant = useMemo(() => (maintenantISO ? new Date(maintenantISO) : new Date()), [maintenantISO]);
  const aujourdHui = dateLocale(maintenant);

  const [selectedClasseId, setSelectedClasseId] = useState<string>(
    classes[0]?.id ?? ""
  );
  const [dateJour, setDateJour] = useState(aujourdHui);
  const [creneau, setCreneau] = useState<CreneauAppel | null>(() =>
    classes[0] ? creneauEnCours(creneauxDuJour(creneauxEdt, classes[0].id, aujourdHui).creneaux, heureLocale(maintenant)) : null
  );
  const [presences, setPresences] = useState<Record<string, Presence>>({});
  const [heuresArrivee, setHeuresArrivee] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  const selectedClasse = classes.find((c) => c.id === selectedClasseId);
  const eleves = selectedClasse?.eleves ?? [];
  const { creneaux, depuisEdt } = useMemo(
    () => creneauxDuJour(creneauxEdt, selectedClasseId, dateJour),
    [creneauxEdt, selectedClasseId, dateJour]
  );
  const libelleJour = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${dateJour}T12:00:00Z`));
  const libelleCreneau = creneau ? `${creneau.heureDebut}–${creneau.heureFin}` : t("appelFullDay");

  const stats = {
    total: eleves.length,
    presents: Object.values(presences).filter((p) => p === "present").length,
    absents: Object.values(presences).filter((p) => p === "absent").length,
    retards: Object.values(presences).filter((p) => p === "retard").length,
    nonSaisis: eleves.filter((e) => !presences[e.id]).length,
  };

  function setPresence(eleveId: string, status: Presence) {
    // Ceinture et bretelles : l'interface désactive déjà les boutons, et
    // l'API revérifie `absences:write`. Une seule règle, trois barrières.
    if (!canWrite) return;
    setPresences((prev) => ({ ...prev, [eleveId]: status }));
    if (status === "retard" && creneau && !heuresArrivee[eleveId]) {
      // Pré-remplit avec l'heure courante quand l'appel porte sur le créneau en cours.
      const h = heureLocale(new Date());
      const m = heureEnMinutes(h);
      if (dateJour === dateLocale(new Date()) && m > heureEnMinutes(creneau.heureDebut) && m <= heureEnMinutes(creneau.heureFin)) {
        setHeuresArrivee((prev) => ({ ...prev, [eleveId]: h }));
      }
    }
  }

  /** Nouvelle séance (classe, jour ou créneau) : on repart d'une feuille vierge. */
  function nouvelleSeance(classeId: string, jour: string, c: CreneauAppel | null) {
    setSelectedClasseId(classeId);
    setDateJour(jour);
    setCreneau(c);
    setPresences({});
    setHeuresArrivee({});
    setSubmitted(false);
  }

  function changerClasseOuJour(classeId: string, jour: string) {
    const { creneaux: dispo } = creneauxDuJour(creneauxEdt, classeId, jour);
    // Garde le même horaire s'il existe encore, sinon le créneau en cours si c'est aujourd'hui.
    const meme = creneau ? dispo.find((c) => c.heureDebut === creneau.heureDebut) ?? null : null;
    const suivant = meme ?? (jour === aujourdHui ? creneauEnCours(dispo, heureLocale(maintenant)) : null);
    nouvelleSeance(classeId, jour, suivant);
  }

  function marquerTousPresents() {
    const all: Record<string, Presence> = {};
    eleves.forEach((e) => { all[e.id] = "present"; });
    setPresences(all);
  }

  function reset() {
    setPresences({});
    setHeuresArrivee({});
    setSubmitted(false);
  }

  /** Heures d'arrivée des élèves effectivement en retard, ou null si l'une est invalide. */
  function heuresArriveeValides(): Record<string, string> | null {
    if (!creneau) return {};
    const out: Record<string, string> = {};
    for (const [eleveId, h] of Object.entries(heuresArrivee)) {
      if (presences[eleveId] !== "retard" || !h) continue;
      const m = heureEnMinutes(h);
      if (!estHeureValide(h) || m <= heureEnMinutes(creneau.heureDebut) || m > heureEnMinutes(creneau.heureFin)) return null;
      out[eleveId] = h;
    }
    return out;
  }

  async function soumettre() {
    if (!canWrite) return;
    if (stats.nonSaisis > 0) {
      toast.warning(t("appelNotSetWarn", { count: stats.nonSaisis }));
      return;
    }
    const arrivees = heuresArriveeValides();
    if (!arrivees) {
      toast.warning(t("appelArrivalInvalid", { debut: creneau?.heureDebut ?? "", fin: creneau?.heureFin ?? "" }));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/absences/appel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classeId: selectedClasseId,
            presences,
            date: dateJour,
            heureDebut: creneau?.heureDebut ?? null,
            heureFin: creneau?.heureFin ?? null,
            retardsHeureArrivee: arrivees,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof data.error === "string" ? data.error : t("appelError"));
          return;
        }
        setSubmitted(true);
        toast.success(data.message ?? t("appelSuccess"));
      } catch {
        toast.error(t("appelError"));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {/* Sélection de classe */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t("appelClasses")}</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <div className="space-y-1">
              {classes.map((classe) => (
                <button
                  key={classe.id}
                  onClick={() => changerClasseOuJour(classe.id, dateJour)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    selectedClasseId === classe.id
                      ? "bg-primary text-white"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span>{classe.nom}</span>
                  <Badge
                    variant={selectedClasseId === classe.id ? "outline" : "secondary"}
                    className={cn("text-xs", selectedClasseId === classe.id && "border-white/50 text-white")}
                  >
                    {classe.eleves.length}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Récap */}
        {eleves.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">{t("appelSummary")}</p>
              {[
                { label: t("appelTotal"), value: stats.total, color: "text-foreground" },
                { label: t("appelPresents"), value: stats.presents, color: "text-green-600 dark:text-green-400" },
                { label: t("appelAbsents"), value: stats.absents, color: "text-red-500 dark:text-red-400" },
                { label: t("appelRetards"), value: stats.retards, color: "text-yellow-600 dark:text-yellow-400" },
                { label: t("appelNotSet"), value: stats.nonSaisis, color: "text-muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Interface appel */}
      <div className="lg:col-span-3">
        {!selectedClasse ? (
          <Card className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">{t("appelSelectClass")}</p>
          </Card>
        ) : submitted ? (
          <Card className="h-64 flex flex-col items-center justify-center gap-4">
            <CheckCheck className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold">{t("appelSaved")}</p>
              <p className="text-sm text-muted-foreground first-letter:uppercase">
                {selectedClasse.nom} · {libelleJour} · {libelleCreneau}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("appelSummaryLine", { presents: stats.presents, absents: stats.absents, retards: stats.retards })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" /> {t("appelRedo")}
            </Button>
          </Card>
        ) : (
          <Card>
            {/* Consultation seule : le rôle n'a pas `absences:write`. On le dit
                une fois, plutôt que de laisser un formulaire actif répondre 403
                au moment de l'envoi. */}
            {!canWrite && (
              <p className="border-b bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground sm:px-5">
                {t("appelReadOnly")}
              </p>
            )}
            {/* En-tête */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold">{selectedClasse.nom}</h2>
                <p className="text-sm text-muted-foreground">{t("appelStudents", { count: eleves.length })}</p>
              </div>
              {canWrite && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="gap-2" onClick={marquerTousPresents}>
                    <Users className="h-4 w-4" />
                    {t("appelAllPresent")}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={soumettre}
                    disabled={isPending}
                  >
                    <CheckCheck className="h-4 w-4" />
                    {isPending ? t("appelSubmitting") : t("appelSubmit")}
                  </Button>
                </div>
              )}
            </div>

            {/* Séance : jour + créneau */}
            <div className="px-4 sm:px-5 py-4 border-b space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  {t("appelDate")}
                </label>
                <Input
                  type="date"
                  value={dateJour}
                  max={aujourdHui}
                  onChange={(e) => e.target.value && changerClasseOuJour(selectedClasseId, e.target.value)}
                  className="h-9 w-full sm:w-44"
                  aria-label={t("appelDate")}
                />
                <span className="text-sm text-muted-foreground first-letter:uppercase">{libelleJour}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t("appelSlot")}
                  {!depuisEdt && <span className="ml-1 font-normal">— {t("appelNoTimetable")}</span>}
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("appelSlot")}>
                  {[null, ...creneaux].map((c) => {
                    const actif = c ? creneau?.heureDebut === c.heureDebut : creneau === null;
                    return (
                      <button
                        key={c ? c.heureDebut : "journee"}
                        type="button"
                        role="radio"
                        aria-checked={actif}
                        onClick={() => nouvelleSeance(selectedClasseId, dateJour, c)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors text-left",
                          actif
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted text-foreground"
                        )}
                      >
                        <span className="tabular-nums">{c ? `${c.heureDebut}–${c.heureFin}` : t("appelFullDay")}</span>
                        {c?.matiere && (
                          <span className={cn("block text-[11px] font-normal", actif ? "text-primary-foreground/80" : "text-muted-foreground")}>
                            {c.matiere}{c.salle ? ` · ${c.salle}` : ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Grille élèves */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eleves.map((eleve) => {
                const status = presences[eleve.id] ?? null;
                return (
                  <div
                    key={eleve.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                      status === "present" && "border-green-400 bg-green-50 dark:bg-green-900/10",
                      status === "absent" && "border-red-400 bg-red-50 dark:bg-red-900/10",
                      status === "retard" && "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10",
                      !status && "border-border bg-background hover:border-muted-foreground/30"
                    )}
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      {eleve.photoUrl && <AvatarImage src={eleve.photoUrl} />}
                      <AvatarFallback className="text-xs bg-muted font-semibold">
                        {getInitials(`${eleve.prenom} ${eleve.nom}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {eleve.prenom} {eleve.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">{eleve.matricule}</p>
                      {status === "retard" && creneau && (
                        <label className="mt-1 flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                          {t("appelArrivalTime")}
                          <input
                            type="time"
                            value={heuresArrivee[eleve.id] ?? ""}
                            min={creneau.heureDebut}
                            max={creneau.heureFin}
                            onChange={(e) => setHeuresArrivee((prev) => ({ ...prev, [eleve.id]: e.target.value }))}
                            className="h-6 rounded-md border border-yellow-400 bg-background px-1 tabular-nums text-foreground"
                            aria-label={t("appelArrivalTimeFor", { nom: `${eleve.prenom} ${eleve.nom}` })}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPresence(eleve.id, "present")}
                        disabled={!canWrite}
                        title={t("appelPresent")}
                        className={cn(
                          "p-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50",
                          status === "present"
                            ? "bg-green-500 text-white"
                            : "hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30"
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPresence(eleve.id, "retard")}
                        disabled={!canWrite}
                        title={t("appelLate")}
                        className={cn(
                          "p-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50",
                          status === "retard"
                            ? "bg-yellow-500 text-white"
                            : "hover:bg-yellow-100 text-yellow-600 dark:hover:bg-yellow-900/30"
                        )}
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPresence(eleve.id, "absent")}
                        disabled={!canWrite}
                        title={t("appelAbsentTitle")}
                        className={cn(
                          "p-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50",
                          status === "absent"
                            ? "bg-red-500 text-white"
                            : "hover:bg-red-100 text-red-600 dark:hover:bg-red-900/30"
                        )}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
