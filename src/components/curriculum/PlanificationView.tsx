"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarRange, Wand2, Copy, Save, Loader2, AlertTriangle,
  Info, CircleSlash, Layers, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";
import {
  repartirEgalement,
  detecterAnomalies,
  decalerAPartirDe,
  ecartsDePlanification,
  calendrierHebdomadaire,
  semainesEnseignees,
  repartirCompetences,
  plageEffectiveCompetence,
  type Anomalie,
  type EvenementCalendaire,
} from "@/lib/learnos/planification-pure";

interface Competence {
  id: string;
  code: string;
  libelle: string;
  ordre: number;
}

interface Chapitre {
  id: string;
  nom: string;
  niveau: string;
  matiereId: string;
  ordre: number;
  semaineDebut: number | null;
  semaineFin: number | null;
  semaineDebutInitiale: number | null;
  statut: string;
  competences: Competence[];
}

interface Props {
  matieres: { id: string; nom: string; couleur: string | null }[];
  chapitres: Chapitre[];
  anneeId: string | null;
  anneeLibelle: string | null;
  totalSemaines: number;
  semaineCourante: number;
  peutModifier: boolean;
  evenementsCalendaires?: { type: string; libelle: string; dateDebut: Date; dateFin: Date }[];
  debutAnnee?: Date | null;
  planificationsCompetences?: { competenceId: string; semaineDebut: number; semaineFin: number }[];
}

/** Répartition en cours d'édition, indexée par chapitre. */
type Brouillon = Record<string, { debut: number; fin: number }>;

