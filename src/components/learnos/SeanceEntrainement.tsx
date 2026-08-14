"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check, X, Lightbulb, Loader2, ArrowRight, Sparkles, RefreshCw, Info, BadgeCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { TexteRegle } from "@/components/learnos/TexteRegle";

/**
 * Séance d'entraînement autonome.
 *
 * DEUX RÈGLES D'INTERACTION, QUI COMMANDENT TOUT L'ÉCRAN
 * -----------------------------------------------------
 *
 * **1. Une action, un retour.** Cliquer une proposition soumet ; valider une
 * saisie soumet. Aucun bouton « confirmer » intermédiaire : doubler chaque
 * réponse d'une confirmation double le nombre de gestes d'une séance entière,
 * pour ne rien empêcher — une réponse fausse est déjà rattrapable en deux
 * essais.
 *
 * **2. Court par construction.** Une étape demande un nombre, un mot ou un
 * clic. La longueur ne mesure rien de plus que la brièveté, et une rédaction
 * ne se corrige pas sans lecteur : `SAISIE_LIBRE` n'arrive jamais ici (cf.
 * `FORMATS_AUTO_CORRIGEABLES`).
 *
 * AUCUNE CORRECTION CÔTÉ CLIENT
 * -----------------------------
 * Ce composant ne sait pas ce qui est juste : il ne reçoit jamais les réponses
 * attendues avant qu'une étape ne soit close. Corriger ici, même « juste pour
 * l'affichage », exigerait de les lui envoyer — c'est-à-dire de publier le
 * corrigé.
 */

interface Element {
  id: string;
  texte: string;
}

interface EtapeVue {
  index: number;
  enonce: string;
  format: "SAISIE_COURTE" | "CHOIX_UNIQUE" | "REMISE_EN_ORDRE" | "APPARIEMENT";
  options?: Element[];
  gauche?: Element[];
  droite?: Element[];
  indice: string | null;
  tentatives: number;
  correcte: boolean | null;
  reponse: string | null;
  corrige: string | null;
}

interface ExerciceVue {
  id: string;
  ordre: number;
  palier: string;
  format: string;
  enonce: string;
  competenceLibelle: string;
  regleDeclenchee: string;
  motifParams: Record<string, unknown> | null;
  nbEtapes: number;
  etapeCourante: number;
  termine: boolean;
  etapes: EtapeVue[];
}

interface SeanceVue {
  feuilleId: string;
  statut: string;
  termine: boolean;
  exercices: ExerciceVue[];
  ciblesSansQuestion?: { competenceId: string; palier: string }[];
}

interface ResultatEtape {
  correcte: boolean;
  tentatives: number;
  close: boolean;
  corrige: string | null;
  indice: string | null;
  exerciceTermine: boolean;
  seanceTerminee: boolean;
  score: number | null;
  maxScore: number | null;
  attestationsProposees: number;
}

interface Attestation {
  feuilleId: string;
  competenceLibelle: string | null;
}

type Etat = "chargement" | "prete" | "vide" | "erreur" | "attestation";

