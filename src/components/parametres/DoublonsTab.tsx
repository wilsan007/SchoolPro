"use client";

/**
 * Contrôle permanent des fiches en double.
 *
 * L'import prévient désormais en amont, mais un doublon peut toujours naître
 * d'une saisie manuelle, d'un transfert ou d'un historique antérieur. Cet
 * écran les remonte au fil de l'eau, plutôt que de les laisser se découvrir
 * en additionnant les effectifs de classe.
 *
 * Aucune suppression n'est déclenchée ici : on signale, on explique, et on
 * renvoie vers la fiche. Fusionner deux dossiers scolaires engage les notes,
 * absences et factures — cela reste une décision humaine.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, ExternalLink, ShieldCheck, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Niveau = "MATRICULE" | "IDENTITE" | "CLASSE" | "APPROCHE";

interface Fiche {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  dateNaissance: string;
  statut: string;
  classe: string | null;
  createdAt: string;
  donneesLiees: number;
  detail: { notes: number; absences: number; factures: number; bulletins: number; parents: number };
  recommandee: boolean;
}

interface Groupe {
  niveau: Niveau;
  libelle: string;
  fiches: Fiche[];
}

interface DateSuspecte {
  date: string;
  nombre: number;
  eleves: { id: string; nom: string; prenom: string; matricule: string; classe: string | null }[];
}

interface Reponse {
  groupes: Groupe[];
  datesSuspectes: DateSuspecte[];
  resume: {
    groupes: number;
    fichesConcernees: number;
    fichesEnTrop: number;
    totalAnalyse: number;
    sansDateFiable: number;
  };
}

const NIVEAU_STYLE: Record<Niveau, string> = {
  MATRICULE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  IDENTITE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  CLASSE: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300",
  APPROCHE: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function DoublonsTab() {
  const [data, setData] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/eleves/doublons");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analyse impossible");
      setData(json);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Analyse impossible");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Analyse des fiches…
      </div>
    );
  }

  if (erreur) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {erreur}
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Fiches en double</h3>
          <p className="text-sm text-muted-foreground">
            {data.resume.totalAnalyse} fiches analysées.{" "}
            {data.resume.groupes === 0
              ? "Aucun rapprochement suspect."
              : `${data.resume.groupes} rapprochement(s), ${data.resume.fichesEnTrop} fiche(s) probablement en trop.`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={charger}>
          <RefreshCw className="h-3.5 w-3.5" />
          Relancer
        </Button>
      </div>

      {/* Dates de naissance par défaut : elles ne créent pas de doublon mais
          fragilisent l'identification, puisque la clé d'unicité repose sur
          la date. */}
      {data.datesSuspectes.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <div className="flex items-start gap-2 p-4">
            <CalendarClock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {data.resume.sansDateFiable} élèves sans date de naissance réelle
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Ces fiches portent une date attribuée automatiquement par un ancien import,
                pas leur vraie date. Deux élèves de même nom et prénom deviendraient alors
                indistinguables. Renseignez la date exacte sur chaque fiche.
              </p>
              <div className="mt-2 space-y-2">
                {data.datesSuspectes.map((d) => (
                  <details key={d.date} className="text-xs">
                    <summary className="cursor-pointer font-medium">
                      {new Date(d.date).toLocaleDateString("fr-FR")} — {d.nombre} élèves
                    </summary>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.eleves.map((e) => (
                        <Link
                          key={e.id}
                          href={`/eleves/${e.id}`}
                          className="rounded border px-1.5 py-0.5 hover:bg-accent transition-colors"
                        >
                          {e.prenom} {e.nom}
                          {e.classe && <span className="text-muted-foreground"> · {e.classe}</span>}
                        </Link>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {data.groupes.length === 0 ? (
        <Card className="p-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck className="h-8 w-8 text-green-600" />
          <p className="font-medium">Aucun doublon détecté</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Les fiches sont comparées sur le matricule, l&apos;identité civile
            (nom, prénom, date de naissance), la classe, puis l&apos;orthographe.
          </p>
        </Card>
      ) : (
        data.groupes.map((g, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", NIVEAU_STYLE[g.niveau])}>
                {g.libelle}
              </span>
              <span className="text-sm font-medium">
                {g.fiches[0].prenom} {g.fiches[0].nom}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {g.fiches.length} fiches
              </span>
            </div>
            <div className="divide-y">
              {g.fiches.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{f.matricule}</span>
                      {f.recommandee && (
                        <span className="inline-flex items-center gap-1 rounded bg-green-100 dark:bg-green-950 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3" />
                          À conserver
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.classe ?? "sans classe"} · né(e) le{" "}
                      {new Date(f.dateNaissance).toLocaleDateString("fr-FR")} · créée le{" "}
                      {new Date(f.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="text-xs text-right shrink-0">
                    {f.donneesLiees === 0 ? (
                      <span className="text-muted-foreground">aucune donnée liée</span>
                    ) : (
                      <span className="font-medium">
                        {f.detail.notes > 0 && `${f.detail.notes} notes `}
                        {f.detail.absences > 0 && `${f.detail.absences} abs. `}
                        {f.detail.factures > 0 && `${f.detail.factures} fact. `}
                        {f.detail.parents > 0 && `${f.detail.parents} parent(s)`}
                      </span>
                    )}
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-7 gap-1 shrink-0">
                    <Link href={`/eleves/${f.id}`}>
                      Ouvrir <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {data.groupes.length > 0 && (
        <p className="text-xs text-muted-foreground">
          La fiche marquée « à conserver » est celle qui porte le plus de données rattachées ;
          à égalité, la plus ancienne. Vérifiez toujours avant de supprimer : les homonymes
          — jumeaux notamment — sont légitimes.
        </p>
      )}
    </div>
  );
}
