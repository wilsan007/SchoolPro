"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, Check, FileUp, Loader2, ScanLine, Trash2, UserCheck, Quote,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { texteErreur } from "@/lib/erreurs-client";
import { cn } from "@/lib/utils";

/**
 * Exercices sur papier — de la feuille scannée à la notation enregistrée.
 *
 * DEUX ÉCRANS, PARCE QUE CE SONT DEUX MOMENTS
 * -------------------------------------------
 * La feuille d'énoncés est scannée une fois, avant distribution ; les copies le
 * sont après correction, parfois une semaine plus tard. Les mettre dans un même
 * formulaire laisserait croire à une opération unique et obligerait l'enseignant
 * à retrouver un état perdu entre-temps.
 *
 * CE QUE CET ÉCRAN REFUSE DE FAIRE À VOTRE PLACE
 * ----------------------------------------------
 * **Le rattachement aux compétences** est proposé, jamais appliqué seul : une
 * proposition lexicale se trompe, et une preuve rangée sous la mauvaise
 * compétence fausse le suivi d'un élève sans que rien ne le signale.
 *
 * **L'élève d'une copie** n'est pas deviné en cas d'homonymie : le champ reste à
 * choisir. Écrire la note d'un élève dans le dossier d'un autre est une erreur
 * qu'on ne rattrape pas.
 *
 * **Une note hors barème** n'est pas ramenée au barème : elle est signalée. C'est
 * presque toujours « 1/5 » lu « 7/5 », et seul l'enseignant sait lequel.
 */
