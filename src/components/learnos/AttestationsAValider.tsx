"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Check, X, Loader2, Info, Play } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";

interface Attestation {
  id: string;
  /** Déjà signée : il ne reste qu'à la lancer, élève devant soi. */
  signee: boolean;
  creeeLe: string;
  nbExercices: number;
  competence: { libelle: string; code: string } | null;
  matiere: { nom: string; couleur: string | null } | null;
  eleve: { id: string; nom: string; prenom: string; classe: { nom: string } | null };
  profil: {
    masteryScore: number;
    confidenceScore: number;
    evidenceCount: number;
  } | null;
}

/**
 * Attestations en attente de signature.
 *
 * CE QUE CET ÉCRAN DEMANDE VRAIMENT
 * ---------------------------------
 * Pas « validez-vous ce résultat ? » — l'enseignant n'a rien vu — mais
 * « acceptez-vous d'aller vérifier ? ». La nuance commande tout l'affichage :
 * on montre le nombre de séances derrière la demande et le niveau estimé,
 * parce que c'est ce qui permet de juger si la demande vaut le temps de classe
 * qu'elle coûtera. Un simple « untel a réussi » n'apprendrait rien.
 *
 * Écarter est un geste normal, pas un échec du système : un enseignant qui sait
 * que l'élève n'y est pas doit pouvoir le dire sans que la demande revienne
 * le lendemain.
 */
export function AttestationsAValider() {
  const t = useTranslations("learnos.attestations");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");

  const [attestations, setAttestations] = useState<Attestation[] | null>(null);
  const [traitees, setTraitees] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    let annule = false;
    fetch("/api/learnos/attestations")
      .then((r) => (r.ok ? r.json() : { attestations: [] }))
      .then((d) => {
        if (!annule) setAttestations(d.attestations ?? []);
      })
      .catch(() => {
        if (!annule) setAttestations([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  function decider(id: string, decision: "valider" | "ecarter" | "demarrer") {
    demarrer(async () => {
      try {
        const res = await fetch(`/api/learnos/attestations/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        // Une signature ne retire pas la ligne : elle reste à lancer en classe.
        // La faire disparaître ferait perdre de vue ce qu'il reste à faire.
        if (decision !== "valider") setTraitees((s) => new Set(s).add(id));
        else {
          setAttestations((liste) =>
            (liste ?? []).map((a) => (a.id === id ? { ...a, signee: true } : a))
          );
        }
        toast.success(
          t(
            decision === "valider" ? "validee" : decision === "demarrer" ? "lancee" : "ecartee"
          )
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  // Le silence vaut mieux qu'un bloc vide : rien à signer n'est pas une
  // information dont un enseignant a besoin chaque matin.
  if (!attestations) return null;
  const restantes = attestations.filter((a) => !traitees.has(a.id));
  if (restantes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {t("titre")}
            <Badge variant="secondary">{restantes.length}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">{t("sousTitre")}</p>
        </div>
      </div>

      {restantes.map((a) => (
        <Card key={a.id} className="border-l-4 border-l-amber-500">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/eleves/${a.eleve.id}`} className="font-medium hover:underline">
                {a.eleve.prenom} {a.eleve.nom}
              </Link>
              {a.eleve.classe && <Badge variant="outline">{a.eleve.classe.nom}</Badge>}
              {a.matiere && <Badge variant="secondary">{a.matiere.nom}</Badge>}
              {a.signee && (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
                  {t("acceptee")}
                </Badge>
              )}
            </div>

            <p className="text-sm">
              {t("demande", { competence: a.competence?.libelle ?? "" })}
            </p>

            {/* Le chiffre qui permet de décider : combien de travail il y a
                derrière la demande, et à quel point le système en est sûr. */}
            {a.profil && (
              <p className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {t("appui", {
                  seances: a.profil.evidenceCount,
                  niveau: Math.round(a.profil.masteryScore * 100),
                  fiabilite: Math.round(a.profil.confidenceScore * 100),
                })}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("contenu", { n: a.nbExercices })}
              </p>
              {/* Deux gestes séparés, et c'est le cœur du dispositif : accepter
                  n'ouvre PAS la feuille à l'élève. Seul « lancer » le fait, et
                  il se clique en classe, élève devant soi — sans quoi on
                  produirait une preuve dite supervisée sans supervision. */}
              <div className="flex gap-2">
                {a.signee ? (
                  <Button
                    size="sm"
                    onClick={() => decider(a.id, "demarrer")}
                    disabled={enCours}
                  >
                    {enCours ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-4 w-4" />
                    )}
                    {t("lancerMaintenant")}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decider(a.id, "valider")}
                      disabled={enCours}
                    >
                      {enCours ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 h-4 w-4" />
                      )}
                      {t("accepter")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decider(a.id, "ecarter")}
                      disabled={enCours}
                      title={t("ecarterAide")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">{t("noteBas")}</p>
    </section>
  );
}