export function SeanceEntrainement({ eleveId }: { eleveId?: string }) {
  const t = useTranslations("learnos.entrainement");

  const [etat, setEtat] = useState<Etat>("chargement");
  const [seance, setSeance] = useState<SeanceVue | null>(null);
  const [indexExercice, setIndexExercice] = useState(0);
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [dernier, setDernier] = useState<ResultatEtape | null>(null);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  /**
   * Charge une feuille désignée — utilisé pour l'attestation lancée en classe.
   *
   * Passe par le même écran que l'entraînement : c'est le même exercice, servi
   * de la même façon. Ce qui change n'est pas l'interface mais qui l'a ouverte,
   * et donc ce que la preuve produite vaudra.
   */
  const ouvrirFeuille = useCallback(async (feuilleId: string) => {
    setEtat("chargement");
    setDernier(null);
    try {
      const res = await fetch(`/api/learnos/entrainement/${feuilleId}`);
      if (!res.ok) return setEtat("erreur");
      const data = (await res.json()) as SeanceVue;
      setSeance(data);
      setAttestation(null);
      setIndexExercice(Math.max(0, data.exercices.findIndex((e) => !e.termine)));
      setEtat("prete");
    } catch {
      setEtat("erreur");
    }
  }, []);

  const ouvrir = useCallback(async () => {
    setEtat("chargement");
    setDernier(null);

    // Une attestation lancée par l'enseignant passe AVANT l'entraînement : elle
    // se fait en classe, sur un temps compté, et c'est elle qui peut débloquer
    // ce que l'entraînement seul ne débloquera jamais.
    try {
      const att = await fetch("/api/learnos/attestations/ouvertes");
      if (att.ok) {
        const liste = (await att.json()).attestations as Attestation[];
        if (liste.length > 0) {
          setAttestation(liste[0]);
          setEtat("attestation");
          return;
        }
      }
    } catch {
      // L'entraînement ordinaire reste servi si cette vérification échoue.
    }

    try {
      const res = await fetch("/api/learnos/entrainement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eleveId }),
      });
      // 204 : rien à travailler. Ce n'est pas une panne, c'est un résultat —
      // le moteur se tait quand il n'a rien d'utile à proposer.
      if (res.status === 204) return setEtat("vide");
      if (!res.ok) return setEtat("erreur");

      const data = (await res.json()) as SeanceVue;
      setSeance(data);
      setIndexExercice(Math.max(0, data.exercices.findIndex((e) => !e.termine)));
      setEtat("prete");
    } catch {
      setEtat("erreur");
    }
  }, [eleveId]);

  useEffect(() => {
    void ouvrir();
  }, [ouvrir]);

  const exercice = seance?.exercices[indexExercice];
  const etapeCourante = exercice?.etapes.find((e) => e.index === exercice.etapeCourante);

  // Le focus suit l'étape : sans lui, chaque réponse coûte un clic de plus pour
  // revenir dans le champ — sur une séance entière, c'est la moitié des gestes.
  useEffect(() => {
    if (etapeCourante?.format === "SAISIE_COURTE") champ.current?.focus();
  }, [etapeCourante?.index, exercice?.id, etapeCourante?.format]);

  async function repondre(valeur: string) {
    if (!seance || !exercice || !etapeCourante || envoi) return;
    const brut = valeur.trim();
    if (brut === "") return;

    setEnvoi(true);
    try {
      const res = await fetch(`/api/learnos/entrainement/${seance.feuilleId}/reponse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciceId: exercice.id,
          index: etapeCourante.index,
          reponse: brut,
        }),
      });
      if (!res.ok) return setEtat("erreur");

      const resultat = (await res.json()) as ResultatEtape;
      setDernier(resultat);
      setSaisie("");

      // On relit l'état plutôt que de le recalculer localement : le serveur est
      // seul à savoir quelle étape s'ouvre ensuite, et le rejouer ici ferait
      // deux implémentations de la même règle.
      const suite = await fetch(`/api/learnos/entrainement/${seance.feuilleId}`);
      if (suite.ok) setSeance((await suite.json()) as SeanceVue);
    } catch {
      setEtat("erreur");
    } finally {
      setEnvoi(false);
    }
  }

  // ----------------------------------------------------------
  // États sans exercice
  // ----------------------------------------------------------

  if (etat === "chargement") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {t("chargement")}
      </div>
    );
  }

  if (etat === "erreur") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <p className="text-muted-foreground">{t("erreur")}</p>
          <Button onClick={() => void ouvrir()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("reessayer")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Écran d'attestation : l'enseignant vient de l'ouvrir, l'élève la voit.
  // Un écran distinct, et non un exercice de plus dans la file : ce qui se
  // joue ici n'est pas le même, et le lui cacher serait le priver du seul
  // moment où son travail autonome peut être reconnu.
  if (etat === "attestation" && attestation) {
    return (
      <Card className="border-emerald-500/40">
        <CardContent className="py-10 text-center space-y-4">
          <BadgeCheck className="h-8 w-8 mx-auto text-emerald-600" />
          <p className="font-medium">
            {t("attestationTitre", { competence: attestation.competenceLibelle ?? "" })}
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("attestationDetail")}
          </p>
          <Button onClick={() => void ouvrirFeuille(attestation.feuilleId)}>
            <ArrowRight className="h-4 w-4 mr-2" />
            {t("attestationCommencer")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (etat === "vide" || !seance || seance.exercices.length === 0) {
    const ciblesManquantes = seance?.ciblesSansQuestion ?? [];
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">{t("rienAFaire")}</p>
          {/* Le silence du moteur est une information : on l'explique, plutôt
              que de fabriquer des exercices pour remplir l'écran. */}
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("rienAFaireDetail")}
          </p>
          {/* S'il y a des cibles sans question, on le dit : l'élève n'est pas
              en cause, c'est la banque qui est vide. Sans ce message, il
              croirait que le système ne fonctionne pas. */}
          {ciblesManquantes.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 max-w-md mx-auto">
              {t("ciblesSansQuestion", { n: ciblesManquantes.length })}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Annonce des attestations déclenchées par la séance.
  //
  // Rendue ici ET dans l'écran de fin, et ce n'est pas une redondance : la
  // dernière réponse d'une feuille clôt la séance, `seance.termine` bascule, et
  // l'écran de fin remplace celui des exercices. Sans cette annonce des deux
  // côtés, le message le plus important du dispositif — « ton travail vient de
  // débloquer quelque chose » — disparaîtrait précisément à l'instant où il se
  // déclenche.
  const annonceAttestation = (dernier?.attestationsProposees ?? 0) > 0 && (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-left text-sm">
      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <p>{t("attestationDemandee", { n: dernier!.attestationsProposees })}</p>
    </div>
  );

  if (seance.termine || !exercice) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Check className="h-8 w-8 mx-auto text-emerald-500" />
            <p className="font-medium">{t("seanceTerminee")}</p>
            <Button onClick={() => void ouvrir()}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t("nouvelleSeance")}
            </Button>
          </CardContent>
        </Card>
        {annonceAttestation}
        <p className="text-xs text-muted-foreground text-center px-4">{t("mentionPoids")}</p>
      </div>
    );
  }

  const suivant = seance.exercices.findIndex((e, i) => i > indexExercice && !e.termine);
  const ciblesManquantes = seance.ciblesSansQuestion ?? [];

  return (
    <div className="space-y-4">
      {/* Avertissement si des cibles n'ont pas pu être servies : la séance est
          plus courte que prévu. L'élève doit savoir que ce n'est pas un bug. */}
      {ciblesManquantes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-amber-700 dark:text-amber-400">
            {t("ciblesSansQuestion", { n: ciblesManquantes.length })}
          </p>
        </div>
      )}

      {/* Progression : un point par exercice, sans chiffre ni pourcentage —
          l'élève a besoin de savoir combien il reste, pas de se noter. */}
      <div className="flex items-center gap-1.5">
        {seance.exercices.map((e, i) => (
          <span
            key={e.id}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              e.termine
                ? "bg-emerald-500"
                : i === indexExercice
                  ? "bg-primary"
                  : "bg-muted"
            )}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-5 space-y-5">
          {/* Pourquoi cet exercice. Jamais une phrase figée en base : une clé
              de traduction et ses paramètres (cf. TexteRegle). */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Badge variant="outline" className="text-xs">
                {exercice.competenceLibelle}
              </Badge>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3 shrink-0" />
                <TexteRegle
                  regle={exercice.regleDeclenchee}
                  params={exercice.motifParams}
                  secours={t("motifIndisponible")}
                />
              </p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t("exerciceSur", {
                n: indexExercice + 1,
                total: seance.exercices.length,
              })}
            </span>
          </div>

          <p className="font-medium leading-relaxed">{exercice.enonce}</p>

          <div className="space-y-3">
            {exercice.etapes.map((etape) => {
              const close = etape.correcte !== null;
              const active = etape.index === exercice.etapeCourante && !exercice.termine;

              return (
                <div
                  key={etape.index}
                  className={cn(
                    "rounded-lg border p-3 space-y-2.5",
                    close && etape.correcte && "border-emerald-500/40 bg-emerald-500/5",
                    close && !etape.correcte && "border-amber-500/40 bg-amber-500/5",
                    !close && !active && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {close &&
                      (etape.correcte ? (
                        <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      ))}
                    <p className="text-sm">{etape.enonce}</p>
                  </div>

                  {/* Étape close : on montre ce qui a été répondu et le corrigé.
                      Une étape ratée n'arrête pas l'exercice — c'est là que
                      l'élève apprend quelque chose. */}
                  {close && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {etape.correcte
                        ? t("reponseJuste", { reponse: etape.reponse ?? "" })
                        : t("reponseAttendue", { reponse: etape.corrige ?? "" })}
                    </p>
                  )}

                  {active && etape.format === "CHOIX_UNIQUE" && (
                    <div className="grid gap-2">
                      {etape.options?.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          disabled={envoi}
                          onClick={() => void repondre(option.id)}
                          className={cn(
                            "text-left text-sm rounded-md border px-3 py-2 transition-colors",
                            "hover:bg-accent hover:border-primary/50 disabled:opacity-50"
                          )}
                        >
                          {option.texte}
                        </button>
                      ))}
                    </div>
                  )}

                  {active && etape.format === "REMISE_EN_ORDRE" && (
                    <RemiseEnOrdre
                      elements={etape.options ?? []}
                      envoi={envoi}
                      onValider={(v) => void repondre(v)}
                    />
                  )}

                  {active && etape.format === "APPARIEMENT" && (
                    <Appariement
                      gauche={etape.gauche ?? []}
                      droite={etape.droite ?? []}
                      envoi={envoi}
                      onValider={(v) => void repondre(v)}
                    />
                  )}

                  {active && etape.format === "SAISIE_COURTE" && (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void repondre(saisie);
                      }}
                    >
                      <Input
                        ref={champ}
                        value={saisie}
                        onChange={(e) => setSaisie(e.target.value)}
                        placeholder={t("placeholderReponse")}
                        disabled={envoi}
                        // Court par construction : au-delà, ce n'est plus une
                        // réponse d'étape mais une rédaction.
                        maxLength={80}
                        autoComplete="off"
                      />
                      <Button type="submit" disabled={envoi || saisie.trim() === ""}>
                        {envoi ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("valider")
                        )}
                      </Button>
                    </form>
                  )}

                  {active && etape.tentatives > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("essaisRestants", { n: 3 - etape.tentatives })}
                    </p>
                  )}

                  {active && etape.indice && (
                    <p className="text-xs flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                      <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {etape.indice}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {exercice.termine && (
            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {dernier?.maxScore
                  ? t("scoreExercice", {
                      score: dernier.score ?? 0,
                      max: dernier.maxScore,
                    })
                  : t("exerciceTermine")}
              </p>
              {suivant >= 0 ? (
                <Button onClick={() => setIndexExercice(suivant)} size="sm">
                  {t("suivant")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={() => void ouvrir()} size="sm" variant="outline">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("nouvelleSeance")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* La contrepartie visible de l'effort. Sans ce message, le plafond posé
          sur le travail autonome serait une impasse muette : l'élève verrait
          son niveau stagner sans savoir qu'il vient de déclencher exactement ce
          qui peut le débloquer. */}
      {annonceAttestation}

      {/* Dit une fois, en bas, sans dramatiser : l'entraînement nourrit le
          profil mais ne remplace pas le travail validé en classe. Le cacher
          laisserait croire à l'élève qu'il peut se noter lui-même. */}
      <p className="text-xs text-muted-foreground text-center px-4">
        {t("mentionPoids")}
      </p>
    </div>
  );
}

/**
 * Remise en ordre — par clic, jamais par glisser-déposer.
 *
 * Le glisser-déposer est hostile au tactile, à la navigation clavier et aux
 * lecteurs d'écran, et il demanderait une bibliothèque tierce pour un gain nul
 * : l'élève clique les éléments dans l'ordre, et se dédit d'un second clic.
 * Trois gestes au lieu de trois glissés, sur tous les appareils.
 */
function RemiseEnOrdre({
  elements,
  envoi,
  onValider,
}: {
  elements: Element[];
  envoi: boolean;
  onValider: (reponse: string) => void;
}) {
  const t = useTranslations("learnos.entrainement");
  const [ordre, setOrdre] = useState<string[]>([]);

  const restants = elements.filter((e) => !ordre.includes(e.id));
  const parId = new Map(elements.map((e) => [e.id, e.texte]));

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {ordre.map((id, i) => (
          <button
            key={id}
            type="button"
            disabled={envoi}
            onClick={() => setOrdre(ordre.filter((x) => x !== id))}
            className="flex w-full items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm disabled:opacity-50"
          >
            <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
            {parId.get(id)}
          </button>
        ))}
      </div>

      {restants.length > 0 && (
        <div className="space-y-1.5">
          {restants.map((element) => (
            <button
              key={element.id}
              type="button"
              disabled={envoi}
              onClick={() => setOrdre([...ordre, element.id])}
              className="w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50"
            >
              {element.texte}
            </button>
          ))}
        </div>
      )}

      {restants.length === 0 && (
        <Button
          disabled={envoi}
          onClick={() => {
            onValider(ordre.join("|"));
            setOrdre([]);
          }}
        >
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : t("valider")}
        </Button>
      )}
    </div>
  );
}

/**
 * Appariement — un clic à gauche, un clic à droite.
 *
 * Deux colonnes plutôt que N listes déroulantes : la liste déroulante cache les
 * choix restants, et l'élève perd la vue d'ensemble qui est précisément ce que
 * l'exercice travaille.
 */
function Appariement({
  gauche,
  droite,
  envoi,
  onValider,
}: {
  gauche: Element[];
  droite: Element[];
  envoi: boolean;
  onValider: (reponse: string) => void;
}) {
  const t = useTranslations("learnos.entrainement");
  const [selection, setSelection] = useState<string | null>(null);
  const [paires, setPaires] = useState<Record<string, string>>({});

  const droitesPrises = new Set(Object.values(paires));
  const complet = Object.keys(paires).length === gauche.length;

  function choisirDroite(idDroite: string) {
    if (!selection) return;
    setPaires({ ...paires, [selection]: idDroite });
    setSelection(null);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          {gauche.map((element) => {
            const appariee = paires[element.id];
            return (
              <button
                key={element.id}
                type="button"
                disabled={envoi}
                onClick={() =>
                  appariee
                    ? // Un second clic défait la paire : se corriger ne doit
                      // pas coûter une tentative.
                      setPaires(Object.fromEntries(
                        Object.entries(paires).filter(([g]) => g !== element.id)
                      ))
                    : setSelection(selection === element.id ? null : element.id)
                }
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50",
                  selection === element.id && "border-primary bg-primary/10",
                  appariee && "border-emerald-500/50 bg-emerald-500/5"
                )}
              >
                {element.texte}
                {appariee && (
                  <span className="block text-xs text-muted-foreground">
                    → {droite.find((d) => d.id === appariee)?.texte}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          {droite.map((element) => (
            <button
              key={element.id}
              type="button"
              disabled={envoi || droitesPrises.has(element.id) || !selection}
              onClick={() => choisirDroite(element.id)}
              className={cn(
                "w-full rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                droitesPrises.has(element.id)
                  ? "opacity-40"
                  : selection
                    ? "hover:border-primary/50 hover:bg-accent"
                    : "opacity-70"
              )}
            >
              {element.texte}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {selection ? t("choisirDroite") : complet ? "" : t("choisirGauche")}
      </p>

      {complet && (
        <Button
          disabled={envoi}
          onClick={() => {
            onValider(
              Object.entries(paires)
                .map(([g, d]) => `${g}:${d}`)
                .join("|")
            );
            setPaires({});
          }}
        >
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : t("valider")}
        </Button>
      )}
    </div>
  );
}