export function CopiesPapier({
  matieres,
  classes,
}: {
  matieres: { id: string; nom: string }[];
  classes: { id: string; nom: string }[];
}) {
  const t = useTranslations("learnos.copies");

  return (
    <Tabs defaultValue="enonces" className="space-y-4">
      <TabsList>
        <TabsTrigger value="enonces" className="gap-1.5">
          <FileUp className="h-3.5 w-3.5" />
          {t("ongletEnonces")}
        </TabsTrigger>
        <TabsTrigger value="copies" className="gap-1.5">
          <ScanLine className="h-3.5 w-3.5" />
          {t("ongletCopies")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="enonces">
        <ScanEnonces matieres={matieres} classes={classes} />
      </TabsContent>
      <TabsContent value="copies">
        <ScanNotes matieres={matieres} classes={classes} />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================
// Rapport de lecture — commun aux deux écrans
// ============================================================

interface RapportOcr {
  moteur: string;
  confiance: number | null;
  pagesLues: number;
  pagesTotal: number;
  pagesIgnorees: boolean;
  modele: string | null;
}

/**
 * Dit *comment* le document a été lu.
 *
 * Ce n'est pas un détail technique : entre une couche texte exacte, un OCR local
 * à 62 % de confiance et un modèle de vision, ce qu'il faut vérifier n'est pas le
 * même. Le taire ferait accorder au résultat une confiance qu'il n'a pas.
 */
function RapportLecture({ ocr }: { ocr: RapportOcr | null }) {
  const t = useTranslations("learnos.copies");
  if (!ocr) return null;

  return (
    <p className="text-xs text-muted-foreground">
      {t(`moteur_${ocr.moteur}`)}
      {ocr.confiance !== null && ` · ${t("confiance", { valeur: Math.round(ocr.confiance * 100) })}`}
      {ocr.modele && ` · ${ocr.modele}`}
      {ocr.pagesIgnorees && (
        <span className="text-amber-700 dark:text-amber-400">
          {" · "}
          {t("pagesIgnorees", { lues: ocr.pagesLues, total: ocr.pagesTotal })}
        </span>
      )}
    </p>
  );
}

// ============================================================
// Écran 1 — la feuille d'énoncés
// ============================================================

interface ExercicePropose {
  numero: number;
  enonce: string;
  bareme: number;
  baremeLu: boolean;
  competenceId: string | null;
  score: number;
}

interface CompetenceOption {
  id: string;
  code: string;
  libelle: string;
  chapitre: string | null;
}

function ScanEnonces({
  matieres,
  classes,
}: {
  matieres: { id: string; nom: string }[];
  classes: { id: string; nom: string }[];
}) {
  const t = useTranslations("learnos.copies");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");

  const [enCours, demarrer] = useTransition();
  const [matiereId, setMatiereId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [nature, setNature] = useState<"manuscrit" | "imprime">("manuscrit");
  const [texte, setTexte] = useState("");
  const [exercices, setExercices] = useState<ExercicePropose[] | null>(null);
  const [competences, setCompetences] = useState<CompetenceOption[]>([]);
  const [ocr, setOcr] = useState<RapportOcr | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  function reinitialiser() {
    setExercices(null);
    setTexte("");
    setOcr(null);
    if (champFichier.current) champFichier.current.value = "";
  }

  async function traiter(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));
    setExercices(data.exercices ?? []);
    setCompetences(data.competences ?? []);
    setOcr(data.ocr ?? null);
    if ((data.exercices ?? []).length === 0) toast.info(t("aucunExercice"));
  }

  function analyserFichier(fichier: File) {
    if (!matiereId) {
      toast.error(t("matiereRequise"));
      return;
    }
    demarrer(async () => {
      try {
        const form = new FormData();
        form.append("matiereId", matiereId);
        form.append("nature", nature);
        form.append("fichier", fichier);
        await traiter(
          await fetch("/api/learnos/copies/enonces", { method: "POST", body: form })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function analyserTexte() {
    if (!matiereId || texte.trim().length < 10) {
      toast.error(t("texteRequis"));
      return;
    }
    demarrer(async () => {
      try {
        await traiter(
          await fetch("/api/learnos/copies/enonces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matiereId, texte }),
          })
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function distribuer() {
    if (!exercices || !classeId) {
      toast.error(t("classeRequise"));
      return;
    }
    // Un exercice sans compétence ne produirait aucune preuve : la feuille
    // existerait, la notation serait saisie, et rien n'en sortirait. Autant le
    // dire avant l'écriture.
    const sansCompetence = exercices.filter((e) => !e.competenceId);
    if (sansCompetence.length > 0) {
      toast.error(t("competenceRequise", { nb: sansCompetence.length }));
      return;
    }

    demarrer(async () => {
      try {
        const res = await fetch("/api/learnos/copies/enonces", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matiereId,
            classeId,
            exercices: exercices.map((e) => ({
              numero: e.numero,
              enonce: e.enonce,
              bareme: e.bareme,
              competenceId: e.competenceId,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        toast.success(
          t("distribuee", {
            eleves: (data.feuilles ?? []).length,
            exercices: data.questionsCreees ?? 0,
          })
        );
        for (const ignore of data.ignores ?? []) {
          toast.info(t("eleveIgnore", { eleve: ignore.eleveId }));
        }
        reinitialiser();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function maj(i: number, patch: Partial<ExercicePropose>) {
    setExercices((prev) => (prev ? prev.map((e, k) => (k === i ? { ...e, ...patch } : e)) : prev));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">{t("aideEnonces")}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("matiere")}</Label>
            <Select value={matiereId} onValueChange={setMatiereId}>
              <SelectTrigger>
                <SelectValue placeholder={t("choisir")} />
              </SelectTrigger>
              <SelectContent>
                {matieres.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("classe")}</Label>
            <Select value={classeId} onValueChange={setClasseId}>
              <SelectTrigger>
                <SelectValue placeholder={t("choisir")} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("nature")}</Label>
            <Select
              value={nature}
              onValueChange={(v) => setNature(v as "manuscrit" | "imprime")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manuscrit">{t("natureManuscrit")}</SelectItem>
                <SelectItem value="imprime">{t("natureImprime")}</SelectItem>
              </SelectContent>
            </Select>
            {/* Dit pourquoi la question est posée : le moteur local est gratuit
                et ne lit pas l'écriture manuscrite. */}
            <p className="text-xs text-muted-foreground">{t("natureAide")}</p>
          </div>
        </div>

        {exercices === null ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="copie-fichier">{t("fichier")}</Label>
              <Input
                id="copie-fichier"
                ref={champFichier}
                type="file"
                accept="application/pdf,image/*"
                disabled={enCours}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) analyserFichier(f);
                }}
              />
              <p className="text-xs text-muted-foreground">{t("fichierAide")}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t("ou")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Textarea
              rows={6}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder={t("textePlaceholder")}
            />
            <Button onClick={analyserTexte} disabled={enCours} className="w-full">
              {enCours ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ScanLine className="mr-1.5 h-4 w-4" />
              )}
              {t("analyser")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <RapportLecture ocr={ocr} />

            {exercices.map((exercice, i) => (
              <div
                key={i}
                className={cn(
                  "space-y-2 rounded-lg border p-3",
                  !exercice.competenceId &&
                    "border-amber-300 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t("numero", { n: exercice.numero })}</Badge>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">{t("bareme")}</Label>
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={exercice.bareme}
                      onChange={(e) => maj(i, { bareme: Number(e.target.value) })}
                      className="w-20"
                    />
                  </div>
                  {/* Un barème supposé se distingue d'un barème lu : c'est celui
                      qu'il faut vérifier. */}
                  {!exercice.baremeLu && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                    >
                      {t("baremeSuppose")}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() =>
                      setExercices((prev) => (prev ? prev.filter((_, k) => k !== i) : prev))
                    }
                    aria-label={t("retirer")}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <Textarea
                  rows={2}
                  value={exercice.enonce}
                  onChange={(e) => maj(i, { enonce: e.target.value })}
                />

                <div className="space-y-1">
                  <Label className="text-xs">{t("competence")}</Label>
                  <Select
                    value={exercice.competenceId ?? ""}
                    onValueChange={(v) => maj(i, { competenceId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("competenceAChoisir")} />
                    </SelectTrigger>
                    <SelectContent>
                      {competences.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.libelle}
                          {c.chapitre ? ` (${c.chapitre})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {exercice.competenceId && exercice.score > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Quote className="h-3 w-3" />
                      {t("propose", { score: Math.round(exercice.score * 100) })}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={reinitialiser} disabled={enCours}>
                {t("recommencer")}
              </Button>
              <Button onClick={distribuer} disabled={enCours || exercices.length === 0}>
                {enCours ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                {t("distribuer")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Écran 2 — les copies corrigées
// ============================================================

interface Anomalie {
  motif: string;
  numero?: number;
  params?: Record<string, string | number>;
}

interface FeuilleEnAttente {
  feuilleId: string;
  eleveId: string;
  nom: string;
  exercices: { exerciceId: string; numero: number; bareme: number }[];
}

interface LectureCopie {
  nomLu: string;
  feuilleId: string | null;
  eleve: { id: string; nom: string; confiance: number } | null;
  candidats: { eleveId: string; nom: string; confiance: number; feuilleId: string | null }[];
  notes: { exerciceId: string; numero: number; points: number; bareme: number; extrait: string }[];
  anomalies: Anomalie[];
  feuilles: FeuilleEnAttente[];
  ocr: RapportOcr;
}

function ScanNotes({
  matieres,
  classes,
}: {
  matieres: { id: string; nom: string }[];
  classes: { id: string; nom: string }[];
}) {
  const t = useTranslations("learnos.copies");
  const tc = useTranslations("learnos.commun");
  const te = useTranslations("learnos.erreurs");

  const [enCours, demarrer] = useTransition();
  const [matiereId, setMatiereId] = useState("");
  const [classeId, setClasseId] = useState("");
  const [lecture, setLecture] = useState<LectureCopie | null>(null);
  const [feuilleId, setFeuilleId] = useState("");
  const [points, setPoints] = useState<Record<string, string>>({});
  const champFichier = useRef<HTMLInputElement>(null);

  const feuille = useMemo(
    () => lecture?.feuilles.find((f) => f.feuilleId === feuilleId) ?? null,
    [lecture, feuilleId]
  );

  function reinitialiser() {
    setLecture(null);
    setFeuilleId("");
    setPoints({});
    if (champFichier.current) champFichier.current.value = "";
  }

  function analyser(fichier: File) {
    if (!classeId) {
      toast.error(t("classeRequise"));
      return;
    }
    demarrer(async () => {
      try {
        const form = new FormData();
        form.append("classeId", classeId);
        if (matiereId) form.append("matiereId", matiereId);
        form.append("fichier", fichier);
        const res = await fetch("/api/learnos/copies/notes", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        setLecture(data);
        setFeuilleId(data.feuilleId ?? "");
        setPoints(
          Object.fromEntries(
            (data.notes ?? []).map((n: { exerciceId: string; points: number }) => [
              n.exerciceId,
              String(n.points),
            ])
          )
        );
        if (!data.feuilleId) toast.info(t("eleveADesigner"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  function enregistrer() {
    if (!feuille) {
      toast.error(t("eleveADesigner"));
      return;
    }
    const notes = feuille.exercices
      .map((e) => ({ exerciceId: e.exerciceId, points: Number(points[e.exerciceId]) }))
      // Un exercice laissé vide n'est pas noté 0 : il n'est pas noté. Écrire un
      // zéro à la place inventerait un échec qu'on n'a pas observé.
      .filter((n) => Number.isFinite(n.points));

    if (notes.length === 0) {
      toast.error(t("aucuneNote"));
      return;
    }

    demarrer(async () => {
      try {
        const res = await fetch("/api/learnos/copies/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feuilleId: feuille.feuilleId, notes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(texteErreur(data, te, tc("erreurServeur")));

        toast.success(
          t("enregistree", {
            eleve: feuille.nom,
            score: data.score ?? 0,
            max: data.maxScore ?? 0,
          })
        );
        reinitialiser();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : tc("erreur"));
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">{t("aideCopies")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("classe")}</Label>
            <Select value={classeId} onValueChange={setClasseId}>
              <SelectTrigger>
                <SelectValue placeholder={t("choisir")} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("matiereFacultative")}</Label>
            <Select value={matiereId} onValueChange={setMatiereId}>
              <SelectTrigger>
                <SelectValue placeholder={t("toutesMatieres")} />
              </SelectTrigger>
              <SelectContent>
                {matieres.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {lecture === null ? (
          <div className="space-y-1.5">
            <Label htmlFor="copie-scan">{t("fichierCopie")}</Label>
            <Input
              id="copie-scan"
              ref={champFichier}
              type="file"
              accept="application/pdf,image/*"
              disabled={enCours}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) analyser(f);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("fichierCopieAide")}</p>
            {enCours && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("lectureEnCours")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <RapportLecture ocr={lecture.ocr} />

            <div className="space-y-1.5">
              <Label>{t("eleve")}</Label>
              <Select value={feuilleId} onValueChange={setFeuilleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("eleveADesigner")} />
                </SelectTrigger>
                <SelectContent>
                  {lecture.feuilles.map((f) => (
                    <SelectItem key={f.feuilleId} value={f.feuilleId}>
                      {f.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserCheck className="h-3 w-3" />
                {lecture.nomLu
                  ? t("nomLu", { nom: lecture.nomLu })
                  : t("nomNonLu")}
                {lecture.eleve &&
                  ` · ${t("confianceAppariement", {
                    valeur: Math.round(lecture.eleve.confiance * 100),
                  })}`}
              </p>
            </div>

            {lecture.anomalies.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  {t("anomalies")}
                </p>
                <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                  {lecture.anomalies.map((a, i) => (
                    <li key={i}>
                      {t(`anomalie_${a.motif}`, {
                        numero: a.numero ?? 0,
                        ...(a.params ?? {}),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {feuille && (
              <div className="space-y-2">
                {feuille.exercices.map((exercice) => {
                  const lu = lecture.notes.find((n) => n.exerciceId === exercice.exerciceId);
                  return (
                    <div
                      key={exercice.exerciceId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
                    >
                      <Badge variant="secondary">{t("numero", { n: exercice.numero })}</Badge>
                      <Input
                        type="number"
                        min={0}
                        max={exercice.bareme}
                        step={0.25}
                        value={points[exercice.exerciceId] ?? ""}
                        placeholder={t("nonNote")}
                        onChange={(e) =>
                          setPoints((prev) => ({
                            ...prev,
                            [exercice.exerciceId]: e.target.value,
                          }))
                        }
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">/ {exercice.bareme}</span>
                      {/* La ligne lue sur la copie, à côté de la note : c'est ce
                          qui rend la vérification possible sans rouvrir le scan. */}
                      {lu?.extrait && (
                        <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">
                          « {lu.extrait} »
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={reinitialiser} disabled={enCours}>
                {t("recommencer")}
              </Button>
              <Button onClick={enregistrer} disabled={enCours || !feuille}>
                {enCours ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                {t("enregistrer")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