export function PlanificationView({
  matieres,
  chapitres,
  anneeId,
  anneeLibelle,
  totalSemaines,
  semaineCourante,
  peutModifier,
  evenementsCalendaires,
  debutAnnee,
  planificationsCompetences,
}: Props) {
  const t = useTranslations("learnos.planification");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [matiereActive, setMatiereActive] = useState(matieres[0]?.id ?? "");
  // Niveaux distincts présents dans les chapitres — triés du plus élevé au
  // plus bas par ordre alphabétique inversé (Terminale > Première > Seconde…)
  const niveaux = useMemo(
    () => [...new Set(chapitres.map((c) => c.niveau))].sort((a, b) => b.localeCompare(a)),
    [chapitres]
  );
  const [niveauActif, setNiveauActif] = useState<string>("TOUS");

  const [brouillon, setBrouillon] = useState<Brouillon>(() =>
    Object.fromEntries(
      chapitres
        .filter((c) => c.semaineDebut !== null && c.semaineFin !== null)
        .map((c) => [c.id, { debut: c.semaineDebut!, fin: c.semaineFin! }])
    )
  );

  // --- Planification des compétences ---
  // Brouillon des compétences : indexé par competenceId → {debut, fin}.
  // Une compétence absente du brouillon hérite de la plage de son chapitre.
  const [brouillonComp, setBrouillonComp] = useState<Record<string, { debut: number; fin: number }>>(
    () => Object.fromEntries(
      (planificationsCompetences ?? []).map((p) => [
        p.competenceId,
        { debut: p.semaineDebut, fin: p.semaineFin },
      ])
    )
  );
  // Chapitre dont les compétences sont actuellement dépliées.
  const [chapitreDeplie, setChapitreDeplie] = useState<string | null>(null);

  const chapitresMatiere = useMemo(
    () =>
      chapitres
        .filter((c) => c.matiereId === matiereActive)
        .filter((c) => niveauActif === "TOUS" || c.niveau === niveauActif)
        .sort((a, b) => a.ordre - b.ordre),
    [chapitres, matiereActive, niveauActif]
  );

  const planifies = useMemo(
    () =>
      chapitresMatiere
        .filter((c) => brouillon[c.id])
        .map((c) => ({
          chapitreId: c.id,
          nom: c.nom,
          semaineDebut: brouillon[c.id].debut,
          semaineFin: brouillon[c.id].fin,
        })),
    [chapitresMatiere, brouillon]
  );

  const anomalies = useMemo(
    () => detecterAnomalies(planifies, totalSemaines),
    [planifies, totalSemaines]
  );

  const ecarts = useMemo(
    () =>
      ecartsDePlanification(
        chapitresMatiere.map((c) => ({
          chapitreId: c.id,
          nom: c.nom,
          semaineDebut: brouillon[c.id]?.debut ?? c.semaineDebut ?? 0,
          semaineDebutInitiale: c.semaineDebutInitiale,
          statut: c.statut,
        }))
      ),
    [chapitresMatiere, brouillon]
  );

  const couverture = useMemo(() => {
    const semaines = new Set<number>();
    for (const p of planifies) {
      for (let s = p.semaineDebut; s <= p.semaineFin; s++) semaines.add(s);
    }
    return Math.round((semaines.size / totalSemaines) * 100);
  }, [planifies, totalSemaines]);

  // Calendrier scolaire : semaines non enseignées (vacances, examens, jours fériés).
  const cal = useMemo(() => {
    if (!debutAnnee || !evenementsCalendaires || evenementsCalendaires.length === 0) {
      return null;
    }
    const evs: EvenementCalendaire[] = evenementsCalendaires.map((e) => ({
      type: e.type as EvenementCalendaire["type"],
      dateDebut: new Date(e.dateDebut),
      dateFin: new Date(e.dateFin),
    }));
    return calendrierHebdomadaire(debutAnnee, totalSemaines, evs);
  }, [debutAnnee, evenementsCalendaires, totalSemaines]);

  const semainesEnseigneesListe = useMemo(() => {
    if (!debutAnnee || !evenementsCalendaires || evenementsCalendaires.length === 0) {
      return undefined;
    }
    const evs: EvenementCalendaire[] = evenementsCalendaires.map((e) => ({
      type: e.type as EvenementCalendaire["type"],
      dateDebut: new Date(e.dateDebut),
      dateFin: new Date(e.dateFin),
    }));
    return semainesEnseignees(debutAnnee, totalSemaines, evs);
  }, [debutAnnee, evenementsCalendaires, totalSemaines]);

  function repartirAuto() {
    if (chapitresMatiere.length === 0) {
      toast.error(t("aucunChapitre"));
      return;
    }
    const proposition = repartirEgalement(
      chapitresMatiere.map((c) => c.id),
      totalSemaines,
      1,
      semainesEnseigneesListe
    );
    setBrouillon((b) => ({
      ...b,
      ...Object.fromEntries(
        proposition.map((p) => [p.chapitreId, { debut: p.semaineDebut, fin: p.semaineFin }])
      ),
    }));
    const nbSemainesUtilisees = semainesEnseigneesListe?.length ?? totalSemaines;
    toast.success(
      t("repartitionFaite", { n: proposition.length, semaines: nbSemainesUtilisees })
    );
  }

  /**
   * Répartit TOUTES les matières d'un coup et sauvegarde automatiquement.
   * L'utilisateur n'a pas à cliquer 14 fois "Répartir" + "Enregistrer" par matière.
   */
  function repartirEtSauvegarderTout() {
    if (!anneeId) {
      toast.error(t("aucuneAnnee"));
      return;
    }
    // Grouper les chapitres par matière.
    const parMatiere = new Map<string, typeof chapitres>();
    for (const c of chapitres) {
      const liste = parMatiere.get(c.matiereId) ?? [];
      liste.push(c);
      parMatiere.set(c.matiereId, liste);
    }

    // Construire le brouillon complet pour toutes les matières.
    const nouveauBrouillon: Brouillon = {};
    let totalChapitres = 0;
    for (const [, liste] of parMatiere) {
      const proposition = repartirEgalement(
        liste.map((c) => c.id),
        totalSemaines,
        1,
        semainesEnseigneesListe
      );
      for (const p of proposition) {
        nouveauBrouillon[p.chapitreId] = { debut: p.semaineDebut, fin: p.semaineFin };
      }
      totalChapitres += proposition.length;
    }

    if (totalChapitres === 0) {
      toast.error(t("aucunChapitre"));
      return;
    }

    // Mettre à jour le brouillon local.
    setBrouillon((b) => ({ ...b, ...nouveauBrouillon }));

    // Sauvegarder automatiquement toutes les matières d'un coup.
    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/planification", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anneeId,
            lignes: chapitres
              .filter((c) => nouveauBrouillon[c.id])
              .map((c) => ({
                chapitreId: c.id,
                semaineDebut: nouveauBrouillon[c.id].debut,
                semaineFin: nouveauBrouillon[c.id].fin,
              })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
        toast.success(t("repartitionFaite", { n: totalChapitres, semaines: totalSemaines }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  /** Décale ce chapitre et tous les suivants — voir `decalerAPartirDe`. */
  function decaler(chapitreId: string, semaines: number) {
    const proposition = decalerAPartirDe(planifies, chapitreId, semaines, totalSemaines);
    if (proposition.length === 0) return;
    setBrouillon((b) => ({
      ...b,
      ...Object.fromEntries(
        proposition.map((p) => [p.chapitreId, { debut: p.semaineDebut, fin: p.semaineFin }])
      ),
    }));
    toast.success(t("decaleDe", { n: proposition.length, semaines }));
  }

  /** Avancement réel — distinct des dates, qui restent ajustables. */
  function marquerStatut(chapitreId: string, statut: string) {
    if (!anneeId) return;
    demarrer(async () => {
      try {
        const res = await fetch(`/api/curriculum/planification/${chapitreId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anneeId, statut }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(texteErreur(data, te, tc("erreurServeur")));
        }
        toast.success(t("avancementEnregistre"));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function ajuster(chapitreId: string, champ: "debut" | "fin", valeur: number) {
    setBrouillon((b) => {
      const actuel = b[chapitreId] ?? { debut: 1, fin: 1 };
      const suivant = { ...actuel, [champ]: valeur };
      // Garder la fin après le début évite une frise incohérente, et le
      // serveur refuserait de toute façon l'enregistrement.
      if (champ === "debut" && suivant.fin < valeur) suivant.fin = valeur;
      if (champ === "fin" && valeur < suivant.debut) suivant.debut = valeur;
      return { ...b, [chapitreId]: suivant };
    });
  }

  function enregistrer() {
    if (!anneeId) {
      toast.error(t("aucuneAnnee"));
      return;
    }
    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/planification", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anneeId,
            lignes: chapitresMatiere
              .filter((c) => brouillon[c.id])
              .map((c) => ({
                chapitreId: c.id,
                semaineDebut: brouillon[c.id].debut,
                semaineFin: brouillon[c.id].fin,
              })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
        toast.success(t("enregistree", { n: data.count }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  // --- Compétences : répartition automatique et sauvegarde ---

  function repartirCompetencesChapitre(chapitre: Chapitre) {
    const plage = brouillon[chapitre.id];
    if (!plage || chapitre.competences.length === 0) return;
    const proposition = repartirCompetences(
      chapitre.competences.map((c) => c.id),
      plage.debut,
      plage.fin,
      semainesEnseigneesListe
    );
    setBrouillonComp((b) => ({
      ...b,
      ...Object.fromEntries(
        proposition.map((p) => [p.competenceId, { debut: p.semaineDebut, fin: p.semaineFin }])
      ),
    }));
    toast.success(t("competencesReparties", { n: proposition.length }));
  }

  function ajusterCompetence(competenceId: string, champ: "debut" | "fin", valeur: number) {
    setBrouillonComp((b) => {
      const actuel = b[competenceId] ?? { debut: 1, fin: 1 };
      const suivant = { ...actuel, [champ]: valeur };
      if (champ === "debut" && suivant.fin < valeur) suivant.fin = valeur;
      if (champ === "fin" && valeur < suivant.debut) suivant.debut = valeur;
      return { ...b, [competenceId]: suivant };
    });
  }

  function enregistrerCompetences(chapitre: Chapitre) {
    if (!anneeId) {
      toast.error(t("aucuneAnnee"));
      return;
    }
    const lignes = chapitre.competences
      .filter((c) => brouillonComp[c.id])
      .map((c) => ({
        competenceId: c.id,
        semaineDebut: brouillonComp[c.id].debut,
        semaineFin: brouillonComp[c.id].fin,
      }));
    demarrer(async () => {
      try {
        const res = await fetch("/api/curriculum/planification-competences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anneeId, lignes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
        toast.success(t("competencesEnregistrees", { n: data.count }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  if (!anneeId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{t("aucuneAnnee")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("aucuneAnneeAide")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-sm text-blue-900 dark:text-blue-200">
          <p className="font-medium">{t("pourquoiTitre")}</p>
          <p className="mt-1 opacity-90">
            {t("pourquoiTexte")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {matieres.map((m) => (
            <button
              key={m.id}
              onClick={() => setMatiereActive(m.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                matiereActive === m.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {m.nom}
            </button>
          ))}
          {/* Filtre par niveau — un même programme peut couvrir plusieurs
              niveaux (ex : français 6ème à Terminale). Sans ce filtre,
              l'enseignant voit tous les chapitres de tous les niveaux mélangés
              sur la même frise, ce qui rend la planification illisible. */}
          {niveaux.length > 1 && (
            <Select value={niveauActif} onValueChange={setNiveauActif}>
              <SelectTrigger className="w-[160px] h-9">
                <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOUS">{t("tousNiveaux")}</SelectItem>
                {niveaux.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Badge variant="outline">
          {t("entete", { annee: anneeLibelle ?? "", semaines: totalSemaines, courante: semaineCourante })}
        </Badge>
      </div>

      {chapitresMatiere.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("aucunChapitre")}
          </CardContent>
        </Card>
      ) : (
        <>
          {peutModifier && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={repartirAuto} disabled={enCours}>
                <Wand2 className="mr-1.5 h-4 w-4" />
                {t("repartirAuto")}
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={repartirEtSauvegarderTout}
                disabled={enCours}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {enCours ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1.5 h-4 w-4" />
                )}
                {t("toutRepartir")}
              </Button>
              <Button size="sm" variant="outline" onClick={enregistrer} disabled={enCours}>
                {enCours ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {tc("enregistrer")}
              </Button>
              <span className="ml-auto text-sm text-muted-foreground">
                {t("couverture", { pct: couverture })}
              </span>
            </div>
          )}

          {/* Frise — c'est elle qui rend trous et chevauchements évidents,
              là où un tableau de dates les cache. */}
          <Card>
            <CardContent className="space-y-2 overflow-x-auto p-4">
              <div className="min-w-[640px] space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-48 shrink-0" />
                  <div className="relative h-4 flex-1">
                    {[1, 9, 18, 27, 36].filter((s) => s <= totalSemaines).map((s) => (
                      <span
                        key={s}
                        className="absolute text-[10px] text-muted-foreground"
                        style={{ left: `${((s - 1) / totalSemaines) * 100}%` }}
                      >
                        S{s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bande calendaire : vacances (gris hachuré), examens (rouge),
                    jours fériés (ambre). C'est le repère visuel qui empêche
                    de placer un chapitre sur une semaine sans cours. */}
                {cal && (
                  <div className="flex items-center gap-2">
                    <div className="w-48 shrink-0 text-xs text-muted-foreground">
                      {t("calendrier")}
                    </div>
                    <div className="relative h-4 flex-1 rounded bg-muted/50">
                      {cal.map((s) => {
                        if (s.enseignee) return null;
                        const couleur =
                          s.evenement === "VACANCE_SCOLAIRE"
                            ? "bg-slate-300 dark:bg-slate-700"
                            : s.evenement === "EXAMEN"
                            ? "bg-red-300 dark:bg-red-900"
                            : "bg-amber-300 dark:bg-amber-900";
                        return (
                          <div
                            key={s.numero}
                            className={"absolute top-0 h-full " + couleur}
                            style={{
                              left: `${((s.numero - 1) / totalSemaines) * 100}%`,
                              width: `${(1 / totalSemaines) * 100}%`,
                            }}
                            title={t(`type_${s.evenement}`)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {chapitresMatiere.map((c) => {
                  const plage = brouillon[c.id];
                  const matiere = matieres.find((m) => m.id === c.matiereId);
                  const deplie = chapitreDeplie === c.id;
                  const aCompetences = c.competences.length > 0;
                  return (
                    <div key={c.id} className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <button
                          className={
                            "w-48 shrink-0 truncate text-left text-sm " +
                            (aCompetences ? "cursor-pointer hover:text-primary" : "")
                          }
                          title={c.nom}
                          onClick={() => aCompetences && setChapitreDeplie(deplie ? null : c.id)}
                        >
                          {aCompetences && (
                            <span className="mr-1 inline-block w-3 text-muted-foreground">
                              {deplie ? "▾" : "▸"}
                            </span>
                          )}
                          {c.nom}
                        </button>
                        <div className="relative h-6 flex-1 rounded bg-muted">
                          {/* Repère de la semaine courante : situe l'avancement réel. */}
                          <div
                            className="absolute top-0 h-full w-px bg-foreground/40"
                            style={{ left: `${((semaineCourante - 1) / totalSemaines) * 100}%` }}
                          />
                          {plage && (
                            <div
                              className="absolute top-0 h-full rounded"
                              style={{
                                left: `${((plage.debut - 1) / totalSemaines) * 100}%`,
                                width: `${((plage.fin - plage.debut + 1) / totalSemaines) * 100}%`,
                                backgroundColor: matiere?.couleur ?? "hsl(var(--primary))",
                                opacity: 0.85,
                              }}
                              title={`S${plage.debut} → S${plage.fin}`}
                            />
                          )}
                        </div>
                        {peutModifier && (
                          <div className="flex shrink-0 items-center gap-1">
                            <select
                              className="h-7 rounded border bg-background px-1 text-xs"
                              value={c.statut}
                              onChange={(e) => marquerStatut(c.id, e.target.value)}
                              disabled={enCours}
                              title={t(`statut${c.statut}`)}
                            >
                              <option value="PREVU">{t("statutPREVU")}</option>
                              <option value="EN_COURS">{t("statutEN_COURS")}</option>
                              <option value="TRAITE">{t("statutTRAITE")}</option>
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-1.5"
                              onClick={() => decaler(c.id, 1)}
                              disabled={enCours || !plage}
                              title={t("decalerAide")}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              max={totalSemaines}
                              className="h-7 w-16 text-xs"
                              value={plage?.debut ?? ""}
                              placeholder={t("debut")}
                              onChange={(e) =>
                                ajuster(c.id, "debut", Math.max(1, Number(e.target.value) || 1))
                              }
                            />
                            <span className="text-xs text-muted-foreground">→</span>
                            <Input
                              type="number"
                              min={1}
                              max={totalSemaines}
                              className="h-7 w-16 text-xs"
                              value={plage?.fin ?? ""}
                              placeholder={t("fin")}
                              onChange={(e) =>
                                ajuster(c.id, "fin", Math.max(1, Number(e.target.value) || 1))
                              }
                            />
                          </div>
                        )}
                      </div>

                      {/* Sous-barres de compétences : dépliées au clic sur le
                          nom du chapitre. Chaque compétence a sa propre plage,
                          qui surcharge la plage héritée du chapitre. */}
                      {deplie && aCompetences && (
                        <div className="space-y-0.5 rounded bg-muted/30 p-1.5">
                          {peutModifier && plage && (
                            <div className="mb-1 flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => repartirCompetencesChapitre(c)}
                                disabled={enCours}
                              >
                                <Wand2 className="mr-1 h-3 w-3" />
                                {t("repartirCompetences")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => enregistrerCompetences(c)}
                                disabled={enCours}
                              >
                                <Save className="mr-1 h-3 w-3" />
                                {t("enregistrerCompetences")}
                              </Button>
                            </div>
                          )}
                          {c.competences.map((cp) => {
                            const plageChapitre = plage
                              ? { debut: plage.debut, fin: plage.fin }
                              : { debut: 1, fin: 1 };
                            const plageEff = plageEffectiveCompetence(
                              cp.id,
                              plageChapitre,
                              Object.entries(brouillonComp).map(([competenceId, v]) => ({
                                competenceId,
                                semaineDebut: v.debut,
                                semaineFin: v.fin,
                              }))
                            );
                            const explicite = !!brouillonComp[cp.id];
                            return (
                              <div key={cp.id} className="flex items-center gap-2">
                                <span
                                  className="w-48 shrink-0 truncate text-xs text-muted-foreground"
                                  title={cp.libelle}
                                >
                                  {cp.code}
                                </span>
                                <div className="relative h-4 flex-1 rounded bg-muted/50">
                                  <div
                                    className="absolute top-0 h-full rounded-sm"
                                    style={{
                                      left: `${((plageEff.debut - 1) / totalSemaines) * 100}%`,
                                      width: `${((plageEff.fin - plageEff.debut + 1) / totalSemaines) * 100}%`,
                                      backgroundColor: matiere?.couleur ?? "hsl(var(--primary))",
                                      opacity: explicite ? 0.7 : 0.35,
                                    }}
                                    title={`S${plageEff.debut} → S${plageEff.fin}${explicite ? "" : " (héritée)"}`}
                                  />
                                </div>
                                {peutModifier && (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Input
                                      type="number"
                                      min={1}
                                      max={totalSemaines}
                                      className="h-6 w-14 text-xs"
                                      value={brouillonComp[cp.id]?.debut ?? ""}
                                      placeholder={String(plageEff.debut)}
                                      onChange={(e) =>
                                        ajusterCompetence(cp.id, "debut", Math.max(1, Number(e.target.value) || 1))
                                      }
                                    />
                                    <span className="text-xs text-muted-foreground">→</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={totalSemaines}
                                      className="h-6 w-14 text-xs"
                                      value={brouillonComp[cp.id]?.fin ?? ""}
                                      placeholder={String(plageEff.fin)}
                                      onChange={(e) =>
                                        ajusterCompetence(cp.id, "fin", Math.max(1, Number(e.target.value) || 1))
                                      }
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {ecarts.length > 0 && (
            <Card>
              <CardContent className="space-y-1.5 p-4">
                <p className="font-medium">{t("ecartTitre")}</p>
                {/* Un écart n'est pas une faute : le dire évite qu'il soit lu
                    comme un reproche. */}
                <p className="text-xs text-muted-foreground">{t("ecartAide")}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {ecarts.map((e) => (
                    <li key={e.chapitreId} className={e.semainesDeRetard > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}>
                      {e.semainesDeRetard > 0
                        ? t("ecartLigne", { nom: e.nom, n: e.semainesDeRetard })
                        : t("ecartAvance", { nom: e.nom, n: -e.semainesDeRetard })}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {anomalies.length > 0 && (
            <div className="space-y-2">
              {anomalies.map((a, i) => (
                <AnomalieLigne key={i} anomalie={a} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnomalieLigne({
  anomalie,
  t,
}: {
  anomalie: Anomalie;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const trou = anomalie.type === "trou";
  const plage =
    anomalie.semaineDebut === anomalie.semaineFin
      ? t("semaine", { n: anomalie.semaineDebut })
      : t("semaines", { debut: anomalie.semaineDebut, fin: anomalie.semaineFin });

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm",
        trou
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      )}
    >
      {trou ? (
        <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      )}
      <p className={trou ? "text-amber-900 dark:text-amber-200" : "text-red-900 dark:text-red-200"}>
        {trou
          ? t("trou", { plage })
          : t("chevauchement", { plage, chapitres: anomalie.chapitres.join(" / ") })}
      </p>
    </div>
  );
}

export interface AlerteUI {
  chapitreNom: string;
  matiereNom: string;
  semaineDebut: number;
  semainesAvant: number;
  classeNom: string | null;
  prerequisManquants: {
    competenceId: string;
    libelle: string;
    eleves: { id: string; nom: string; prenom: string }[];
  }[];
}

/** Bandeau des alertes anticipatives — le vrai produit de la planification. */
export function AlertesAnticipees({ alertes }: { alertes: AlerteUI[] }) {
  if (alertes.length === 0) return null;
  return <AlertesAnticipeesContenu alertes={alertes} />;
}

function AlertesAnticipeesContenu({ alertes }: { alertes: AlerteUI[] }) {
  const t = useTranslations("learnos.planification");

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        {t("aAnticiper")}
      </h3>
      {alertes.map((a, i) => (
        <Card key={i} className="border-l-4 border-l-orange-500">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.chapitreNom}</span>
              <Badge variant="outline">{a.matiereNom}</Badge>
              {a.classeNom && <Badge variant="secondary">{a.classeNom}</Badge>}
              <span className="text-sm text-muted-foreground">
                {t("demarreDans", { semaine: a.semaineDebut, n: a.semainesAvant })}
              </span>
            </div>
            {a.prerequisManquants.map((p) => (
              <div key={p.competenceId} className="text-sm">
                <p>{t("elevesSansPrerequis", { n: p.eleves.length, libelle: p.libelle })}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.eleves.slice(0, 8).map((e) => `${e.prenom} ${e.nom}`).join(", ")}
                  {p.eleves.length > 8 && t("etAutres", { n: p.eleves.length - 8 })}
                </p>
              </div>
            ))}
            <p className="text-sm font-medium">
              {t("prevoirRemiseNiveau")}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
